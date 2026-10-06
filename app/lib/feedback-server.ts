import {
  admin, ApiError, avatars, boolean, csvCell, db, fileKeyPattern, fileUrl,
  json, noCache, now, payload, rateLimit, respectfulText, safeId, sameOrigin,
  text, validateContact, type UploadRow,
} from "./server";

export type FeedbackStatus = "new" | "reviewed" | "shortlisted" | "adopted" | "hidden";
export type FeedbackItem = {
  id: string; name: string; contact?: string; avatar: string; category: string;
  title: string; message: string; suggestion: string; rating?: number;
  photos: string[]; status: FeedbackStatus; consent: boolean; published: boolean;
  kioskId: string; area: string; requestId?: string; createdAt: string;
};
type FeedbackRow = {
  id: string; name: string; contact: string; avatar: string; category: string;
  title: string; message: string; suggestion: string; rating: number | null;
  photos: string; status: FeedbackStatus; consent: number; published: number;
  kiosk_id: string; area: string; request_id: string; created_at: string;
};
const categories = new Set(["Safety", "Quality", "Design", "Sport", "Service", "EV", "Infotainment", "Others"]);
const statuses = new Set<FeedbackStatus>(["new", "reviewed", "shortlisted", "adopted", "hidden"]);
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

function asFeedback(row: FeedbackRow, publicView = false): FeedbackItem {
  const item: FeedbackItem = {
    id: row.id,
    name: publicView ? (row.name.trim() ? `${Array.from(row.name.trim())[0]}.` : "Anonymous") : row.name,
    avatar: fileKeyPattern.test(row.avatar) ? fileUrl(row.avatar) : row.avatar,
    category: row.category, title: row.title, message: row.message, suggestion: row.suggestion,
    ...(row.rating === null ? {} : { rating: row.rating }),
    photos: (JSON.parse(row.photos) as string[]).map(fileUrl),
    status: row.status, consent: Boolean(row.consent), published: Boolean(row.published),
    kioskId: row.kiosk_id, area: row.area, createdAt: row.created_at,
  };
  return publicView ? item : { ...item, contact: row.contact, requestId: row.request_id };
}

async function feedbackRow(id: string): Promise<FeedbackRow> {
  const row = await db().prepare("SELECT * FROM feedback WHERE id=?").bind(safeId(id)).first<FeedbackRow>();
  if (!row) throw new ApiError("Feedback not found.", 404);
  return row;
}

function uploadKey(value: unknown): string {
  if (typeof value !== "string" || !fileKeyPattern.test(value)) throw new ApiError("Upload a photo before attaching it.");
  return value;
}

function feedbackFilters(request: Request, manage: boolean) {
  const params = new URL(request.url).searchParams;
  const conditions: string[] = manage ? [] : ["published=1", "consent=1", "status!='hidden'"];
  const values: string[] = [];
  const category = params.get("category");
  if (category) {
    if (!categories.has(category)) throw new ApiError("Choose a valid feedback category.");
    conditions.push("category=?"); values.push(category);
  }
  const status = params.get("status");
  if (status) {
    if (!statuses.has(status as FeedbackStatus)) throw new ApiError("Choose a valid feedback status.");
    conditions.push("status=?"); values.push(status);
  }
  const area = params.get("area");
  if (area) { conditions.push("area=?"); values.push(text(area, "Area", 120, true)); }
  const search = text(params.get("search"), "Search", 100);
  if (search) {
    const fields = manage ? ["title", "message", "suggestion", "name", "contact", "area"] : ["title", "message", "suggestion", "area"];
    conditions.push(`(${fields.map((field) => `${field} LIKE ? ESCAPE '\\'`).join(" OR ")})`);
    const escaped = search.replace(/[\\%_]/g, "\\$&");
    values.push(...fields.map(() => `%${escaped}%`));
  }
  return { sql: conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "", values };
}

export async function listFeedback(request: Request) {
  const manage = new URL(request.url).searchParams.get("manage") === "1";
  if (manage) await admin(request);
  const filters = feedbackFilters(request, manage);
  const result = await db().prepare(`SELECT * FROM feedback${filters.sql} ORDER BY created_at DESC LIMIT ${manage ? 10000 : 2000}`).bind(...filters.values).all<FeedbackRow>();
  return json({ feedback: result.results.map((row) => asFeedback(row, !manage)) });
}

