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
