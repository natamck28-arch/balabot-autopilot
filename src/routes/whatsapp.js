// WhatsApp Cloud API webhook: GET (verify) + POST (receive messages)
const express = require('express');
const cfg = require('../config');
const wa = require('../services/whatsapp');
const { handleInbound } = require('../conversation');

const router = express.Router();

// keep the last few inbound payloads in memory for debugging (see /admin/last-inbound)
global.__lastInbound = global.__lastInbound || [];

router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === cfg.wa.verifyToken) return res.status(200).send(challenge);
  return res.sendStatus(403);
});

router.post('/', async (req, res) => {
  res.sendStatus(200);
  try {
    console.log('WEBHOOK IN:', JSON.stringify(req.body));
    global.__lastInbound.push({ at: Date.now(), body: req.body });
    if (global.__lastInbound.length > 20) global.__lastInbound.shift();

    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0]?.value;
    const msg = change?.messages?.[0];
    if (!msg) { console.log('  (no message in payload — status/other)'); return; }

    const from = msg.from;
    console.log('  message from', from, 'type', msg.type);
    await wa.markRead(msg.id);

    if (msg.type === 'text') {
      await handleInbound({ from, type: 'text', text: msg.text.body });
    } else if (msg.type === 'image') {
      await handleInbound({ from, type: 'image', imageId: msg.image.id, text: msg.image.caption });
    } else if (msg.type === 'video') {
      await handleInbound({ from, type: 'video', videoId: msg.video.id, text: msg.video.caption });
    } else if (msg.type === 'audio') {
      await handleInbound({ from, type: 'audio', audioId: msg.audio.id });
    } else if (msg.type === 'document' && /audio|mpeg|wav|ogg|mp3|m4a|aac|flac/i.test(msg.document?.mime_type || '')) {
      await handleInbound({ from, type: 'audio', audioId: msg.document.id });
    } else if (msg.type === 'interactive') {
      const t = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || '';
      await handleInbound({ from, type: 'text', text: t });
    } else {
      await wa.sendText(from, "אפשר לשלוח לי תמונה/סרטון לפוסט, קישור לאתר לסקירה, או קובץ אודיו לניתוח מיקס 🙂");
    }
    console.log('  handled OK');
  } catch (e) {
    console.error('webhook handler error', e);
  }
});

module.exports = router;
