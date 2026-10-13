import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { feedbackCategories, feedbackCategoryStorageValues, isFeedbackCategory, normalizeFeedbackCategory, visitTypes, visitZones } from '../app/lib/experience-centre.ts';
import { selectFeedback } from '../app/lib/board.ts';
import { selectManagerFeedback } from '../app/lib/manager-feedback.ts';
import { feedbackPatchUpdate } from '../app/lib/feedback-moderation.ts';

const make = (id, extra = {}) => ({ id, name: 'A.', contact: 'private@example.test', avatar: 'default', category: 'Exhibits', title: 'An interesting visit', message: 'We enjoyed the exhibits and would like clearer labels.', suggestion: '', rating: 4, photos: [], status: 'new', consent: true, published: true, kioskId: 'K-01', area: 'Toyota Experience Centre', createdAt: '2026-10-13T10:00:00Z', ...extra });
const publicFilters = { category: 'All', search: '', sort: 'newest', photosOnly: false, savedOnly: false, saved: [] };
const managerFilters = { category: 'all', status: 'all', area: 'all', search: '', visibility: 'all' };

test('centre categories accept every legacy payload without changing its visitor meaning', () => {
  assert.deepEqual(feedbackCategories, ['Exhibits', 'Guided tours', 'Interactive activities', 'Visitor support', 'Facilities & accessibility', 'Overall visit', 'Others']);
  const expected = { Design: 'Exhibits', Quality: 'Exhibits', Safety: 'Facilities & accessibility', Sport: 'Interactive activities', EV: 'Interactive activities', Infotainment: 'Interactive activities', Service: 'Visitor support', Others: 'Others' };
  for (const [legacy, category] of Object.entries(expected)) {
    assert.equal(isFeedbackCategory(legacy), true);
    assert.equal(normalizeFeedbackCategory(legacy), category);
    assert.ok(feedbackCategoryStorageValues(category).includes(legacy));
  }
  for (const category of feedbackCategories) assert.equal(normalizeFeedbackCategory(category), category);
  assert.equal(isFeedbackCategory('Unexpected category'), false);
  assert.equal(normalizeFeedbackCategory(undefined), 'Others');
  assert.equal(normalizeFeedbackCategory(''), 'Others');
  assert.equal(normalizeFeedbackCategory('__proto__'), 'Others');
  assert.equal(isFeedbackCategory('constructor'), false);
  assert.equal(visitTypes.length, 4);
  assert.equal(visitZones.length, 6);
});

test('old and new category filters both find historical feedback and compose with visit/reply filters', () => {
  const rows = [make('legacy', { category: 'Design', visitType: 'Family visit', visitZone: 'Exhibits', teamReply: 'We are updating the exhibit labels.' }), make('new-category', { visitType: 'Individual visit' }), make('other', { category: 'Service', visitType: 'Family visit' })];
  assert.deepEqual(selectFeedback(rows, { ...publicFilters, category: 'Exhibits' }).map(item => item.id), ['legacy', 'new-category']);
  assert.deepEqual(selectFeedback(rows, { ...publicFilters, category: 'Quality' }).map(item => item.id), ['legacy', 'new-category']);
  assert.deepEqual(selectManagerFeedback(rows, { ...managerFilters, category: 'Exhibits', visitType: 'Family visit', visitZone: 'Exhibits', replyState: 'replied' }).map(item => item.id), ['legacy']);
  assert.deepEqual(selectManagerFeedback(rows, { ...managerFilters, category: 'Design', replyState: 'unanswered' }).map(item => item.id), ['new-category']);
});

test('visitor context and team replies are searchable without leaking private or archived feedback', () => {
  const rows = [make('public', { visitType: 'School / college visit', visitZone: 'Guided tour', teamReply: 'More time for questions is planned.' }), make('private', { published: false, teamReply: 'Secret private response' }), make('no-consent', { consent: false, teamReply: 'Secret unapproved response' }), make('archived', { status: 'hidden', teamReply: 'Secret archived response' })];
  assert.deepEqual(selectFeedback(rows, { ...publicFilters, search: 'college tour questions' }).map(item => item.id), ['public']);
  assert.deepEqual(selectFeedback(rows, { ...publicFilters, search: 'secret' }), []);
  assert.deepEqual(selectFeedback(rows, { ...publicFilters, search: 'private@example.test' }), []);
  assert.deepEqual(selectManagerFeedback(rows, { ...managerFilters, visibility: 'private', replyState: 'replied', search: 'secret' }).map(item => item.id), ['private', 'no-consent', 'archived']);
  assert.deepEqual(selectManagerFeedback(rows, { ...managerFilters, visibility: 'public', visitType: 'School / college visit', replyState: 'replied', search: 'ＱＵＥＳＴＩＯＮＳ' }).map(item => item.id), ['public']);
});

