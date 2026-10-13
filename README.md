# Toyota Experience Centre · Feedbacks

A visitor feedbacks board for the Toyota Experience Centre. Visitors can share highlights, concerns, and suggestions from their visit without signing in, and attach photos. The centre team uses the manager board to reply, track improvements, and manage optional feedback forms.

## Features

- Toyota-themed public feedbacks board with light/dark themes and saved device preferences.
- English, Kannada, Hindi, and Japanese interface translations, including feedback validation and manager tools. Dates and numbers follow the selected locale; submitted feedback and administrator-written forms keep their original text.
- Visit topics cover Exhibits, Guided tours, Interactive activities, Visitor support, Facilities & accessibility, Overall visit, and Others. Older vehicle-oriented categories normalize to the current topics without rewriting visitor history.
- Direct feedback includes a message, optional overall visit rating, visit type and centre area, title, improvement suggestion, private contact details, avatar or selfie, and up to three photos.
- Feedback appears immediately on the public board only with explicit publication consent. The review path is Received → In review → Action planned → Completed; managers can also unpublish or archive feedback.
- Centre team replies include a timestamp. Replies appear publicly only with a consented, published, unarchived feedback entry; replies to private feedback stay in the manager board.
- Public board filters cover topics, review progress, photos, saved feedbacks, team responses, and reference search. The API also supports visit type and centre area filters. Manager CSV exports match the selected filters, including visibility and visitor context.
- An empty public board shows six clearly labelled sample visitor feedbacks after a successful API load. These examples are preview content, not real visitor outcomes; API errors do not display a sample fallback.
- A separate feedback store preserves existing questionnaire responses and their original consent/publication rules.
- Admin feedback CSV export includes visitor context and centre team replies, with spreadsheet formula protection.
- Admin feedback form builder with short text, long text, single choice, multiple choice, 1–5 ratings, and yes/no questions, plus centre visit, guided tour, and exhibits/activity templates. New predefined templates start in the selected interface language; saved and user-authored forms retain their text.
- Draft, active, closed, scheduled close, and archive states, with optional photo uploads and name requirements.
- Anonymous public responses with optional private email/mobile contact, predefined avatars or a selfie, and up to three attached photos.
- Legacy questionnaire responses require explicit consent and manager featuring to appear on the board.
- Public board names are shortened to an initial. Contact details are only returned to administrators.
- Cloudflare deployments use durable D1 storage and R2 photos, with question snapshots and retry-safe submission IDs. The free Render demo uses temporary local storage instead.
- Admin CSV export with question columns and spreadsheet formula protection.
- Offline app shell in production. The service worker caches the public HTML shell and immutable JavaScript/CSS assets; API data, photos, sign-in/out, callbacks, and external requests are never cached.
- Client pending submissions use IndexedDB on the current device. Offline storage is device-local; the server records a response only when synchronization succeeds.

## Free Render demo

Use the free web service plan with build command `npm run install:ci && npm run build` and start command `npm run start:render`. Set `ADMIN_PASSWORD` to a manager password of at least 16 characters; optionally set a stable `ADMIN_SESSION_SECRET`. The server binds to Render's `PORT` and applies pending database migrations on startup. Manager sign-in uses this password on the Render adapter.

Feedbacks and photos are stored under `.sites-runtime/render-state`. On Render's free service this storage is temporary: a restart or redeploy can lose submitted feedbacks and photos. The empty-board sample fallback is clearly labelled and does not restore real submissions.

## Cloudflare / Sites production setup

The application runs with Vinext on Cloudflare through Sites. `.openai/hosting.json` declares D1 binding `DB` and R2 binding `BUCKET`.

1. Keep the site's audience public so visitors can respond anonymously.
2. Provide a D1 database as `DB` and an R2 bucket as `BUCKET`.
3. Generate a migration from `db/schema.ts` with `npm run db:generate`, and apply the generated SQL to the target D1 database before using the API.
4. Set Worker environment variable `ADMIN_EMAILS` to a comma-separated list of actual administrator email addresses. Matching is exact and case-insensitive. With this variable empty, hosted visitors cannot create surveys or view private responses.
5. Administrators sign in using the site's built-in Sign in with ChatGPT flow. The application uses the platform identity helper in `app/chatgpt-auth.ts`; it does not maintain a separate password system.
6. Build with `npm run build` and use the Sites publishing workflow. Authentication headers must be supplied by the trusted Sites dispatcher, rather than exposed directly to an untrusted client.

The registration component is `app/register-sw.tsx`. It must be rendered by the root layout, whose metadata should link `/manifest.webmanifest`. Service-worker registration is disabled during development to avoid stale HMR assets. Change the version in `public/sw.js` when changing offline cache behavior.

## Local development

Requires Node.js 22.13.0 or newer. Install project dependencies once with `npm run install:ci`. Start with `npm run dev`; the portable preview binds to loopback and usually starts on port 5173. Apply the generated schema migration to the local D1 preview before using survey routes.

In the portable preview, visit `/signin-with-chatgpt?return_to=/` to sign in as Seedy (`seedy@sites.test`). This trusted mock identity is an administrator only when the request hostname is `localhost`, `127.0.0.1`, or IPv6 loopback. Hosted deployments do not receive this special permission. Visit `/signout-with-chatgpt?return_to=/` to sign out.

Suggested checks after installation:

```text
npx tsc --noEmit
npm run lint
npm run build
```