export async function submitFeedback(request: Request) {
  sameOrigin(request);
  const input = await payload(request);
  const requestId = text(input.requestId, "Request ID", 80, true).toLowerCase();
  if (!uuidPattern.test(requestId)) throw new ApiError("A valid submission ID is required.");
  const duplicate = await db().prepare("SELECT * FROM feedback WHERE request_id=?").bind(requestId).first<FeedbackRow>();
  if (duplicate) return json({ id: duplicate.id, feedback: asFeedback(duplicate, true), submitted: true });

  const name = text(input.name, "Name", 100);
  const contact = text(input.contact, "Contact", 200); validateContact(contact);
  const category = text(input.category ?? "Others", "Category", 80, true);
  if (!categories.has(category)) throw new ApiError("Choose a valid feedback category.");
  const message = text(input.message, "Feedback", 2000, true);
  if (message.length < 10) throw new ApiError("Tell us a little more: feedback needs at least 10 characters.");
  const title = text(input.title, "Title", 160) || (message.length > 80 ? `${message.slice(0, 77).trimEnd()}…` : message);
  const suggestion = text(input.suggestion, "Suggested improvement", 1000);
  let rating: number | null = null;
  if (input.rating !== undefined && input.rating !== null) {
    if (typeof input.rating !== "number" || !Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) throw new ApiError("Choose a rating from 1 to 5, or leave it blank.");
    rating = input.rating;
  }
  const consent = boolean(input.consent, "Public board consent", false);
  const kioskId = text(input.kioskId ?? "K-01", "Kiosk", 80, true);
  const area = text(input.area ?? "Experience Zone", "Area", 120, true);
  respectfulText(name, title, message, suggestion, kioskId, area);
  if (input.photos !== undefined && !Array.isArray(input.photos)) throw new ApiError("Photos must be a list.");
  const photos = ((input.photos ?? []) as unknown[]).map(uploadKey);
  if (photos.length > 3 || new Set(photos).size !== photos.length) throw new ApiError("Attach up to three different photos.");
  const avatarInput = input.avatar === undefined || input.avatar === "" ? "default" : text(input.avatar, "Avatar", 100, true);
  const avatar = avatars.has(avatarInput) ? avatarInput : uploadKey(avatarInput);
  const uploadKeys = [...new Set([...photos, ...(fileKeyPattern.test(avatar) ? [avatar] : [])])];
  const timestamp = now();
  for (const key of uploadKeys) {
    const upload = await db().prepare("SELECT * FROM uploads WHERE key=?").bind(key).first<UploadRow>();
    if (!upload || upload.purpose !== "response" || upload.response_id || upload.survey_id || upload.feedback_id || upload.expires_at <= timestamp) throw new ApiError("One of your photos expired or was already used. Please upload it again.");
  }
  await rateLimit(request, "feedback", 80);
  const id = crypto.randomUUID();
  const values = [id, name, contact, avatar, category, title, message, suggestion, rating, JSON.stringify(photos), "new", Number(consent), Number(consent), kioskId, area, requestId, timestamp];
  const claimGuard = uploadKeys.length ? ` WHERE (SELECT COUNT(*) FROM uploads WHERE key IN (${uploadKeys.map(() => "?").join(",")}) AND purpose='response' AND response_id IS NULL AND survey_id IS NULL AND feedback_id IS NULL AND expires_at>?)=${uploadKeys.length}` : "";
  const statements = [db().prepare(`INSERT INTO feedback (id,name,contact,avatar,category,title,message,suggestion,rating,photos,status,consent,published,kiosk_id,area,request_id,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?${claimGuard} ON CONFLICT(request_id) DO NOTHING`).bind(...values, ...uploadKeys, ...(uploadKeys.length ? [timestamp] : []))];
  for (const key of uploadKeys) statements.push(db().prepare("UPDATE uploads SET feedback_id=? WHERE key=? AND response_id IS NULL AND survey_id IS NULL AND feedback_id IS NULL AND EXISTS (SELECT 1 FROM feedback WHERE id=?)").bind(id, key, id));
  const results = await db().batch(statements);
  if (!results[0].meta.changes) {
    const saved = await db().prepare("SELECT * FROM feedback WHERE request_id=?").bind(requestId).first<FeedbackRow>();
    if (saved) return json({ id: saved.id, feedback: asFeedback(saved, true), submitted: true });
    throw new ApiError("Your photos changed while you submitted. Please upload them again and retry.", 409);
  }
  return json({ id, feedback: asFeedback(await feedbackRow(id), true), submitted: true }, 201);
}

export async function moderateFeedback(request: Request, id: string) {
  sameOrigin(request); await admin(request);
  const existing = await feedbackRow(id); const input = await payload(request);
  const status = input.status ?? existing.status;
  if (typeof status !== "string" || !statuses.has(status as FeedbackStatus)) throw new ApiError("Choose a valid feedback status.");
  let published = boolean(input.published, "Published", Boolean(existing.published));
  if (status === "hidden") published = false;
  if (published && !existing.consent) throw new ApiError("This person did not consent to appear on the public feedback board.");
  await db().prepare("UPDATE feedback SET status=?,published=? WHERE id=?").bind(status, Number(published), id).run();
  return json({ feedback: asFeedback({ ...existing, status: status as FeedbackStatus, published: Number(published) }) });
}

export async function archiveFeedback(request: Request, id: string) {
  sameOrigin(request); await admin(request); await feedbackRow(id);
  await db().prepare("UPDATE feedback SET status='hidden',published=0 WHERE id=?").bind(id).run();
  return json({ archived: true, feedback: asFeedback(await feedbackRow(id)) });
}

export async function exportFeedback(request: Request) {
  await admin(request);
  const filters = feedbackFilters(request, true);
  const result = await db().prepare(`SELECT * FROM feedback${filters.sql} ORDER BY created_at DESC LIMIT 10000`).bind(...filters.values).all<FeedbackRow>();
  const header = ["Feedback ID", "Title", "Feedback", "Suggested improvement", "Rating", "Category", "Name", "Contact", "Submitted at", "Status", "Published", "Public board consent", "Kiosk", "Area", "Photos", "Avatar"];
  const lines = [header.map(csvCell).join(",")];
  for (const row of result.results) lines.push([
    row.id, row.title, row.message, row.suggestion, row.rating, row.category, row.name, row.contact,
    row.created_at, row.status, Boolean(row.published), Boolean(row.consent), row.kiosk_id, row.area,
    (JSON.parse(row.photos) as string[]).map(fileUrl), fileKeyPattern.test(row.avatar) ? fileUrl(row.avatar) : row.avatar,
  ].map(csvCell).join(","));
  return new Response(`\uFEFF${lines.join("\r\n")}\r\n`, { headers: { ...noCache, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="feedback-${now().slice(0, 10)}.csv"` } });
}
