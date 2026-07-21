// ============================================================
//  Conversation brain — drives the WhatsApp chat with each client.
//  State machine:
//    NEW            -> greet, ask for today's photo(s)
//    AWAITING_PHOTO -> on image: enhance + caption -> send preview -> AWAITING_APPROVAL
//    AWAITING_APPROVAL -> "yes" => publish to IG; "redo"/text => regenerate caption
//    IDLE           -> ready for next batch
//  AI generates natural language; the state machine guarantees the flow.
// ============================================================
const store = require('./db');
const wa = require('./services/whatsapp');
const ig = require('./services/instagram');
const images = require('./services/images');
const ai = require('./services/ai');

const YES = /\b(yes|yep|yeah|ok|okay|approve|approved|go|post it|publish|כן|מאשר|אישור|לפרסם|פרסם)\b/i;
const REDO = /\b(no|redo|change|again|different|לא|שנה|תשנה|שוב|אחר)\b/i;

async function say(to, text) { await wa.sendText(to, text); }

async function handleInbound({ from, type, text, imageId, brandOverride }) {
  const client = brandOverride || store.getClientByWa(from);
  const brand = client || { businessName: 'our studio', language: 'the user\'s language' };
  let convo = store.getConvo(from);
  convo.history = convo.history || [];
  if (text) convo.history.push({ role: 'user', content: text });

  // Not onboarded yet
  if (!client) {
    await say(from,
      "Hi! 👋 This number isn't linked to an account yet. Please finish the quick setup link your rep sent you, then message me again.");
    return;
  }

  // ---- IMAGE received ----
  if (type === 'image' && imageId) {
    await say(from, "Got it 📸 — enhancing your photo and writing a caption, one sec...");
    try {
      const { buffer } = await wa.downloadMedia(imageId);
      const publicUrl = await images.processForPost(buffer, brand);
      const caption = await ai.generateCaption(brand, text || '');
      convo.draft = { imageUrl: publicUrl, caption };
      convo.state = 'AWAITING_APPROVAL';
      store.setConvo(from, convo);
      await wa.sendImageByUrl(from, publicUrl,
        `Here's your post preview 👇\n\n${caption}\n\nReply *YES* to publish, or tell me what to change.`);
    } catch (e) {
      console.error(e);
      await say(from, "Hmm, I had trouble processing that image. Could you resend it?");
    }
    return;
  }

  // ---- TEXT received ----
  const t = (text || '').trim();

  if (convo.state === 'AWAITING_APPROVAL' && convo.draft) {
    if (YES.test(t)) {
      await say(from, "Publishing now... 🚀");
      try {
        const { mediaId } = await ig.publishPhoto({
          igUserId: client.igUserId,
          pageToken: client.pageToken,
          imageUrl: convo.draft.imageUrl,
          caption: convo.draft.caption,
        });
        store.logPost({ clientId: client.id, mediaId, caption: convo.draft.caption });
        convo.state = 'IDLE'; convo.draft = null;
        store.setConvo(from, convo);
        await say(from, `Done ✅ It's live on @${client.igUsername}. Send me the next photo whenever you're ready!`);
      } catch (e) {
        console.error('publish error', e.details || e.message);
        await say(from, "I couldn't publish that — I've flagged it for the team to check the Instagram connection. Nothing was posted.");
      }
      return;
    }
    if (REDO.test(t) || t.length > 0) {
      // treat any other text as a revision instruction
      const caption = await ai.generateCaption(brand, t);
      convo.draft.caption = caption;
      store.setConvo(from, convo);
      await wa.sendImageByUrl(from, convo.draft.imageUrl,
        `Updated 👇\n\n${caption}\n\nReply *YES* to publish, or tell me what to change.`);
      return;
    }
  }

  // ---- default / greeting / small talk ----
  const reply = await ai.conversationReply(brand, convo.state, convo.history, t);
  if (convo.state === 'NEW') { convo.state = 'AWAITING_PHOTO'; store.setConvo(from, convo); }
  await say(from, reply ||
    `Hi! I'm the assistant for ${brand.businessName}. Send me a photo and I'll enhance it, write a caption, and post it to Instagram after your OK. 📸`);
}

module.exports = { handleInbound };
