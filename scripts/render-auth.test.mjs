import test from 'node:test';
import assert from 'node:assert/strict';
import { managerAuth, safeReturn, trustedHeaders } from './render-auth.mjs';

test('manager password and signed sessions reject tampering and expiry', () => {
  const auth = managerAuth('test-only-password-123456');
  assert.equal(auth.checkPassword('wrong'), false);
  assert.equal(auth.checkPassword('test-only-password-123456'), true);
  const token = auth.issue(1000000);
  assert.equal(auth.verify(`fd_manager=${token}`, 1000000), true);
  assert.equal(auth.verify(`fd_manager=${token}x`, 1000000), false);
  assert.equal(auth.verify(`fd_manager=${token}`, 1000000 + 8 * 3600 * 1000), false);
  assert.equal(managerAuth('test-only-password-123456').verify(`fd_manager=${token}`, 1000000), false);
});
test('proxy identity can only come from a verified manager session', () => {
  const incoming = { 'oai-authenticated-user-id': 'spoof', 'oai-authenticated-user-email': 'manager@feedback-drive.local', 'cf-connecting-ip': 'spoof', 'x-forwarded-for': 'spoof', cookie: 'fd_manager=invalid' };
  const anonymous = trustedHeaders(incoming, false, '127.0.0.1');
  assert.equal(anonymous.get('oai-authenticated-user-email'), null);
  assert.equal(anonymous.get('cf-connecting-ip'), '127.0.0.1');
  assert.equal(anonymous.get('x-forwarded-for'), null);
  assert.equal(trustedHeaders(incoming, true, '127.0.0.1').get('oai-authenticated-user-email'), 'manager@feedback-drive.local');
});
test('sign-in return URLs stay on this app', () => {
  for (const value of ['https://evil.test', '//evil.test', '/\\evil.test', '/signin-with-chatgpt', null]) assert.equal(safeReturn(value), '/?view=admin');
  assert.equal(safeReturn('/?view=admin'), '/?view=admin');
});
