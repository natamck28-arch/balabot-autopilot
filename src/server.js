const express = require('express');
const path = require('path');
const cfg = require('./config');

const app = express();
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, '..', 'public')));

app.get('/', (req, res) => res.send('Social Autopilot is running. Endpoints: /onboarding  /webhook/whatsapp  /dashboard'));
app.get('/health', (req, res) => res.json({ ok: true, graph: cfg.meta.graph, time: Date.now() }));

app.use('/onboarding', require('./routes/onboarding'));
app.use('/webhook/whatsapp', require('./routes/whatsapp'));
app.use('/dashboard', require('./routes/dashboard'));

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
