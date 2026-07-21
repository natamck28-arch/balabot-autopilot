// Internal dashboard for you + the sales team (token-protected).
const express = require('express');
const path = require('path');
const cfg = require('../config');
const store = require('../db');

const router = express.Router();

function auth(req, res, next) {
  const t = req.query.token || req.headers['x-admin-token'];
  if (t !== cfg.adminToken) return res.status(401).send('Unauthorized. Append ?token=YOUR_ADMIN_TOKEN');
  next();
}

router.get('/', auth, (req, res) => res.sendFile(path.join(__dirname, '..', 'views', 'dashboard.html')));

router.get('/api/clients', auth, (req, res) => {
  const clients = store.listClients().map(c => ({
    id: c.id, businessName: c.businessName, igUsername: c.igUsername,
    waNumber: c.waNumber, status: c.status, frequency: c.frequency, updatedAt: c.updatedAt,
  }));
  res.json({ clients, posts: store.listPosts().slice(-50).reverse() });
});

module.exports = router;
