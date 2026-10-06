import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../chatgpt-auth";

export type Question = { id: string; label: string; type: "short" | "long" | "single" | "multiple" | "rating" | "yesno"; required: boolean; options?: string[] };
export type Survey = { id: string; title: string; description: string; category: string; status: "active" | "draft" | "closed"; questions: Question[]; createdAt: string; responseCount: number; coverImage?: string; allowPhotos: boolean; requireName: boolean; showOnBoard: boolean; closesAt?: string };
type SurveyRow = { id: string; title: string; description: string; category: string; status: string; questions: string; created_at: string; updated_at: string; created_by: string; response_count?: number; cover_image: string | null; allow_photos: number; require_name: number; show_on_board: number; closes_at: string | null };
type ResponseRow = { id: string; survey_id: string; survey_title?: string; category?: string; name: string; contact: string; avatar: string; answers: string; questions_snapshot: string; photos: string; consent: number; status: string; featured: number; kiosk_id: string; area: string; request_id: string; created_at: string };
export type UploadRow = { key: string; object_key: string; content_type: string; size: number; purpose: string; response_id: string | null; survey_id: string | null; feedback_id: string | null; created_at: string; expires_at: string };
type WorkerEnv = { DB?: D1Database; BUCKET?: R2Bucket; ADMIN_EMAILS?: string; AUTH_MODE?: string };
const bindings = env as unknown as WorkerEnv;
const questionTypes = new Set(["short", "long", "single", "multiple", "rating", "yesno"]);
const responseStatuses = new Set(["new", "reviewed", "shortlisted", "adopted", "hidden"]);
export const avatars = new Set(["default", "smile", "leaf", "sun", "heart", "star", "flower", "spark", "wave", "mountain"]);
const severeProfanity = new Set(["fuck", "fucks", "fucked", "fucking", "fucker", "fuckers", "motherfucker", "motherfuckers", "cunt", "cunts", "cocksucker", "cocksuckers", "shit", "shits", "bullshit"]);
export const fileKeyPattern = /^[a-f0-9]{64}$/;
const idPattern = /^[a-zA-Z0-9_-]{1,80}$/;
const selectSurvey = "SELECT s.*, (SELECT COUNT(*) FROM responses r WHERE r.survey_id = s.id) AS response_count FROM surveys s";
export const noCache = { "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff" };

