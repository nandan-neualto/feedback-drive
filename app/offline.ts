import type { FeedbackPayload } from './model';
export type PendingResponse = { id: string; surveyId: string; payload: Record<string, unknown>; files: { blob: Blob; name: string }[]; selfie?: { blob: Blob; name: string }; createdAt: string; kind?: 'survey' };
export type PendingFeedback = { id: string; kind: 'feedback'; payload: FeedbackPayload; files: { blob: Blob; name: string }[]; selfie?: { blob: Blob; name: string }; createdAt: string };
export type QueuedSubmission = PendingResponse | PendingFeedback;
async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('survey-drive', 1); r.onupgradeneeded = () => r.result.createObjectStore('pending', { keyPath: 'id' }); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  return new Promise((resolve, reject) => { const tx = db.transaction('pending', mode), req = action(tx.objectStore('pending')); let result: T; req.onsuccess = () => { result = req.result; }; tx.oncomplete = () => { db.close(); resolve(result); }; tx.onerror = () => { db.close(); reject(tx.error); }; });
}
export const savePending = (v: QueuedSubmission) => transaction('readwrite', s => s.put(v));
export const removePending = (id: string) => transaction('readwrite', s => s.delete(id));
export const getAllPending = () => transaction<QueuedSubmission[]>('readonly', s => s.getAll());
export const getPending = async () => (await getAllPending()).filter((item): item is PendingResponse => item.kind !== 'feedback');
export const getFeedbackPending = async () => (await getAllPending()).filter((item): item is PendingFeedback => item.kind === 'feedback');
export async function request<T = any>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store' }); const result: unknown = await response.json().catch(() => ({}));
  if (!response.ok) { const message = typeof result === 'object' && result !== null && 'error' in result && typeof result.error === 'string' ? result.error : `Request failed (${response.status})`; const e = new Error(message) as Error & { status: number }; e.status = response.status; throw e; } return result as T;
}
export async function upload(blob: Blob, name: string) { const form = new FormData(); form.append('file', blob, name); return request<{ key: string; url: string }>('/api/uploads', { method: 'POST', body: form }); }
export async function sendPending(item: PendingResponse) {
  const photos = []; for (const f of item.files) photos.push((await upload(f.blob, f.name)).key);
  const avatar = item.selfie ? (await upload(item.selfie.blob, item.selfie.name)).key : item.payload.avatar;
  return request('/api/surveys/' + item.surveyId + '/responses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...item.payload, photos, avatar, requestId: item.id }) });
}
export async function sendFeedbackPending(item: PendingFeedback) {
  const photos: string[] = [];
  for (const file of item.files) photos.push((await upload(file.blob, file.name)).key);
  const avatar = item.selfie ? (await upload(item.selfie.blob, item.selfie.name)).key : item.payload.avatar;
  return request('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...item.payload, avatar, photos, requestId: item.id }) });
}
