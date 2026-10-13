import assert from 'node:assert/strict';

const origin = process.argv[2] || 'http://localhost:5188';
assert(['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname), 'Run against a local preview only.');
assert(process.env.ADMIN_PASSWORD, 'Provide the local preview manager password through ADMIN_PASSWORD.');
const login = await fetch(origin + '/signin-with-chatgpt?return_to=/', {
  method: 'POST', redirect: 'manual', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ password: process.env.ADMIN_PASSWORD }),
});
assert.equal(login.status, 303);
const cookie = login.headers.get('set-cookie').split(';')[0];
const created = [];
const marker = 'CENTRE-QA-' + crypto.randomUUID();
async function call(path, method = 'GET', body, admin = false) {
  const response = await fetch(origin + path, { method,
    headers: { Origin: origin, ...(admin ? { Cookie: cookie } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const raw = await response.text();
  let data; try { data = JSON.parse(raw); } catch { data = raw; }
  return { status: response.status, data };
}
const payload = (extra = {}) => ({ requestId: crypto.randomUUID(), category: 'Exhibits', message: marker + ' Clearer exhibit labels would help visitors explore.', name: 'Local QA', contact: 'qa@example.test', avatar: 'default', consent: true, area: marker, kioskId: marker, visitType: 'Family visit', visitZone: 'Exhibits', rating: 4, ...extra });
try {
  for (const extra of [{ visitType: 'Unknown' }, { visitZone: 'Unknown' }]) assert.equal((await call('/api/feedback', 'POST', payload(extra))).status, 400);
  const form = new FormData();
  form.append('file', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5E0AAAAASUVORK5CYII=', 'base64')], { type: 'image/png' }), 'centre-qa.png');
  const uploaded = await fetch(origin + '/api/uploads', { method: 'POST', headers: { Origin: origin }, body: form });
  assert.equal(uploaded.status, 201); const photo = (await uploaded.json()).key;
  const publicPayload = payload({ photos: [photo], teamReply: 'Forged reply', isDemo: true });
  const publicPost = await call('/api/feedback', 'POST', publicPayload);
  assert.equal(publicPost.status, 201); const publicId = publicPost.data.id; created.push(publicId);
  assert.equal(publicPost.data.feedback.isDemo, false); assert.equal(publicPost.data.feedback.teamReply, '');
  assert.equal(publicPost.data.feedback.visitType, 'Family visit'); assert.equal(publicPost.data.feedback.visitZone, 'Exhibits');
  assert.equal((await call('/api/feedback', 'POST', publicPayload)).data.id, publicId);
  const privatePayload = payload({ consent: false, visitType: 'School / college visit', visitZone: 'Guided tour' });
  const privatePost = await call('/api/feedback', 'POST', privatePayload);
  assert.equal(privatePost.status, 201); const privateId = privatePost.data.id; created.push(privateId);
  const legacyPost = await call('/api/feedback', 'POST', payload({ category: 'Service', consent: false, visitType: undefined, visitZone: undefined }));
  assert.equal(legacyPost.status, 201); created.push(legacyPost.data.id); assert.equal(legacyPost.data.feedback.category, 'Visitor support');
  assert.equal((await call('/api/feedback/' + publicId, 'PATCH', { teamReply: 'Unauthorised' })).status, 403);
  for (const invalid of [null, 123, 'x'.repeat(1201)]) assert.equal((await call('/api/feedback/' + publicId, 'PATCH', { teamReply: invalid }, true)).status, 400);
  const publicReply = marker + ' We are reviewing the exhibit labels. Thank you for visiting.';
  const replied = await call('/api/feedback/' + publicId, 'PATCH', { teamReply: publicReply, status: 'reviewed' }, true);
  assert.equal(replied.status, 200); assert.equal(replied.data.feedback.teamReply, publicReply); assert(replied.data.feedback.teamReplyAt);
  const originalReplyAt = replied.data.feedback.teamReplyAt;
  assert.equal((await call('/api/feedback/' + publicId, 'PATCH', { status: 'shortlisted' }, true)).data.feedback.teamReplyAt, originalReplyAt);
  assert.equal((await call('/api/feedback/' + privateId, 'PATCH', { teamReply: marker + ' Private team response.' }, true)).status, 200);
  assert.equal((await call('/api/feedback/' + privateId, 'PATCH', { published: true }, true)).status, 400);
  const publicRows = (await call('/api/feedback?search=' + encodeURIComponent(marker))).data.feedback;
  assert.equal(publicRows.length, 1); assert.equal(publicRows[0].id, publicId); assert.equal(publicRows[0].teamReply, publicReply); assert(!publicRows[0].contact);
  const privateRetry = await call('/api/feedback', 'POST', privatePayload);
  assert.equal(privateRetry.data.id, privateId); assert(!privateRetry.data.feedback.teamReply);
  // Query filters and export select the same public row, including visitor and response state.
  const filters = new URLSearchParams({ search: marker, visibility: 'public', visitType: 'Family visit', replyState: 'replied' });
  const managerRows = (await call('/api/feedback?manage=1&' + filters, 'GET', undefined, true)).data.feedback;
  assert.deepEqual(managerRows.map(row => row.id), [publicId]);
  const csv = await call('/api/feedback/export?' + filters, 'GET', undefined, true);
  assert.equal(csv.status, 200); assert(csv.data.includes(publicId)); assert(!csv.data.includes(privateId)); assert(csv.data.includes('Visit type')); assert(csv.data.includes('Team replied at')); assert(csv.data.includes(publicReply));
  const canonicalFilters = new URLSearchParams({ search: marker, category: 'All', visitType: ' Family visit ', visitZone: ' Exhibits ', visibility: 'public' });
  assert.deepEqual((await call('/api/feedback?manage=1&' + canonicalFilters, 'GET', undefined, true)).data.feedback.map(row => row.id), [publicId]);
  const canonicalCsv = await call('/api/feedback/export?' + canonicalFilters, 'GET', undefined, true);
  assert.equal(canonicalCsv.status, 200); assert(canonicalCsv.data.includes(publicId)); assert(!canonicalCsv.data.includes(privateId));
  assert.equal((await call('/api/feedback/export?' + filters)).status, 403);
  assert.equal((await call('/api/feedback?visitType=Unknown')).status, 400);
  assert.equal((await call('/api/feedback/export?replyState=Unknown', 'GET', undefined, true)).status, 400);
  const cleared = await call('/api/feedback/' + publicId, 'PATCH', { teamReply: '' }, true);
  assert.equal(cleared.data.feedback.teamReply, ''); assert.equal(cleared.data.feedback.teamReplyAt, '');
  const file = await fetch(origin + '/api/files/' + photo); assert.equal(file.status, 200);
  console.log('Passed: centre visitor fields, photo submission, legacy payloads, idempotency, reply permissions/timestamps/privacy, and matching manager CSV filters.');
} finally {
  for (const id of created) assert.equal((await call('/api/feedback/' + id, 'DELETE', undefined, true)).status, 200);
}
