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
