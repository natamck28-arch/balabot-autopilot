// WhatsApp Cloud API webhook: GET (verify) + POST (receive messages)
const express = require('express');
const cfg = require('../config');
const wa = require('../services/whatsapp');
const { handleInbound } = require('../conversation');

const router = express.Router();

// --- Verification handshake (Meta calls this once when you set the webhook) ---
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === cfg.wa.verifyToken) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// --- Inbound events ---
router.post('/', async (req, res) => {
  res.sendStatus(200); // ack fast; process async (Meta retries on non-200)
  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0]?.value;
    const msg = change?.messages?.[0];
    if (!msg) return; // status update, not a message

    const from = msg.from; // e.g. "9725..."
    await wa.markRead(msg.id);

    if (msg.type === 'text') {
      await handleInbound({ from, type: 'text', text: msg.text.body });
    } else if (msg.type === 'image') {
      await handleInbound({ from, type: 'image', imageId: msg.image.id, text: msg.image.caption });
    } else if (msg.type === 'interactive') {
      const t = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || '';
      await handleInbound({ from, type: 'text', text: t });
    } else {
      await wa.sendText(from, "I can work with photos and text 🙂 send me a photo to post!");
    }
  } catch (e) {
    console.error('webhook handler error', e);
  }
});

module.exports = router;
