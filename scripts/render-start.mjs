import './sites-env.mjs';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Miniflare, Log, LogLevel } from 'miniflare';
import { managerAuth, safeReturn, trustedHeaders } from './render-auth.mjs';

const root = resolve(import.meta.dirname, '..');
const state = resolve(root, '.sites-runtime/render-state');
const auth = managerAuth(process.env.ADMIN_PASSWORD, process.env.ADMIN_SESSION_SECRET);
const port = Number(process.env.PORT || 10000);
await mkdir(state, { recursive: true });
const serverRoot = resolve(root, 'dist/server');
const modules = (await readdir(serverRoot, { recursive: true }))
  .filter((file) => /\.(m?js|wasm)$/.test(file))
  .sort((a, b) => a === 'index.js' ? -1 : b === 'index.js' ? 1 : a.localeCompare(b))
  .map((file) => ({ type: file.endsWith('.wasm') ? 'CompiledWasm' : 'ESModule', path: resolve(serverRoot, file) }));
const worker = new Miniflare({
  host: '127.0.0.1', port: 0, cf: false,
  log: new Log(LogLevel.ERROR),
  modules, modulesRoot: serverRoot,
  compatibilityDate: '2026-05-15', compatibilityFlags: ['nodejs_compat'],
  d1Databases: { DB: 'feedback-demo' }, d1Persist: resolve(state, 'db'),
  r2Buckets: { BUCKET: 'feedback-photos' }, r2Persist: resolve(state, 'photos'),
  bindings: { ADMIN_EMAILS: 'manager@feedback-drive.local', AUTH_MODE: 'password' },
  assets: { directory: resolve(root, 'dist/client'), routerConfig: { has_user_worker: true } },
});
await worker.ready;
const db = await worker.getD1Database('DB');
await db.prepare('CREATE TABLE IF NOT EXISTS render_migrations (name TEXT PRIMARY KEY)').run();
for (const file of (await readdir(resolve(root, 'drizzle'))).filter((file) => file.endsWith('.sql')).sort()) {
  if (await db.prepare('SELECT name FROM render_migrations WHERE name = ?').bind(file).first()) continue;
  const sql = await readFile(resolve(root, 'drizzle', file), 'utf8');
  const statements = sql.split('--> statement-breakpoint').map((part) => part.trim()).filter(Boolean).map((part) => db.prepare(part));
  await db.batch([...statements, db.prepare('INSERT INTO render_migrations (name) VALUES (?)').bind(file)]);
}

