// Simulates a full client conversation WITHOUT hitting Meta.
// Verifies the state machine: greet -> photo -> preview -> approve -> "published".
process.env.AI_PROVIDER = 'none';
const store = require('../src/db');
const wa = require('../src/services/whatsapp');
const ig = require('../src/services/instagram');
const images = require('../src/services/images');

// --- mocks ---
const sent = [];
wa.sendText = async (to, t) => { sent.push(['text', t]); console.log('  🤖 →', t); };
wa.sendImageByUrl = async (to, url, cap) => { sent.push(['image', cap]); console.log('  🤖 →[image]', cap.split('\n')[0]); };
wa.downloadMedia = async () => ({ buffer: Buffer.from('fake'), mime: 'image/jpeg' });
wa.markRead = async () => {};
images.processForPost = async () => 'https://example.com/enhanced.jpg';
ig.publishPhoto = async () => ({ mediaId: 'IG_MEDIA_123' });

const { handleInbound } = require('../src/conversation');

(async () => {
  const WA = '972500000000';
  store.upsertClient({ id: 'IGUSER1', igUserId: 'IGUSER1', igUsername: 'bellasbakery',
    pageToken: 'PT', businessName: "Bella's Bakery", waNumber: WA, language: 'English', status: 'active' });

  console.log('\n👤 client: "hi"');            await handleInbound({ from: WA, type: 'text', text: 'hi' });
  console.log('\n👤 client: [sends photo]');    await handleInbound({ from: WA, type: 'image', imageId: 'IMG1', text: 'fresh croissants' });
  console.log('\n👤 client: "yes"');            await handleInbound({ from: WA, type: 'text', text: 'yes' });

  const published = sent.some(([_, t]) => /live on @bellasbakery/i.test(t));
  console.log('\n----------------------------------------');
  console.log(published ? '✅ PASS — full flow reached publish + confirmation' : '❌ FAIL — did not confirm publish');
  process.exit(published ? 0 : 1);
})();
