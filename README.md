# Social Autopilot — Automated Instagram Management Service

A multi-client backend that runs a done-for-you Instagram service on autopilot:

1. **Client onboards in ~5 min** — clicks a link, connects Instagram (official Facebook Login), fills a short brand form.
2. **Client chats a WhatsApp number** — the AI bot collects photos, enhances them, writes an on-brand caption, and shows a preview.
3. **Client replies "YES"** — the post publishes to their Instagram via the **official Instagram Graph API** (ToS-safe, no bots, no bans).

This is the engine that lets your sales team sell and each client run **without you touching anything manually**.

---

## Why this (and not browser automation)

Posting to Instagram by driving a browser is against Instagram's Terms **even when it looks human** — it's fine for 1 account, but at scale it gets client accounts **action-blocked or banned**. This project uses Meta's official **Content Publishing API**, which is *built* for third-party tools posting on behalf of many business accounts. That is the single thing that makes safe scaling possible.

---

## Architecture

```
 Client (WhatsApp)  ──►  /webhook/whatsapp  ──►  conversation.js (state machine)
                                                     │
                    photo ─► images.js (enhance+host) ┤
                                                     ├─► ai.js (caption / replies)
                    "YES" ─► instagram.js (Graph API 3-step publish) ─► @client_ig
 Client (browser)  ──►  /onboarding  ──►  Facebook Login ─► discover IG ─► save token + brand
 You / sales team  ──►  /dashboard   ──►  clients, statuses, published posts
```

Files:
- `src/services/instagram.js` — OAuth token exchange, IG discovery, **create container → poll → publish**
- `src/services/whatsapp.js`  — send text/image, download inbound media, 24h-window helpers
- `src/services/ai.js`        — captions + natural conversation (Anthropic/OpenAI, with fallbacks)
- `src/services/images.js`    — enhancement hook + public hosting (Instagram needs a public image URL)
- `src/conversation.js`       — the bot brain (greet → photo → preview → approve → publish)
- `src/routes/*`              — WhatsApp webhook, onboarding OAuth, dashboard
- `scripts/test-*.js`         — end-to-end tests (no live Meta calls needed)

---

## Prerequisites (one-time, your side)

1. **A Meta Developer App** — https://developers.facebook.com → Create App (type: Business).
2. **A Facebook Page + Instagram Business/Creator account** linked to it (for your own test), and one per client.
3. **WhatsApp Cloud API** number (added under the app's WhatsApp product) + a permanent access token (system user recommended).
4. **A public HTTPS server** (Render, Railway, Fly.io, a VPS…). Meta requires HTTPS for OAuth redirects and webhooks. For local dev use `ngrok`.
5. **App Review** for `instagram_content_publish` + WhatsApp messaging. Until approved you can run in **Development mode** with a limited set of accounts you add as testers — enough to onboard your first real clients and start earning while review is pending.

---

## Setup

```bash
npm install
cp .env.example .env      # then fill in the values below
npm start
```

Fill `.env`:
- `PUBLIC_URL` — your public https URL
- `META_APP_ID`, `META_APP_SECRET`
- Register redirect URI in the Meta app: `PUBLIC_URL/onboarding/callback`
- `WA_PHONE_NUMBER_ID`, `WA_ACCESS_TOKEN`, `WA_VERIFY_TOKEN`, `WA_BUSINESS_NUMBER`
- Configure the WhatsApp webhook in Meta → callback URL `PUBLIC_URL/webhook/whatsapp`, verify token = `WA_VERIFY_TOKEN`, subscribe to **messages**.
- `AI_PROVIDER` + the matching API key (captions/replies). Leave `none` to run scripted fallbacks.
- (optional) `IMAGE_PROVIDER` for real enhancement, `STRIPE_*` for billing.

---

## Test it (no Meta account needed)

```bash
npm run test:flow     # simulates a full WhatsApp conversation to a published post
node scripts/test-server.js   # boots the app and checks every route
```

Both should print PASS.

---

## How a client gets onboarded

1. Sales closes the client → sends them `PUBLIC_URL/onboarding`.
2. Client clicks **Connect Instagram** → Facebook Login → approves.
3. Client fills the brand form (name, WhatsApp number, style, hashtags…).
4. Client messages your WhatsApp business number → the bot takes over.

You watch everything at `PUBLIC_URL/dashboard?token=ADMIN_TOKEN`.

---

## Important Meta rules baked in

- **24-hour window:** the bot can reply freely for 24h after the client's last message. To *initiate* contact later (e.g. "send today's photo") you must send a pre-approved **template** — `whatsapp.js` has `sendTemplate()` ready.
- **Public image URL:** Instagram fetches the image from a URL, so enhanced photos are hosted at `PUBLIC_URL/public/...`. Keep that server reachable.
- **Rate limits:** ~25 API-published posts per IG account per 24h — plenty.

---

## What's ready vs. what to wire next

Ready & tested: onboarding OAuth flow, WhatsApp webhook + conversation state machine, Instagram 3-step publisher, dashboard, billing hook, full test suite.

Wire before production:
- Drop your **real image-enhancement** model into `images.js › enhance()`.
- Add **AI keys** for live captions/replies (works with fallbacks meanwhile).
- Move the JSON store in `db.js` to **Postgres/SQLite** for real scale.
- Complete **Meta App Review** to lift the dev-mode account limit.

## Roadmap
- Phase 1 (this repo): migrate publishing to official API + WhatsApp bot + onboarding. ✅
- Phase 2: scheduling/queue, per-client analytics reports, Stripe self-serve billing.
- Phase 3: multi-photo carousels + Reels, white-label onboarding for the sales team.