test('centre migration preserves existing feedback and gives optional fields safe defaults', () => {
  const database = new DatabaseSync(':memory:');
  try {
    for (const file of ['0000_crazy_puma.sql', '0001_sleepy_roughhouse.sql']) database.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url), 'utf8'));
    database.prepare('INSERT INTO feedback (id,category,title,message,request_id,created_at) VALUES (?,?,?,?,?,?)').run('history', 'Design', 'Original title', 'Original visitor feedback', 'request-history', '2026-10-01T10:00:00Z');
    database.exec(readFileSync(new URL('../drizzle/0002_experience_centre.sql', import.meta.url), 'utf8'));
    const row = database.prepare('SELECT * FROM feedback WHERE id=?').get('history');
    assert.equal(row.category, 'Design');
    assert.equal(row.message, 'Original visitor feedback');
    assert.equal(row.created_at, '2026-10-01T10:00:00Z');
    for (const key of ['visit_type', 'visit_zone', 'team_reply', 'team_reply_at']) assert.equal(row[key], '');
    assert.equal(row.is_demo, 0);
    database.prepare('UPDATE feedback SET visit_type=?,visit_zone=?,team_reply=?,team_reply_at=? WHERE id=?').run('Family visit', 'Exhibits', 'Thank you for visiting.', '2026-10-13T11:00:00Z', 'history');
    assert.equal(database.prepare('SELECT team_reply FROM feedback WHERE id=?').get('history').team_reply, 'Thank you for visiting.');
  } finally { database.close(); }
});

function moderationDatabase() {
  const database = new DatabaseSync(':memory:');
  database.exec("CREATE TABLE feedback (id TEXT PRIMARY KEY, status TEXT NOT NULL, published INTEGER NOT NULL, consent INTEGER NOT NULL, team_reply TEXT NOT NULL DEFAULT '', team_reply_at TEXT NOT NULL DEFAULT '')");
  database.prepare('INSERT INTO feedback (id,status,published,consent) VALUES (?,?,?,?)').run('visitor', 'new', 1, 1);
  const apply = update => { if (update.assignments.length) database.prepare(`UPDATE feedback SET ${update.assignments.join(',')} WHERE id=?`).run(...update.values, 'visitor'); };
  const read = () => database.prepare('SELECT * FROM feedback WHERE id=?').get('visitor');
  return { database, apply, read };
}

test('interleaved status and reply updates preserve fields omitted by another manager', () => {
  const { database, apply, read } = moderationDatabase();
  try {
    // Both requests can be prepared before either saves: neither carries a stale row snapshot.
    const status = feedbackPatchUpdate({ status: 'reviewed' }, '2026-10-13T11:00:00Z');
    const reply = feedbackPatchUpdate({ teamReply: 'Thank you. We will improve the labels.' }, '2026-10-13T11:01:00Z');
    apply(reply); apply(status);
    assert.equal(read().status, 'reviewed');
    assert.equal(read().team_reply, 'Thank you. We will improve the labels.');
    assert.equal(read().team_reply_at, '2026-10-13T11:01:00Z');
    const anotherReply = feedbackPatchUpdate({ teamReply: 'The labels have now been updated.' }, '2026-10-13T11:02:00Z');
    apply(feedbackPatchUpdate({ status: 'hidden' }, '2026-10-13T11:02:00Z'));
    apply(anotherReply);
    assert.equal(read().status, 'hidden');
    assert.equal(read().published, 0);
    assert.equal(read().team_reply, 'The labels have now been updated.');
  } finally { database.close(); }
});

test('publication checks current archive state and consent instead of reopening stale records', () => {
  const { database, apply, read } = moderationDatabase();
  try {
    const publish = feedbackPatchUpdate({ published: true }, '2026-10-13T12:00:00Z');
    apply(feedbackPatchUpdate({ status: 'hidden', published: true }, '2026-10-13T12:00:00Z'));
    apply(publish);
    assert.equal(read().status, 'hidden');
    assert.equal(read().published, 0);
    // Explicitly reopening with consent remains possible.
    apply(feedbackPatchUpdate({ status: 'reviewed', published: true }, '2026-10-13T12:01:00Z'));
    assert.equal(read().published, 1);
    database.prepare('UPDATE feedback SET consent=0 WHERE id=?').run('visitor');
    apply(publish);
    assert.equal(read().published, 0);
  } finally { database.close(); }
});

test('reply timestamps compare the stored value atomically and clearing removes the timestamp', () => {
  const { database, apply, read } = moderationDatabase();
  try {
    apply(feedbackPatchUpdate({ teamReply: 'Thank you for visiting.' }, '2026-10-13T13:00:00Z'));
    apply(feedbackPatchUpdate({ teamReply: 'Thank you for visiting.' }, '2026-10-13T13:01:00Z'));
    assert.equal(read().team_reply_at, '2026-10-13T13:00:00Z');
    apply(feedbackPatchUpdate({ teamReply: 'Thank you. Our team is reviewing this.' }, '2026-10-13T13:02:00Z'));
    assert.equal(read().team_reply_at, '2026-10-13T13:02:00Z');
    apply(feedbackPatchUpdate({ teamReply: '' }, '2026-10-13T13:03:00Z'));
    assert.equal(read().team_reply, '');
    assert.equal(read().team_reply_at, '');
  } finally { database.close(); }
});
