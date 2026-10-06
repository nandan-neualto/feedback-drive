import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const surveys = sqliteTable("surveys", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  category: text("category").notNull().default("General"),
  status: text("status").notNull().default("draft"),
  questions: text("questions").notNull(),
  allowPhotos: integer("allow_photos", { mode: "boolean" }).notNull().default(true),
  requireName: integer("require_name", { mode: "boolean" }).notNull().default(false),
  showOnBoard: integer("show_on_board", { mode: "boolean" }).notNull().default(true),
  coverImage: text("cover_image"),
  closesAt: text("closes_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  createdBy: text("created_by").notNull(),
}, (table) => [index("surveys_status_idx").on(table.status)]);

export const responses = sqliteTable("responses", {
  id: text("id").primaryKey(),
  surveyId: text("survey_id").notNull().references(() => surveys.id),
  name: text("name").notNull().default(""),
  contact: text("contact").notNull().default(""),
  avatar: text("avatar").notNull().default("default"),
  answers: text("answers").notNull(),
  questionsSnapshot: text("questions_snapshot").notNull(),
  photos: text("photos").notNull().default("[]"),
  consent: integer("consent", { mode: "boolean" }).notNull().default(false),
  status: text("status").notNull().default("new"),
  featured: integer("featured", { mode: "boolean" }).notNull().default(false),
  kioskId: text("kiosk_id").notNull().default("K-01"),
  area: text("area").notNull().default("Experience Zone"),
  requestId: text("request_id").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("responses_survey_idx").on(table.surveyId, table.createdAt),
  index("responses_board_idx").on(table.featured, table.consent, table.status),
  uniqueIndex("responses_request_idx").on(table.surveyId, table.requestId),
]);

export const feedback = sqliteTable("feedback", {
  id: text("id").primaryKey(),
  name: text("name").notNull().default(""),
  contact: text("contact").notNull().default(""),
  avatar: text("avatar").notNull().default("default"),
  category: text("category").notNull().default("Others"),
  title: text("title").notNull(),
  message: text("message").notNull(),
  suggestion: text("suggestion").notNull().default(""),
  rating: integer("rating"),
  photos: text("photos").notNull().default("[]"),
  status: text("status").notNull().default("new"),
  consent: integer("consent", { mode: "boolean" }).notNull().default(false),
  published: integer("published", { mode: "boolean" }).notNull().default(false),
  kioskId: text("kiosk_id").notNull().default("K-01"),
  area: text("area").notNull().default("Experience Zone"),
  requestId: text("request_id").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("feedback_board_idx").on(table.published, table.consent, table.status, table.createdAt),
  index("feedback_category_idx").on(table.category, table.createdAt),
  uniqueIndex("feedback_request_idx").on(table.requestId),
]);

export const uploads = sqliteTable("uploads", {
  key: text("key").primaryKey(),
  objectKey: text("object_key").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  purpose: text("purpose").notNull().default("response"),
  responseId: text("response_id").references(() => responses.id),
  surveyId: text("survey_id").references(() => surveys.id),
  feedbackId: text("feedback_id").references(() => feedback.id),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
}, (table) => [index("uploads_response_idx").on(table.responseId), index("uploads_survey_idx").on(table.surveyId), index("uploads_feedback_idx").on(table.feedbackId)]);

export const rateLimits = sqliteTable("rate_limits", {
  id: text("id").primaryKey(),
  count: integer("count").notNull().default(1),
  expiresAt: integer("expires_at").notNull(),
}, (table) => [index("rate_limits_expiry_idx").on(table.expiresAt)]);
