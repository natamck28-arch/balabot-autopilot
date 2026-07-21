// Minimal JSON-file datastore. Swap for Postgres/SQLite in production.
// Stores: clients (each with IG token + brand profile + WA number) and conversation state.
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'store.json');

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return { clients: {}, convos: {}, posts: [] }; }
}
function save(db) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(db, null, 2));
}

let db = load();

const store = {
  // ---- clients ----
  upsertClient(client) {
    const id = client.id || client.igUserId || String(Date.now());
    db.clients[id] = { ...(db.clients[id] || {}), ...client, id, updatedAt: Date.now() };
    save(db);
    return db.clients[id];
  },
  getClient(id) { return db.clients[id] || null; },
  getClientByWa(waNumber) {
    return Object.values(db.clients).find(c => c.waNumber === waNumber) || null;
  },
  listClients() { return Object.values(db.clients); },

  // ---- conversation state (keyed by whatsapp number) ----
  getConvo(waNumber) {
    return db.convos[waNumber] || { state: 'NEW', draft: null, history: [] };
  },
  setConvo(waNumber, convo) {
    db.convos[waNumber] = { ...convo, updatedAt: Date.now() };
    save(db);
    return db.convos[waNumber];
  },

  // ---- posts log ----
  logPost(entry) { db.posts.push({ ...entry, at: Date.now() }); save(db); },
  listPosts() { return db.posts; },

  _raw() { return db; },
  _reload() { db = load(); },
};

module.exports = store;