For a built local preview, `npm start` uses the generated Worker configuration and the project's `.wrangler/state`. It does not simulate sign-in or deploy the site.

To preview the Render adapter locally, build first, provide `ADMIN_PASSWORD` through your environment, set `PORT` if desired, and run `npm run start:render`. For example, use port 5188 for the integration checks below. Use the same `ADMIN_PASSWORD` environment value in the test terminal; do not put the password in source files or command arguments.

Run the 18 unit tests:

```text
node --test scripts/feedback-board.test.mjs scripts/manager-feedback.test.mjs scripts/experience-centre.test.mjs scripts/render-auth.test.mjs
```

With the local Render preview running and `ADMIN_PASSWORD` set, run the local-only integration check. It verifies visitor fields, photo submission, retry safety, reply permissions/privacy, and matching manager CSV filters, then archives its test feedbacks:

```text
node scripts/experience-centre.integration.mjs http://localhost:5188
```

To replace the six fixed local demo records with Experience Centre sample feedbacks, stop the local Render preview first, then run:

```text
node scripts/seed-experience-centre.mjs --local-demo
```

This optional seed targets only `.sites-runtime/render-state` in the local checkout, refuses to run when `RENDER` is set, and upserts only the six fixed sample IDs. It refuses to overwrite a sample ID owned by a real record and does not replace other feedbacks. Seeded entries remain explicitly labelled as samples.

## API

- `GET /api/session`: current platform identity and administrator status.
- `GET /api/feedback`: public, consented, published feedback, excluding archived entries. Supports optional `category`, `status`, `area`, literal `search`, `visitType`, `visitZone`, and `replyState` filters.
- `GET /api/feedback?manage=1`: admin feedback including private contacts and archived entries, with the same optional filters plus `visibility`.
- `POST /api/feedback`: direct public submission with a UUID `requestId`, a required 10–2,000 character `message`, and optional `name`, `contact`, `avatar`, `category`, `title`, `suggestion`, `rating`, `visitType`, `visitZone`, `photos`, `kioskId`, and `area`. Explicit `consent: true` publishes immediately; omitted or false consent keeps the feedback private. Public submissions cannot create team replies or mark themselves as samples.
- `PATCH /api/feedback/:id`: admin `status`, `published`, and `teamReply` controls. A team reply allows up to 1,200 characters; an empty string clears it. Feedback without consent cannot be published.
- `DELETE /api/feedback/:id`: admin soft archive; also revokes public image access.
- `GET /api/feedback/export`: admin feedback CSV with the same manager filters, including visibility, visitor context, and team response state.
- `GET/POST /api/surveys`: survey list and admin creation.
- `GET/PATCH/DELETE /api/surveys/:id`: detail, admin updates, and soft archive.
- `POST /api/surveys/:id/responses`: public submission with a stable `requestId`.
- `GET /api/responses?surveyId=...`: admin responses including private contact details.
- `PATCH /api/responses/:id`: admin status/feature controls.
- `GET /api/board?surveyId=...`: consented, featured responses from visible surveys.
- `GET /api/export?surveyId=...`: admin CSV.
- `POST /api/uploads`: multipart `file`, with `purpose=response` by default or `purpose=cover` for administrators. Returns `{key,url,expiresAt}`.
- `GET /api/files/:key`: image preview or authorized image access.

## Limits and privacy

Direct feedback requires a 10–2,000 character message. Titles allow 160 characters, improvement suggestions 1,000, and optional integer ratings range from 1 to 5. The seven visit topics are Exhibits, Guided tours, Interactive activities, Visitor support, Facilities & accessibility, Overall visit, and Others. Optional visit types are Individual visit, Family visit, School / college visit, and Group visit; centre areas are General visit, Reception, Exhibits, Interactive area, Guided tour, and Visitor facilities. New feedback uses globally unique UUID submission IDs, including concurrent retries.

Surveys allow 1–30 questions. Choice questions allow 2–20 unique options. Text answers are limited to 500 characters for short answers and 5,000 for long answers; JSON requests are limited to 80 KiB total. Names allow 100 characters and private contact fields 200.

Photo uploads must be JPEG, PNG, or WebP with matching file signatures, no larger than 5 MiB each. A response or direct feedback entry can include three photos plus one selfie. Direct feedback accepts the opaque keys returned by `/api/uploads`, and claims attachments atomically so an uploaded photo cannot be reused across submissions. Unattached preview capabilities expire after 24 hours. Expired, unclaimed uploads are reclaimed in small batches during later uploads. Direct feedback images become public only when the entry has consent and remains published and unarchived; other images require administrator access. Legacy response images require consent, featuring, and a visible questionnaire. Hiding, unpublishing, or archiving feedback revokes public image access.

Server rate limits allow 60 uploads, 80 new feedback entries, and 80 new questionnaire responses per IP per hour. Contact values, when present, must be a conventional email address or a phone number containing 7–15 digits. A small whole-word list blocks common strong profanity in respondent names and free-text answers; it is not a comprehensive moderation system. Administrators review and moderate published feedback in the manager board.

The direct feedback board returns up to 2,000 entries; admin feedback views and exports return up to 10,000. The survey list returns at most 500 records, the legacy public response board the newest 200 responses, and admin response views/exports at most 10,000 responses. API and image responses use `Cache-Control: no-store`. Public requests cannot create surveys, read contacts, export responses, or change moderation status. Mutation routes check request origin.
