import './sites-env.mjs';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Miniflare, Log, LogLevel } from 'miniflare';
import { experienceSamples } from '../app/lib/experience-samples.ts';

// Run only against the checkout's disposable demo store, with its server stopped.
if (process.argv[2] !== '--local-demo' || process.env.RENDER) {
  throw new Error('Use node scripts/seed-experience-centre.mjs --local-demo on your local checkout. Stop the preview first.');
}
const root = resolve(import.meta.dirname, '..');
const state = resolve(root, '.sites-runtime/render-state/db');
const worker = new Miniflare({
  script: 'export default { fetch() { return new Response("Local demo seed"); } };', modules: true,
  compatibilityDate: '2026-05-15', compatibilityFlags: ['nodejs_compat'],
  cf: false, log: new Log(LogLevel.ERROR),
  d1Databases: { DB: 'feedback-demo' }, d1Persist: state,
});
try {
  const db = await worker.getD1Database('DB');
  await db.prepare('CREATE TABLE IF NOT EXISTS render_migrations (name TEXT PRIMARY KEY)').run();
  for (const file of (await readdir(resolve(root, 'drizzle'))).filter(file => file.endsWith('.sql')).sort()) {
    if (await db.prepare('SELECT name FROM render_migrations WHERE name=?').bind(file).first()) continue;
    const sql = await readFile(resolve(root, 'drizzle', file), 'utf8');
    await db.batch([
      ...sql.split('--> statement-breakpoint').map(part => part.trim()).filter(Boolean).map(part => db.prepare(part)),
      db.prepare('INSERT INTO render_migrations (name) VALUES (?)').bind(file),
    ]);
  }
  for (const sample of experienceSamples) {
    const existing = await db.prepare('SELECT kiosk_id FROM feedback WHERE id=?').bind(sample.id).first();
    if (existing && existing.kiosk_id !== 'LOCAL-UI-QA') throw new Error('A sample ID belongs to a real record; refusing to overwrite it.');
  }
  await db.batch(experienceSamples.map(sample => db.prepare(`
    INSERT INTO feedback (id,name,contact,avatar,category,title,message,suggestion,rating,photos,status,consent,published,kiosk_id,area,request_id,created_at,visit_type,visit_zone,team_reply,team_reply_at,is_demo)
    VALUES (?,?,'',?,?,?,?,?,?,'[]',?,1,1,'LOCAL-UI-QA',?,?,?,?,?,?,?,1)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name,contact='',avatar=excluded.avatar,category=excluded.category,title=excluded.title,message=excluded.message,suggestion=excluded.suggestion,rating=excluded.rating,photos='[]',status=excluded.status,consent=1,published=1,area=excluded.area,created_at=excluded.created_at,visit_type=excluded.visit_type,visit_zone=excluded.visit_zone,team_reply=excluded.team_reply,team_reply_at=excluded.team_reply_at,is_demo=1
  `).bind(
    sample.id, sample.name, sample.avatar, sample.category, sample.title, sample.message,
    sample.suggestion || '', sample.rating ?? null, sample.status, sample.area,
    sample.id, sample.createdAt, sample.visitType || '', sample.visitZone || '', sample.teamReply || '', sample.teamReplyAt || '',
  )));
  console.log('Updated six explicitly labelled Toyota Experience Centre sample feedbacks in local demo storage.');
} finally { await worker.dispose(); }
