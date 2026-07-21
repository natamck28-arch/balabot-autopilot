process.env.WA_VERIFY_TOKEN='verify-me'; process.env.ADMIN_TOKEN='test123';
const app = require('../src/server');
const server = app.listen(0, async () => {
  const base = 'http://localhost:' + server.address().port;
  const get = (p, h) => fetch(base + p, { headers: h }).then(async r => ({ s: r.status, t: await r.text() }));
  let pass = true;
  const check = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) pass = false; };

  const health = await get('/health');   check('GET /health 200', health.s === 200 && /"ok":true/.test(health.t));
  const onb = await get('/onboarding');   check('GET /onboarding page', onb.s === 200 && /Connect Instagram/.test(onb.t));
  const wh = await get('/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=XYZ');
  check('webhook verify echoes challenge', wh.s === 200 && wh.t === 'XYZ');
  const whBad = await get('/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=XYZ');
  check('webhook verify bad token 403', whBad.s === 403);
  const dashNo = await get('/dashboard');  check('dashboard no token 401', dashNo.s === 401);
  const dashOk = await get('/dashboard/api/clients', { 'x-admin-token': 'test123' });
  check('dashboard api with token json', dashOk.s === 200 && /"clients"/.test(dashOk.t));

  server.close();
  console.log(pass ? 'SERVER BOOT TEST PASSED' : 'SERVER BOOT TEST FAILED');
  process.exit(pass ? 0 : 1);
});
