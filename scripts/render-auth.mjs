import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function managerAuth(password, secret = randomBytes(32).toString('hex')) {
  if (!password || password.length < 16) throw new Error('ADMIN_PASSWORD must contain at least 16 characters.');
  const salt = randomBytes(16);
  const expected = scryptSync(password, salt, 32);
  const sign = (value) => createHmac('sha256', secret).update(value).digest('base64url');
  return {
    checkPassword(value) {
      return typeof value === 'string' && value.length <= 256 && timingSafeEqual(scryptSync(value, salt, 32), expected);
    },
    issue(time = Date.now()) {
      const payload = `${Math.floor(time / 1000) + 8 * 3600}.${randomBytes(24).toString('base64url')}`;
      return `${payload}.${sign(payload)}`;
    },
    verify(cookie, time = Date.now()) {
      const value = cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith('fd_manager='))?.slice(11);
      if (!value || value.length > 200) return false;
      const parts = value.split('.');
      if (parts.length !== 3 || !/^\d+$/.test(parts[0])) return false;
      const expiry = Number(parts[0]);
      if (expiry <= time / 1000 || expiry > time / 1000 + 8 * 3600 + 1) return false;
      const expectedSignature = Buffer.from(sign(`${parts[0]}.${parts[1]}`));
      const received = Buffer.from(parts[2]);
      return expectedSignature.length === received.length && timingSafeEqual(expectedSignature, received);
    },
  };
}

export function safeReturn(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/?view=admin';
  const url = new URL(value, 'https://app.local');
  return url.origin === 'https://app.local' && !/^(\/signin-with-chatgpt|\/signout-with-chatgpt|\/callback)(\/|$)/.test(url.pathname)
    ? `${url.pathname}${url.search}` : '/?view=admin';
}

export function trustedHeaders(incoming, authenticated, ip) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(incoming)) {
    if (/^(oai-|cf-|x-forwarded-|forwarded$|host$|connection$|content-length$|transfer-encoding$)/i.test(key)) continue;
    if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
  }
  headers.set('cf-connecting-ip', ip);
  if (authenticated) {
    headers.set('oai-authenticated-user-id', 'render-manager');
    headers.set('oai-authenticated-user-email', 'manager@feedback-drive.local');
    headers.set('oai-authenticated-user-full-name', encodeURIComponent('Manager'));
    headers.set('oai-authenticated-user-full-name-encoding', 'percent-encoded-utf-8');
  }
  return headers;
}