export class ApiError extends Error { constructor(message: string, public status = 400) { super(message); } }
export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: noCache });
export async function api(action: () => Promise<Response>) {
  try { return await action(); }
  catch (error) {
    if (error instanceof ApiError) return json({ error: error.message }, error.status);
    console.error("Feedback Drive API failed", error);
    return json({ error: "We couldn't complete this request. Please try again." }, 500);
  }
}
export function db(): D1Database { if (!bindings.DB) throw new ApiError("Feedback storage is unavailable. Please try again shortly.", 503); return bindings.DB; }
function bucket(): R2Bucket { if (!bindings.BUCKET) throw new ApiError("Photo storage is unavailable. Please try again shortly.", 503); return bindings.BUCKET; }
export const now = () => new Date().toISOString();
export function text(value: unknown, name: string, max: number, required = false): string {
  if (value === undefined || value === null) { if (required) throw new ApiError(`${name} is required.`); return ""; }
  if (typeof value !== "string") throw new ApiError(`${name} must be text.`);
  const clean = value.trim();
  if (clean.length > max) throw new ApiError(`${name} must be ${max} characters or fewer.`);
  if (required && !clean) throw new ApiError(`${name} is required.`);
  return clean;
}
function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiError("A valid JSON object is required."); return value as Record<string, unknown>; }
export function respectfulText(...values: string[]) {
  for (const value of values) {
    const words = value.normalize("NFKC").toLowerCase().match(new RegExp("[\\p{L}\\p{N}]+", "gu")) ?? [];
    if (words.some((word) => severeProfanity.has(word))) throw new ApiError("Please remove strong profanity and keep your response respectful.");
  }
}
export function validateContact(value: string) {
  if (!value) return;
  if (value.includes("@")) {
    const pieces = value.split("@"); const local = pieces[0]; const domain = pieces[1] ?? "";
    const validLocal = /^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+$/i.test(local) && local.length <= 64 && !local.startsWith(".") && !local.endsWith(".") && !local.includes("..");
    const labels = domain.split(".");
    const validDomain = labels.length > 1 && labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label));
    if (pieces.length === 2 && validLocal && validDomain) return;
  } else if (/^\+?[0-9 ().-]+$/.test(value)) {
    const digits = value.replace(/\D/g, "");
    if (digits.length >= 7 && digits.length <= 15 && !/^0+$/.test(digits)) return;
  }
  throw new ApiError("Enter a valid email address or mobile number, or leave contact blank.");
}
export function boolean(value: unknown, name: string, fallback: boolean): boolean { if (value === undefined) return fallback; if (typeof value !== "boolean") throw new ApiError(`${name} must be true or false.`); return value; }
export function safeId(value: string): string { if (!idPattern.test(value)) throw new ApiError("Invalid identifier."); return value; }
function randomKey(): string { const bytes = crypto.getRandomValues(new Uint8Array(32)); return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(""); }
function fileKey(value: unknown, request: Request): string {
  if (typeof value !== "string") throw new ApiError("Invalid photo reference.");
  if (fileKeyPattern.test(value)) return value;
  let url: URL;
  try { url = new URL(value, request.url); } catch { throw new ApiError("Invalid photo reference."); }
  const match = url.pathname.match(/^\/api\/files\/([a-f0-9]{64})$/);
  if (!match || url.origin !== new URL(request.url).origin || url.search || url.hash) throw new ApiError("Invalid photo reference.");
  return match[1];
}
export const fileUrl = (key: string) => `/api/files/${key}`;

export async function session(request: Request) {
  const identity = await getChatGPTUser();
  const email = identity?.email.trim().toLowerCase();
  const allowed = (bindings.ADMIN_EMAILS ?? "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
  const host = new URL(request.url).hostname;
  const localMock = ["127.0.0.1", "localhost", "[::1]", "::1"].includes(host) && email === "seedy@sites.test";
  return { authMode: bindings.AUTH_MODE === "password" ? "password" : "chatgpt", user: identity ? { email: identity.email, displayName: identity.displayName } : null, isAdmin: Boolean(email && (allowed.includes(email) || localMock)) };
}
export async function admin(request: Request) { const auth = await session(request); if (!auth.isAdmin || !auth.user) throw new ApiError("Administrator access is required.", 403); return auth.user; }
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if ((origin && origin !== new URL(request.url).origin) || fetchSite === "cross-site") throw new ApiError("This request must come from Feedback Drive.", 403);
}
async function limitedBytes(request: Request, limit: number): Promise<Uint8Array> {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > limit) throw new ApiError("This request is too large.", 413);
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader(); const pieces: Uint8Array[] = []; let total = 0;
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      total += part.value.byteLength;
      if (total > limit) { await reader.cancel(); throw new ApiError("This request is too large.", 413); }
      pieces.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const joined = new Uint8Array(total); let offset = 0;
  for (const piece of pieces) { joined.set(piece, offset); offset += piece.length; }
  return joined;
}
export async function payload(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new ApiError("Send this request as JSON.", 415);
  const bytes = await limitedBytes(request, 80 * 1024);
  try { return record(JSON.parse(new TextDecoder().decode(bytes))); }
  catch (error) { if (error instanceof ApiError) throw error; throw new ApiError("The request contains invalid JSON."); }
}
export async function rateLimit(request: Request, scope: string, limit: number, seconds = 3600) {
  const identity = request.headers.get("cf-connecting-ip") ?? "local";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity));
  const actor = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  const time = Math.floor(Date.now() / 1000); const window = Math.floor(time / seconds);
  const result = await db().prepare("INSERT INTO rate_limits (id, count, expires_at) VALUES (?, 1, ?) ON CONFLICT(id) DO UPDATE SET count = count + 1 WHERE count < ?").bind(`${scope}:${actor}:${window}`, (window + 1) * seconds, limit).run();
  if (result.meta.changes !== 1) throw new ApiError("You've sent several requests recently. Please try again later.", 429);
  if (Math.random() < 0.02) await db().prepare("DELETE FROM rate_limits WHERE expires_at < ?").bind(time - 86400).run();
}

