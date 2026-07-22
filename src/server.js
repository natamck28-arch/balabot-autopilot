const express = require('express');
const path = require('path');
const cfg = require('./config');

const app = express();
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, '..', 'public')));

app.get('/', (req, res) => res.send('Social Autopilot is running. Endpoints: /onboarding  /webhook/whatsapp  /dashboard'));
app.get('/health', (req, res) => res.json({ ok: true, graph: cfg.meta.graph, time: Date.now() }));


// Seed clients on boot (survives free-tier filesystem resets, which wipe the JSON store).
try {
  const store = require('./db');
  const DEFAULT_CLIENTS = [
    { id: 'demo-972532842777', waNumber: '972532842777', businessName: '\u05d4\u05e2\u05e1\u05e7 \u05e9\u05dc \u05e8\u05d5\u05dd', language: 'Hebrew', status: 'active' },
    { id: 'demo-972525336366', waNumber: '972525336366', businessName: '\u05d4\u05e2\u05e1\u05e7 \u05e9\u05dc \u05d4\u05e9\u05d5\u05ea\u05e3', language: 'Hebrew', status: 'active' },
  ];
  let seed = DEFAULT_CLIENTS;
  try { const extra = JSON.parse(process.env.SEED_CLIENTS || '[]'); if (Array.isArray(extra)) seed = seed.concat(extra); } catch (_) {}
  seed.forEach(c => store.upsertClient(c));
  console.log('Seeded ' + seed.length + ' client(s) on boot');
} catch (e) { console.error('boot seed error:', e.message); }

app.use('/', require('./routes/legal'));
app.use('/onboarding', require('./routes/onboarding'));
app.use('/webhook/whatsapp', require('./routes/whatsapp'));
app.use('/dashboard', require('./routes/dashboard'));
app.use('/admin', require('./routes/admin'));

if (require.main === module) {
  app.listen(cfg.port, () => {
    console.log('\n  Social Autopilot running on :' + cfg.port);
    console.log('  Onboarding ▸ ' + cfg.publicUrl + '/onboarding');
    console.log('  WA webhook ▸ ' + cfg.publicUrl + '/webhook/whatsapp');
    console.log('  Dashboard  ▸ ' + cfg.publicUrl + '/dashboard?token=' + cfg.adminToken + '\n');
    if (!cfg.meta.appId) console.log('  WARN: META_APP_ID not set - fill in .env before connecting clients.');
  });
}
module.exports = app;
