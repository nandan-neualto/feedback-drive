# Render temporary demo

This deployment runs the compiled Cloudflare Worker locally using Miniflare behind a Node HTTP server. Its SQLite database and photo objects live in `.sites-runtime/render-state` on Render's temporary filesystem.

**Feedback and photos can disappear when the free service restarts, redeploys, or spins down.** This deployment intentionally starts with an empty database and does not copy data from the original Site.

Create a Render **Web Service** from this repository using:

- Branch: `main`
- Runtime: Node
- Compute: **Free**
- Build: `npm ci --include=dev && npm run build`
- Start: `npm run start:render`
- Health check: `/api/health`
- `NODE_VERSION`: `24`
- `ADMIN_PASSWORD`: a private random password of at least 16 characters

Database migrations apply automatically before the HTTP server starts. Changing `ADMIN_PASSWORD` requires a redeploy. Manager sessions last eight hours and end on restart unless `ADMIN_SESSION_SECRET` is configured. Neither secret belongs in Git.

Anyone can submit feedback and photos. Open **Manager board → ADMIN ACCESS** to sign in with the configured manager password. The Render version uses password sign-in; the original Site continues to use ChatGPT sign-in. Incoming identity headers are removed before forwarding requests to the Worker, and only a valid signed manager session supplies the trusted identity.

Run `node --test scripts/render-auth.test.mjs` for password, session, identity-header and return-URL checks. The existing feedback API retains consent, photo visibility, validation, request idempotency, moderation and export controls.

When connected through Render's Public Git Repository option, use **Manual Deploy → Deploy latest commit** after pushing updates.
