// Legal / compliance pages required by Meta App Review:
// Privacy Policy URL, Terms of Service URL, and a Data Deletion instructions URL.
const express = require('express');
const router = express.Router();

const CONTACT = 'natamck28@gmail.com';
const UPDATED = 'July 2026';

function page(title, bodyHtml) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — balabot</title>
<style>
 body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:760px;margin:40px auto;padding:0 20px;color:#1a1a1a;line-height:1.6}
 h1{font-size:28px;margin-bottom:4px} h2{font-size:19px;margin-top:28px}
 .muted{color:#666;font-size:14px} a{color:#c2185b}
 code{background:#f3f3f3;padding:1px 5px;border-radius:4px}
</style></head><body>
<h1>${title}</h1><p class="muted">balabot &middot; Last updated: ${UPDATED}</p>
${bodyHtml}
<hr style="margin:32px 0;border:none;border-top:1px solid #eee">
<p class="muted">Questions? Contact us at <a href="mailto:${CONTACT}">${CONTACT}</a>.</p>
</body></html>`;
}

router.get('/privacy', (req, res) => res.type('html').send(page('Privacy Policy', `
<p>balabot ("we", "us") provides an AI assistant that helps business owners create and publish content to their own social media accounts (such as Instagram and Facebook Pages) through a WhatsApp conversation. This policy explains what we collect and how we use it.</p>
<h2>Information we collect</h2>
<ul>
 <li><b>WhatsApp messages &amp; media</b> you send to our business number — text, photos, and videos — so we can prepare and publish your posts.</li>
 <li><b>Your WhatsApp phone number</b>, used to identify your account and reply to you.</li>
 <li><b>Social account connection data</b> you grant via Facebook Login — your Instagram Business account ID/username, connected Facebook Page ID, and an access token used to publish on your behalf.</li>
 <li><b>Content we generate for you</b> — captions and enhanced images — and a log of what was published.</li>
</ul>
<h2>How we use it</h2>
<p>Only to operate the service you asked for: generating captions, enhancing images, showing you a preview, and — after your explicit approval — publishing the post to your own connected accounts. We do not sell your data or use it for advertising.</p>
<h2>Third-party services</h2>
<p>To provide the service we send data to: <b>Meta / Instagram / Facebook</b> (to publish your posts), <b>OpenAI</b> (image enhancement/generation), and <b>Anthropic</b> (caption writing and conversation). Each processes data under its own terms.</p>
<h2>Retention &amp; deletion</h2>
<p>We keep your connection and content only as long as needed to run the service. You can request deletion at any time — see our <a href="/data-deletion">Data Deletion</a> page.</p>
<h2>Your rights</h2>
<p>You may request access to, correction of, or deletion of your data by emailing <a href="mailto:${CONTACT}">${CONTACT}</a>. You can disconnect at any time from your Facebook/Instagram settings under Business Integrations.</p>
`)));

router.get('/terms', (req, res) => res.type('html').send(page('Terms of Service', `
<p>By using balabot you agree to these terms.</p>
<h2>The service</h2>
<p>balabot helps you draft and publish content to your own social media accounts via WhatsApp. Nothing is published without your explicit approval in the chat.</p>
<h2>Your responsibilities</h2>
<ul>
 <li>You own or are authorized to manage the social accounts you connect, and the content you send.</li>
 <li>You will not use the service for unlawful, infringing, or policy-violating content, and you comply with the platform policies of Meta/Instagram/Facebook.</li>
</ul>
<h2>Availability &amp; liability</h2>
<p>The service is provided "as is", without warranties. We are not liable for platform outages, rejected posts, or content decisions made by third-party platforms. Publishing is subject to the rules of the destination platform.</p>
<h2>Changes &amp; termination</h2>
<p>We may update the service or these terms. You may stop using it and disconnect your accounts at any time.</p>
`)));

router.get('/data-deletion', (req, res) => res.type('html').send(page('Data Deletion Instructions', `
<p>You can have all data associated with your balabot account deleted at any time.</p>
<h2>How to request deletion</h2>
<ol>
 <li>Email <a href="mailto:${CONTACT}">${CONTACT}</a> from the address associated with your account, with the subject "Delete my data", <b>or</b> send the WhatsApp message <code>DELETE MY DATA</code> to our business number.</li>
 <li>We will delete your stored connection (tokens), brand profile, conversation state, and content/post logs within 30 days and confirm by email.</li>
</ol>
<h2>Disconnecting</h2>
<p>You can also revoke balabot's access immediately from Facebook: Settings &rarr; Security &rarr; Business Integrations &rarr; remove "balabot Social". This stops all publishing on your behalf.</p>
`)));

module.exports = router;