function parseQuestions(value: unknown): Question[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 30) throw new ApiError("Add between 1 and 30 questions.");
  const seen = new Set<string>();
  return value.map((item) => {
    const row = record(item); const id = text(row.id, "Question ID", 80, true);
    if (!idPattern.test(id) || seen.has(id)) throw new ApiError("Questions need unique valid IDs."); seen.add(id);
    const label = text(row.label, "Question", 400, true);
    if (typeof row.type !== "string" || !questionTypes.has(row.type)) throw new ApiError("Choose a supported question type.");
    const type = row.type as Question["type"]; const required = boolean(row.required, "Required", false);
    if (type === "single" || type === "multiple") {
      if (!Array.isArray(row.options) || row.options.length < 2 || row.options.length > 20) throw new ApiError("Choice questions need between 2 and 20 options.");
      const options = row.options.map((item) => text(item, "Option", 160, true));
      if (new Set(options).size !== options.length) throw new ApiError("Question options must be unique.");
      return { id, label, type, required, options };
    }
    return { id, label, type, required };
  });
}
function asSurvey(row: SurveyRow): Survey {
  return { id: row.id, title: row.title, description: row.description, category: row.category, status: row.status as Survey["status"], questions: JSON.parse(row.questions), createdAt: row.created_at, responseCount: row.response_count ?? 0, coverImage: row.cover_image ? fileUrl(row.cover_image) : undefined, allowPhotos: Boolean(row.allow_photos), requireName: Boolean(row.require_name), showOnBoard: Boolean(row.show_on_board), closesAt: row.closes_at ?? undefined };
}
async function surveyRow(id: string): Promise<SurveyRow> { const row = await db().prepare(`${selectSurvey} WHERE s.id = ? AND s.status != 'archived'`).bind(safeId(id)).first<SurveyRow>(); if (!row) throw new ApiError("Survey not found.", 404); return row; }
function surveyInput(input: Record<string, unknown>, request: Request, existing?: SurveyRow) {
  const title = input.title === undefined && existing ? existing.title : text(input.title, "Survey title", 160, true);
  const description = input.description === undefined && existing ? existing.description : text(input.description, "Description", 2000);
  const category = input.category === undefined && existing ? existing.category : text(input.category ?? "General", "Category", 80, true);
  const status = input.status ?? existing?.status ?? "draft";
  if (!["active", "draft", "closed"].includes(String(status))) throw new ApiError("Choose active, draft, or closed status.");
  const questions = input.questions === undefined && existing ? JSON.parse(existing.questions) as Question[] : parseQuestions(input.questions);
  const allowPhotos = boolean(input.allowPhotos, "Allow photos", existing ? Boolean(existing.allow_photos) : true);
  const requireName = boolean(input.requireName, "Require name", existing ? Boolean(existing.require_name) : false);
  const showOnBoard = boolean(input.showOnBoard, "Show on board", existing ? Boolean(existing.show_on_board) : true);
  let coverImage = existing?.cover_image ?? null;
  if (input.coverImage !== undefined) coverImage = input.coverImage ? fileKey(input.coverImage, request) : null;
  let closesAt = existing?.closes_at ?? null;
  if (input.closesAt !== undefined) {
    if (input.closesAt === null || input.closesAt === "") closesAt = null;
    else { const date = new Date(text(input.closesAt, "Closing date", 40, true)); if (!Number.isFinite(date.getTime())) throw new ApiError("Enter a valid closing date."); closesAt = date.toISOString(); }
  }
  return { title, description, category, status: String(status), questions, allowPhotos, requireName, showOnBoard, coverImage, closesAt };
}
async function validateCover(key: string | null, surveyId?: string) {
  if (!key) return;
  const upload = await db().prepare("SELECT * FROM uploads WHERE key = ?").bind(key).first<UploadRow>();
  if (!upload || upload.purpose !== "cover" || (upload.survey_id && upload.survey_id !== surveyId) || (!upload.survey_id && upload.expires_at <= now())) throw new ApiError("Upload a new cover image before saving.");
}
export async function listSurveys(request: Request) {
  const auth = await session(request);
  const result = await db().prepare(`${selectSurvey} WHERE s.status ${auth.isAdmin ? "!= 'archived'" : "IN ('active','closed')"} ORDER BY s.created_at DESC LIMIT 500`).all<SurveyRow>();
  return json({ surveys: result.results.map(asSurvey) });
}
export async function getSurvey(request: Request, id: string) {
  const row = await surveyRow(id);
  if (row.status === "draft" && !(await session(request)).isAdmin) throw new ApiError("Survey not found.", 404);
  return json({ survey: asSurvey(row) });
}
export async function createSurvey(request: Request) {
  sameOrigin(request); const user = await admin(request); const data = surveyInput(await payload(request), request); await validateCover(data.coverImage);
  const id = crypto.randomUUID(); const timestamp = now();
  const statements = [db().prepare("INSERT INTO surveys (id,title,description,category,status,questions,allow_photos,require_name,show_on_board,cover_image,closes_at,created_at,updated_at,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id, data.title, data.description, data.category, data.status, JSON.stringify(data.questions), Number(data.allowPhotos), Number(data.requireName), Number(data.showOnBoard), data.coverImage, data.closesAt, timestamp, timestamp, user.email)];
  if (data.coverImage) statements.push(db().prepare("UPDATE uploads SET survey_id = ? WHERE key = ?").bind(id, data.coverImage));
  await db().batch(statements);
  return json({ survey: asSurvey(await surveyRow(id)) }, 201);
}
export async function updateSurvey(request: Request, id: string) {
  sameOrigin(request); await admin(request); const existing = await surveyRow(id); const data = surveyInput(await payload(request), request, existing); await validateCover(data.coverImage, id);
  const statements = [db().prepare("UPDATE surveys SET title=?,description=?,category=?,status=?,questions=?,allow_photos=?,require_name=?,show_on_board=?,cover_image=?,closes_at=?,updated_at=? WHERE id=?").bind(data.title, data.description, data.category, data.status, JSON.stringify(data.questions), Number(data.allowPhotos), Number(data.requireName), Number(data.showOnBoard), data.coverImage, data.closesAt, now(), id)];
  if (data.coverImage) statements.push(db().prepare("UPDATE uploads SET survey_id = ? WHERE key = ?").bind(id, data.coverImage));
  await db().batch(statements);
  return json({ survey: asSurvey(await surveyRow(id)) });
}
export async function archiveSurvey(request: Request, id: string) { sameOrigin(request); await admin(request); await surveyRow(id); await db().prepare("UPDATE surveys SET status='archived',updated_at=? WHERE id=?").bind(now(), id).run(); return json({ archived: true }); }

function validateAnswers(input: unknown, questions: Question[]) {
  const supplied = record(input); const answers: Record<string, string | string[] | number> = Object.create(null);
  if (Object.keys(supplied).some((id) => !questions.some((question) => question.id === id))) throw new ApiError("The survey changed. Please reload it before responding.");
  for (const question of questions) {
    const value = Object.prototype.hasOwnProperty.call(supplied, question.id) ? supplied[question.id] : undefined; const empty = value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
    if (empty) { if (question.required) throw new ApiError(`Please answer: ${question.label}`); continue; }
    if (question.type === "short" || question.type === "long") { const answer = text(value, question.label, question.type === "short" ? 500 : 5000, question.required); respectfulText(answer); answers[question.id] = answer; }
    else if (question.type === "rating") { if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 5) throw new ApiError(`Choose a rating from 1 to 5 for: ${question.label}`); answers[question.id] = value; }
    else if (question.type === "multiple") {
      if (!Array.isArray(value) || value.length > (question.options?.length ?? 0) || value.some((option) => typeof option !== "string" || !question.options?.includes(option)) || new Set(value).size !== value.length) throw new ApiError(`Choose valid options for: ${question.label}`);
      answers[question.id] = value as string[];
    } else if (question.type === "yesno") { if (typeof value !== "string" || !["yes", "no"].includes(value.toLowerCase())) throw new ApiError(`Choose yes or no for: ${question.label}`); answers[question.id] = value.toLowerCase(); }
    else { if (typeof value !== "string" || !question.options?.includes(value)) throw new ApiError(`Choose a valid option for: ${question.label}`); answers[question.id] = value; }
  }
  return answers;
}
function asResponse(row: ResponseRow, publicView = false) {
  const photos = (JSON.parse(row.photos) as string[]).map(fileUrl);
  const avatar = fileKeyPattern.test(row.avatar) ? fileUrl(row.avatar) : row.avatar;
  const common = { id: row.id, surveyId: row.survey_id, surveyTitle: row.survey_title ?? "", category: row.category ?? "General", name: publicView ? (row.name.trim() ? `${Array.from(row.name.trim())[0]}.` : "Anonymous") : row.name, avatar, answers: JSON.parse(row.answers), photos, questions: JSON.parse(row.questions_snapshot), status: row.status, featured: Boolean(row.featured), createdAt: row.created_at, kioskId: row.kiosk_id, area: row.area };
  return publicView ? common : { ...common, contact: row.contact, consent: Boolean(row.consent) };
}
export async function submitResponse(request: Request, surveyId: string) {
  sameOrigin(request); safeId(surveyId); const input = await payload(request);
  const requestId = text(input.requestId, "Request ID", 80, true);
  if (!idPattern.test(requestId)) throw new ApiError("Invalid request ID.");
  const duplicate = await db().prepare("SELECT id FROM responses WHERE survey_id=? AND request_id=?").bind(surveyId, requestId).first<{ id: string }>();
  if (duplicate) return json({ id: duplicate.id, responseId: duplicate.id, submitted: true });
  const survey = await surveyRow(surveyId);
  if (survey.status !== "active" || (survey.closes_at && survey.closes_at <= now())) throw new ApiError("This survey is closed and no longer accepts responses.", 409);
  const name = text(input.name, "Name", 100, Boolean(survey.require_name)); const contact = text(input.contact, "Contact", 200);
  validateContact(contact);
  const consent = boolean(input.consent, "Public board consent", false);
  const kioskId = text(input.kioskId ?? "K-01", "Kiosk", 80, true); const area = text(input.area ?? "Experience Zone", "Area", 120, true);
  respectfulText(name, kioskId, area);
  const questions = JSON.parse(survey.questions) as Question[]; const answers = validateAnswers(input.answers, questions);
  if (input.photos !== undefined && !Array.isArray(input.photos)) throw new ApiError("Photos must be a list.");
  const photos = ((input.photos ?? []) as unknown[]).map((value) => fileKey(value, request));
  if (photos.length > 3 || new Set(photos).size !== photos.length) throw new ApiError("Attach up to three different photos.");
  if (!survey.allow_photos && photos.length) throw new ApiError("This survey does not accept photos.");
  let avatar = input.avatar === undefined || input.avatar === "" ? "default" : text(input.avatar, "Avatar", 400, true);
  if (!avatars.has(avatar)) avatar = fileKey(avatar, request);
  if (!survey.allow_photos && fileKeyPattern.test(avatar)) throw new ApiError("This survey does not accept a selfie.");
  const uploadKeys = [...new Set([...photos, ...(fileKeyPattern.test(avatar) ? [avatar] : [])])];
  const timestamp = now();
  for (const key of uploadKeys) {
    const upload = await db().prepare("SELECT * FROM uploads WHERE key = ?").bind(key).first<UploadRow>();
    if (!upload || upload.purpose !== "response" || upload.response_id || upload.survey_id || upload.feedback_id || upload.expires_at <= timestamp) throw new ApiError("One of your photos expired or was already used. Please upload it again.");
  }
  await rateLimit(request, "responses", 80);
  const id = crypto.randomUUID();
  const values = [id, surveyId, name, contact, avatar, JSON.stringify(answers), JSON.stringify(questions), JSON.stringify(photos), Number(consent), "new", 0, kioskId, area, requestId, timestamp];
  const claimGuard = uploadKeys.length ? ` AND (SELECT COUNT(*) FROM uploads WHERE key IN (${uploadKeys.map(() => "?").join(",")}) AND purpose='response' AND response_id IS NULL AND survey_id IS NULL AND feedback_id IS NULL AND expires_at>?)=${uploadKeys.length}` : "";
  const statements = [db().prepare(`INSERT INTO responses (id,survey_id,name,contact,avatar,answers,questions_snapshot,photos,consent,status,featured,kiosk_id,area,request_id,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM surveys WHERE id=? AND status='active' AND (closes_at IS NULL OR closes_at>?))${claimGuard} ON CONFLICT(survey_id,request_id) DO NOTHING`).bind(...values, surveyId, timestamp, ...uploadKeys, ...(uploadKeys.length ? [timestamp] : []))];
  for (const key of uploadKeys) statements.push(db().prepare("UPDATE uploads SET response_id = ? WHERE key = ? AND response_id IS NULL AND feedback_id IS NULL AND EXISTS (SELECT 1 FROM responses WHERE id = ?)").bind(id, key, id));
  const results = await db().batch(statements);
  if (!results[0].meta.changes) {
    const saved = await db().prepare("SELECT id FROM responses WHERE survey_id=? AND request_id=?").bind(surveyId, requestId).first<{ id: string }>();
    if (saved) return json({ id: saved.id, responseId: saved.id, submitted: true });
    throw new ApiError("The survey or photos changed while you submitted. Please reload and try again.", 409);
  }
  return json({ id, responseId: id, submitted: true }, 201);
}
export async function listResponses(request: Request) {
  await admin(request); const surveyId = new URL(request.url).searchParams.get("surveyId"); if (surveyId) safeId(surveyId);
  const query = "SELECT r.*,s.title AS survey_title,s.category FROM responses r JOIN surveys s ON s.id=r.survey_id" + (surveyId ? " WHERE r.survey_id=?" : "") + " ORDER BY r.created_at DESC LIMIT 10000";
  const statement = db().prepare(query); const result = await (surveyId ? statement.bind(surveyId) : statement).all<ResponseRow>();
  return json({ responses: result.results.map((row) => asResponse(row)) });
}
export async function board(request: Request) {
  const url = new URL(request.url); const surveyId = url.searchParams.get("surveyId"); if (surveyId) safeId(surveyId);
  const sql = "SELECT r.*,s.title AS survey_title,s.category FROM responses r JOIN surveys s ON s.id=r.survey_id WHERE r.featured=1 AND r.consent=1 AND r.status!='hidden' AND s.show_on_board=1 AND s.status IN ('active','closed')" + (surveyId ? " AND r.survey_id=?" : "") + " ORDER BY r.created_at DESC LIMIT 200";
  const statement = db().prepare(sql); const result = await (surveyId ? statement.bind(surveyId) : statement).all<ResponseRow>();
  return json({ responses: result.results.map((row) => asResponse(row, true)) });
}
export async function moderateResponse(request: Request, id: string) {
  sameOrigin(request); await admin(request); safeId(id); const input = await payload(request);
  const existing = await db().prepare("SELECT r.*,s.title AS survey_title,s.category FROM responses r JOIN surveys s ON s.id=r.survey_id WHERE r.id=?").bind(id).first<ResponseRow>();
  if (!existing) throw new ApiError("Response not found.", 404);
  const status = input.status === "featured" ? existing.status : input.status ?? existing.status;
  if (typeof status !== "string" || !responseStatuses.has(status)) throw new ApiError("Choose a valid response status.");
  let featured = boolean(input.featured, "Featured", input.status === "featured" ? true : Boolean(existing.featured));
  if (status === "hidden") featured = false;
  if (featured && !existing.consent) throw new ApiError("This person did not consent to appear on the public board.");
  await db().prepare("UPDATE responses SET status=?,featured=? WHERE id=?").bind(status, Number(featured), id).run();
  return json({ response: asResponse({ ...existing, status, featured: Number(featured) }) });
}

export async function uploadPhoto(request: Request) {
  sameOrigin(request);
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) throw new ApiError("Upload a photo as multipart form data.", 415);
  const bytes = await limitedBytes(request, 5 * 1024 * 1024 + 65536);
  let form: FormData;
  try { form = await new Request(request.url, { method: "POST", headers: { "Content-Type": contentType }, body: bytes as unknown as BodyInit }).formData(); }
  catch { throw new ApiError("The photo upload could not be read."); }
  const file = form.get("file");
  if (!file || typeof file === "string") throw new ApiError("Choose a photo to upload.");
  if (form.getAll("file").length !== 1 || file.size < 16 || file.size > 5 * 1024 * 1024) throw new ApiError("Choose one photo smaller than 5 MB.");
  const purpose = form.get("purpose") ?? "response";
  if (purpose !== "response" && purpose !== "cover") throw new ApiError("Invalid upload purpose.");
  if (purpose === "cover") await admin(request);
  const image = new Uint8Array(await file.arrayBuffer()); let mime = ""; let extension = "";
  if (image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff) { mime = "image/jpeg"; extension = "jpg"; }
  else if ([137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => image[index] === byte)) { mime = "image/png"; extension = "png"; }
  else if (String.fromCharCode(...image.slice(0, 4)) === "RIFF" && String.fromCharCode(...image.slice(8, 12)) === "WEBP") { mime = "image/webp"; extension = "webp"; }
  if (!mime || (file.type && file.type !== mime)) throw new ApiError("Please choose a real JPG, PNG, or WebP photo.", 415);
  await rateLimit(request, "uploads", 60);
  // Reclaim abandoned previews in small batches so uploads cannot accumulate forever.
  const expired = await db().prepare("SELECT key,object_key FROM uploads WHERE response_id IS NULL AND survey_id IS NULL AND feedback_id IS NULL AND expires_at < ? LIMIT 4").bind(now()).all<{ key: string; object_key: string }>();
  if (expired.results.length) {
    await bucket().delete(expired.results.map((item) => item.object_key));
    await db().batch(expired.results.map((item) => db().prepare("DELETE FROM uploads WHERE key=? AND response_id IS NULL AND survey_id IS NULL AND feedback_id IS NULL").bind(item.key)));
  }
  const key = randomKey(); const objectKey = `photos/${key}.${extension}`; const timestamp = now(); const expiresAt = new Date(Date.now() + 86400000).toISOString();
  await bucket().put(objectKey, image, { httpMetadata: { contentType: mime }, customMetadata: { uploadedAt: timestamp } });
  try { await db().prepare("INSERT INTO uploads (key,object_key,content_type,size,purpose,created_at,expires_at) VALUES (?,?,?,?,?,?,?)").bind(key, objectKey, mime, image.byteLength, purpose, timestamp, expiresAt).run(); }
  catch (error) { await bucket().delete(objectKey); throw error; }
  return json({ key, url: fileUrl(key), expiresAt }, 201);
}
export async function getFile(request: Request, key: string) {
  if (!fileKeyPattern.test(key)) throw new ApiError("Photo not found.", 404);
  const upload = await db().prepare("SELECT * FROM uploads WHERE key=?").bind(key).first<UploadRow>();
  if (!upload) throw new ApiError("Photo not found.", 404);
  let authorized = !upload.response_id && !upload.survey_id && !upload.feedback_id && upload.expires_at > now();
  if (!authorized && upload.response_id) authorized = Boolean(await db().prepare("SELECT r.id FROM responses r JOIN surveys s ON s.id=r.survey_id WHERE r.id=? AND r.featured=1 AND r.consent=1 AND r.status!='hidden' AND s.show_on_board=1 AND s.status IN ('active','closed')").bind(upload.response_id).first());
  if (!authorized && upload.feedback_id) authorized = Boolean(await db().prepare("SELECT id FROM feedback WHERE id=? AND published=1 AND consent=1 AND status!='hidden'").bind(upload.feedback_id).first());
  if (!authorized && upload.survey_id) authorized = Boolean(await db().prepare("SELECT id FROM surveys WHERE id=? AND cover_image=? AND status IN ('active','closed')").bind(upload.survey_id, key).first());
  if (!authorized) authorized = (await session(request)).isAdmin;
  if (!authorized) throw new ApiError("Photo not found.", 404);
  const object = await bucket().get(upload.object_key);
  if (!object) throw new ApiError("Photo not found.", 404);
  return new Response(object.body, { headers: { ...noCache, "Content-Type": upload.content_type, "Content-Length": String(object.size), "Content-Disposition": "inline", "Cross-Origin-Resource-Policy": "same-origin", "Content-Security-Policy": "default-src 'none'; sandbox" } });
}
export function csvCell(value: unknown): string {
  let valueText = value === null || value === undefined ? "" : Array.isArray(value) ? value.join("; ") : String(value);
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(valueText)) valueText = `'${valueText}`;
  return `"${valueText.replace(/"/g, '""')}"`;
}
export async function exportResponses(request: Request) {
  await admin(request); const surveyId = new URL(request.url).searchParams.get("surveyId"); if (surveyId) safeId(surveyId);
  const sql = "SELECT r.*,s.title AS survey_title,s.category FROM responses r JOIN surveys s ON s.id=r.survey_id" + (surveyId ? " WHERE r.survey_id=?" : "") + " ORDER BY r.created_at DESC LIMIT 10000";
  const statement = db().prepare(sql); const result = await (surveyId ? statement.bind(surveyId) : statement).all<ResponseRow>();
  const columns = new Map<string, string>();
  if (surveyId) { const survey = await db().prepare("SELECT questions FROM surveys WHERE id=?").bind(surveyId).first<{ questions: string }>(); if (survey) for (const q of JSON.parse(survey.questions) as Question[]) columns.set(`${surveyId}:${q.id}`, q.label); }
  for (const row of result.results) for (const question of JSON.parse(row.questions_snapshot) as Question[]) { const key = `${row.survey_id}:${question.id}`; if (!columns.has(key)) columns.set(key, surveyId ? question.label : `${row.survey_title}: ${question.label}`); }
  const header = ["Response ID", "Survey", "Name", "Contact", "Submitted at", "Status", "Featured", "Public board consent", "Category", "Kiosk", "Area", ...columns.values(), "Photos", "Avatar"];
  const lines = [header.map(csvCell).join(",")];
  for (const row of result.results) {
    const answers = JSON.parse(row.answers) as Record<string, unknown>;
    const values = [row.id, row.survey_title, row.name, row.contact, row.created_at, row.status, Boolean(row.featured), Boolean(row.consent), row.category, row.kiosk_id, row.area, ...Array.from(columns.keys(), (key) => key.startsWith(`${row.survey_id}:`) ? answers[key.slice(row.survey_id.length + 1)] : ""), (JSON.parse(row.photos) as string[]).map(fileUrl), fileKeyPattern.test(row.avatar) ? fileUrl(row.avatar) : row.avatar];
    lines.push(values.map(csvCell).join(","));
  }
  return new Response(`\uFEFF${lines.join("\r\n")}\r\n`, { headers: { ...noCache, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="survey-responses-${new Date().toISOString().slice(0, 10)}.csv"` } });
}