const labels = {
  en: ['Manager access', 'Enter your manager password to review feedback.', 'Password', 'Sign in', 'Back to feedback', 'Incorrect password. Please try again.'],
  kn: ['ವ್ಯವಸ್ಥಾಪಕರ ಪ್ರವೇಶ', 'ಪ್ರತಿಕ್ರಿಯೆ ಪರಿಶೀಲಿಸಲು ನಿಮ್ಮ ವ್ಯವಸ್ಥಾಪಕರ ಪಾಸ್‌ವರ್ಡ್ ನಮೂದಿಸಿ.', 'ಪಾಸ್‌ವರ್ಡ್', 'ಸೈನ್ ಇನ್', 'ಪ್ರತಿಕ್ರಿಯೆಗೆ ಹಿಂತಿರುಗಿ', 'ಪಾಸ್‌ವರ್ಡ್ ತಪ್ಪಾಗಿದೆ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.'],
  hi: ['प्रबंधक प्रवेश', 'फ़ीडबैक की समीक्षा करने के लिए प्रबंधक पासवर्ड दर्ज करें।', 'पासवर्ड', 'साइन इन', 'फ़ीडबैक पर वापस जाएँ', 'गलत पासवर्ड। फिर से प्रयास करें।'],
  ja: ['管理者ログイン', 'フィードバックを確認するには管理者パスワードを入力してください。', 'パスワード', 'ログイン', 'フィードバックに戻る', 'パスワードが違います。もう一度お試しください。'],
};
function loginPage(failed = false) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Manager · Feedback Drive</title><style>:root{color-scheme:light dark;--bg:#f8f7f4;--fg:#242729;--card:#fff;--line:#ddd}html[data-theme=dark]{--bg:#16191b;--fg:#f3f2ef;--card:#212527;--line:#414649}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px system-ui;min-height:100vh;display:grid;place-items:center;padding:24px}main{width:100%;max-width:420px;background:var(--card);border:1px solid var(--line);border-radius:24px;padding:36px}h1{font-size:28px;letter-spacing:-1px}p{line-height:1.6;opacity:.75}label{display:block;margin:24px 0 8px}input,button{font:inherit;width:100%;padding:14px;border-radius:12px}input{border:1px solid var(--line);background:var(--bg);color:var(--fg)}button{margin:16px 0;background:#ec5d3b;border:0;color:white;cursor:pointer}a{color:inherit;font-size:14px}.error{color:#df5135}</style></head><body><main><h1 id="title">Manager access</h1><p id="intro">Enter your manager password to review feedback.</p><form method="post"><label for="password" id="label">Password</label><input id="password" name="password" type="password" maxlength="256" autocomplete="current-password" required autofocus>${failed ? '<p class="error" id="error">Incorrect password. Please try again.</p>' : ''}<button id="submit">Sign in</button></form><a href="/" id="back">Back to feedback</a></main><script>const labels=${JSON.stringify(labels)};let p={};try{p=JSON.parse(localStorage.getItem('fd-preferences')||'{}')}catch{};const l=labels[p.language]||labels.en;document.documentElement.lang=p.language||'en';document.documentElement.dataset.theme=p.theme|| (matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light');['title','intro','label','submit','back','error'].forEach((id,i)=>{const e=document.getElementById(id);if(e)e.textContent=l[i]});</script></body></html>`;
}
const attempts = new Map();
function reply(response, status, body, headers = {}) {
  response.writeHead(status, { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
  response.end(body);
}
async function bodyBytes(request, maximum) {
  const parts = []; let length = 0;
  for await (const part of request) { length += part.length; if (length > maximum) throw Object.assign(new Error('Request too large'), { status: 413 }); parts.push(part); }
  return Buffer.concat(parts);
}
const server = createServer(async (request, response) => {
  try {
    const origin = process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`;
    const url = new URL(request.url, origin);
    const ip = process.env.RENDER ? String(request.headers['x-forwarded-for'] || request.socket.remoteAddress).split(',').pop().trim() : request.socket.remoteAddress || 'local';
    const secure = origin.startsWith('https:') ? '; Secure' : '';
    if (url.pathname === '/api/health') return reply(response, 200, '{"ok":true,"storage":"temporary"}', { 'Content-Type': 'application/json' });
    if (url.pathname === '/signin-with-chatgpt') {
      if (request.method === 'GET') return reply(response, 200, loginPage(), { 'Content-Type': 'text/html; charset=utf-8' });
      if (request.method !== 'POST') return reply(response, 405, 'Method not allowed');
      if (request.headers.origin !== url.origin || request.headers['sec-fetch-site'] === 'cross-site') return reply(response, 403, 'Invalid sign-in origin');
      const time = Date.now();
      for (const [key, record] of attempts) if (record.expires <= time) attempts.delete(key);
      const record = attempts.get(ip) || { count: 0, expires: time + 15 * 60 * 1000 };
      if (record.count >= 10) return reply(response, 429, 'Too many sign-in attempts. Try again in 15 minutes.');
      record.count++; attempts.set(ip, record);
      const form = new URLSearchParams((await bodyBytes(request, 4096)).toString());
      if (!auth.checkPassword(form.get('password'))) return reply(response, 401, loginPage(true), { 'Content-Type': 'text/html; charset=utf-8' });
      attempts.delete(ip);
      return reply(response, 303, '', { Location: safeReturn(url.searchParams.get('return_to')), 'Set-Cookie': `fd_manager=${auth.issue()}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${secure}` });
    }
    if (url.pathname === '/signout-with-chatgpt') return reply(response, 303, '', { Location: '/', 'Set-Cookie': `fd_manager=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}` });
    const headers = trustedHeaders(request.headers, auth.verify(request.headers.cookie), ip);
    const body = ['GET', 'HEAD'].includes(request.method) ? undefined : await bodyBytes(request, 6 * 1024 * 1024);
    const result = await worker.dispatchFetch(url.toString(), { method: request.method, headers, ...(body ? { body } : {}), redirect: 'manual' });
    response.writeHead(result.status, Object.fromEntries(result.headers));
    if (request.method === 'HEAD' || !result.body) response.end();
    else Readable.fromWeb(result.body).pipe(response);
  } catch (error) {
    console.error('Render request failed:', error.message);
    if (!response.headersSent) reply(response, error.status || 500, 'Could not complete this request. Please try again.');
    else response.destroy();
  }
});
server.listen(port, '0.0.0.0', () => console.log(`Feedback Drive listening on ${port}; demo storage is temporary.`));
async function shutdown() { server.close(); await worker.dispose(); process.exit(0); }
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
