// ============================================================
//  Billing (Stripe) — optional. Creates a checkout link for a
//  client's monthly subscription. Safe no-op if not configured.
// ============================================================
const cfg = require('../config');
let stripe = null;
try { if (cfg.billing.stripeKey) stripe = require('stripe')(cfg.billing.stripeKey); } catch (_) {}

async function createSubscriptionCheckout({ clientId, email }) {
  if (!stripe || !cfg.billing.priceId) {
    return { url: null, note: 'Stripe not configured (set STRIPE_SECRET_KEY + STRIPE_PRICE_ID).' };
  }
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: cfg.billing.priceId, quantity: 1 }],
    customer_email: email,
    client_reference_id: clientId,
    success_url: `${cfg.publicUrl}/onboarding/billed?ok=1`,
    cancel_url: `${cfg.publicUrl}/onboarding/billed?ok=0`,
  });
  return { url: session.url };
}

module.exports = { createSubscriptionCheckout, enabled: !!stripe };
