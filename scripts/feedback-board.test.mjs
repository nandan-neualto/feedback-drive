import test from 'node:test';
import assert from 'node:assert/strict';
import { selectFeedback, readSaved } from '../app/lib/board.ts';
const make = (id, extra = {}) => ({ id, name: 'A.', avatar: 'default', category: 'Service', title: '', message: 'Helpful staff and clear directions', photos: [], status: 'new', published: true, kioskId: 'K-01', area: 'Showroom', createdAt: '2026-10-06T10:00:00Z', ...extra });
const filters = { category: 'All', search: '', sort: 'newest', photosOnly: false, savedOnly: false, saved: [] };
test('composable filters never surface private or archived feedback', () => {
  const items = [make('public', { photos: ['photo'] }), make('private', { published: false }), make('archived', { status: 'hidden' })];
  assert.deepEqual(selectFeedback(items, { ...filters, savedOnly: true, saved: ['public', 'private', 'archived'], photosOnly: true }).map(x => x.id), ['public']);
  assert.deepEqual(selectFeedback(items, { ...filters, category: 'Design' }), []);
});
test('search supports Unicode and multiple words without indexing contact data', () => {
  const items = [make('jp', { message: 'スタッフの対応が丁寧でした。' }), make('en', { contact: 'secret@example.test' })];
  assert.deepEqual(selectFeedback(items, { ...filters, search: 'スタッフ 丁寧' }).map(x => x.id), ['jp']);
  assert.deepEqual(selectFeedback(items, { ...filters, search: 'ＨＥＬＰＦＵＬ staff' }).map(x => x.id), ['en']);
  assert.deepEqual(selectFeedback(items, { ...filters, search: 'secret@example.test' }), []);
});
test('ratings sort highest first, tie on recency, and put unrated posts last', () => {
  const items = [make('unrated'), make('older', { rating: 5, createdAt: '2026-10-05T10:00:00Z' }), make('newer', { rating: 5 }), make('low', { rating: 1 })];
  assert.deepEqual(selectFeedback(items, { ...filters, sort: 'rated' }).map(x => x.id), ['newer', 'older', 'low', 'unrated']);
  assert.equal(items[0].id, 'unrated');
  assert.equal(selectFeedback(items, { ...filters, sort: 'oldest' })[0].id, 'older');
});
test('saved-post storage tolerates corruption and rejects invalid values', () => {
  assert.deepEqual(readSaved('invalid'), []);
  assert.deepEqual(readSaved('{}'), []);
  assert.deepEqual(readSaved('["abc","abc",null,"https://evil.test","def"]'), ['abc', 'def']);
});

test('progress filtering composes with photos, saved and category without revealing hidden ideas', () => {
  const items = [make('adopted', { status: 'adopted', photos: ['photo'] }), make('private', { status: 'adopted', published: false }), make('other-category', { status: 'adopted', category: 'Safety', photos: ['photo'] }), make('new')];
  assert.deepEqual(selectFeedback(items, { ...filters, status: 'adopted', category: 'Service', photosOnly: true, savedOnly: true, saved: ['adopted', 'private', 'other-category'] }).map(x => x.id), ['adopted']);
  assert.deepEqual(selectFeedback(items, { ...filters, status: 'reviewed' }), []);
});
