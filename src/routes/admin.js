// Admin utilities (token-protected): verify the WhatsApp token and send a
// first "opener" message so the bot can start a conversation with a number.
const express = require('express');
const cfg = require('../config');
const router = express.Router();
const G = cfg.graphUrl;

function auth(req, res, next) {
  if ((req.query.token || req.headers['x-admin-token']) !== cfg.adminToken)
    return res.status(401).json({ error: 'unauthorized' });
  next();
}

// Is the stored WA_ACCESS_TOKEN valid? (calls Meta from the server, which CAN reach it)
router.get('/wa-check', auth, async (req, res) => {
  try {
    const r = await fetch(`${G}/${cfg.wa.phoneNumberId}?fields=display_phone_number,verified_name&access_token=${cfg.wa.token}`);
    const j = await r.json();
    res.status(r.ok ? 200 : 400).json({ ok: r.ok, data: j });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Send an opener. Tries a plain text first (works if inside 24h window),
// falls back to the default 'hello_world' template to open a fresh conversation.
router.get('/wa-send', auth, async (req, res) => {
  const to = (req.query.to || '').replace(/[^0-9]/g, '');
  if (!to) return res.status(400).json({ error: 'pass ?to=<number, digits only>' });
  const send = (body) => fetch(`${G}/${cfg.wa.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.wa.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, ...body }),
  }).then(async r => ({ status: r.status, json: await r.json() }));

  try {
    // template opener (reliable for first contact)
    const tpl = await send({ type: 'template', template: { name: 'hello_world', language: { code: 'en_US' } } });
    return res.status(200).json({ tried: 'hello_world_template', result: tpl });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

module.exports = router;

// (appended) view the most recent inbound webhook payloads
router.get('/last-inbound', (req, res) => {
  if ((req.query.token || req.headers['x-admin-token']) !== cfg.adminToken)
    return res.status(401).json({ error: 'unauthorized' });
  res.json({ count: (global.__lastInbound || []).length, items: global.__lastInbound || [] });
});

// (appended) Subscribe THIS app to the WABA's webhooks — the step that actually
// makes inbound messages flow to our /webhook/whatsapp. Uses the permanent token.
const WABA_ID = '2199839434199553';
router.get('/wa-subs', auth, async (req, res) => {
  const r = await fetch(`${G}/${WABA_ID}/subscribed_apps?access_token=${cfg.wa.token}`);
  res.status(r.status).json(await r.json());
});
router.get('/wa-subscribe', auth, async (req, res) => {
  const r = await fetch(`${G}/${WABA_ID}/subscribed_apps`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.wa.token}` },
  });
  res.status(r.status).json(await r.json());
});

// (appended) seed a demo client so a WhatsApp number gets the full bot flow
router.get('/seed-client', auth, (req, res) => {
  const wa = (req.query.wa || '').replace(/[^0-9]/g, '');
  if (!wa) return res.status(400).json({ error: 'pass ?wa=<number>' });
  const store = require('../db');
  const c = store.upsertClient({
    id: 'demo-' + wa, waNumber: wa,
    businessName: req.query.name || 'העסק שלי',
    language: 'Hebrew', style: 'חם וידידותי',
    hashtags: '#עסק #מקומי', status: 'active',
  });
  res.json({ ok: true, client: { id: c.id, waNumber: c.waNumber, businessName: c.businessName } });
});

// (appended) Export connected (non-demo) clients as a SEED_CLIENTS-ready JSON
// string. Paste the value into the SEED_CLIENTS env var so the Instagram
// connection (incl. pageToken) survives free-tier redeploys/restarts.
router.get('/export-seed', auth, (req, res) => {
  const store = require('../db');
  const connected = store.listClients().filter(c => c.igUserId && c.pageToken);
  const seed = connected.map(c => ({
    id: c.id, igUserId: c.igUserId, pageId: c.pageId, pageToken: c.pageToken,
    igUsername: c.igUsername, igAvatar: c.igAvatar,
    businessName: c.businessName, waNumber: c.waNumber,
    language: c.language, style: c.style, voiceRules: c.voiceRules,
    hashtags: c.hashtags, frequency: c.frequency, status: c.status || 'active',
  }));
  res.type('application/json').send(JSON.stringify(seed));
});

// (appended) Whisper transcription: upload an audio file, get verbose_json transcript.
// Uses the server's OPENAI_API_KEY. GET serves a simple upload form; POST does the work.
const multer = require('multer');
const _upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });

router.get('/transcribe', auth, (req, res) => {
  const tok = req.query.token || '';
  res.type('html').send(`<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;max-width:560px;margin:40px auto">
<h2>Transcribe audio (Whisper)</h2>
<form method="post" action="/admin/transcribe?token=${tok}" enctype="multipart/form-data">
  <input type="file" name="audio" accept="audio/*" required><br><br>
  <button type="submit">Transcribe</button>
</form><p>Returns verbose_json with segment timestamps.</p></body>`);
});

router.post('/transcribe', auth, _upload.single('audio'), async (req, res) => {
  try {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return res.status(400).json({ error: 'OPENAI_API_KEY not set' });
    if (!req.file) return res.status(400).json({ error: 'no audio file' });
    const form = new FormData();
    form.append('model', 'whisper-1');
    form.append('response_format', 'verbose_json');
    form.append('file', new Blob([req.file.buffer]), req.file.originalname || 'audio.mp3');
    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form,
    });
    const j = await r.json();
    res.status(r.ok ? 200 : 400).type('application/json').send(JSON.stringify(j));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Diagnose the image-enhancement pipeline: provider, key presence, and a LIVE
// gpt-image test so we see the exact reason it's not upgrading photos.
router.get('/enhance-check', auth, async (req, res) => {
  const out = {
    provider: cfg.images.provider,
    hasOpenAIKey: !!process.env.OPENAI_API_KEY,
    imageProviderEnv: process.env.IMAGE_PROVIDER || '(unset)',
  };
  try {
    let sharp = null; try { sharp = require('sharp'); } catch (_) {}
    if (!sharp) { out.test = 'skipped: sharp not available'; return res.json(out); }
    if (!process.env.OPENAI_API_KEY) { out.test = 'skipped: no OPENAI_API_KEY'; return res.json(out); }
    const png = await sharp({ create: { width: 256, height: 256, channels: 3, background: { r: 180, g: 120, b: 90 } } }).png().toBuffer();
    const form = new FormData();
    form.append('model', 'gpt-image-1');
    form.append('prompt', 'Improve the photographic quality only.');
    form.append('size', '1024x1024');
    form.append('image', new Blob([png], { type: 'image/png' }), 'photo.png');
    const t0 = Date.now();
    const r = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form });
    const j = await r.json();
    out.httpStatus = r.status;
    out.ms = Date.now() - t0;
    if (j.error) out.apiError = { type: j.error.type, code: j.error.code, message: j.error.message };
    else out.test = j.data?.[0]?.b64_json ? 'OK: gpt-image returned an image ✅' : 'no image + no error (unexpected)';
  } catch (e) { out.exception = e.message; }
  res.json(out);
});
