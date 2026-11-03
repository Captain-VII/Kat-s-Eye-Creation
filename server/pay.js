// Paiement : Stripe Checkout et PayPal, par leurs API REST (pas de SDK).
// Les pages de paiement sont hébergées chez eux : aucune donnée bancaire ne passe par le VPS.
import { createHmac, timingSafeEqual } from 'node:crypto';

const env = process.env;
export const enabled = () => ({ stripe: !!env.STRIPE_SECRET_KEY, paypal: !!(env.PAYPAL_CLIENT_ID && env.PAYPAL_SECRET) });
const label = it => (it.option ? `${it.name} (${it.option})` : it.name).slice(0, 120);

async function stripe(path, params) {
  const r = await fetch('https://api.stripe.com/v1/' + path, {
    method: params ? 'POST' : 'GET',
    headers: { Authorization: 'Bearer ' + env.STRIPE_SECRET_KEY },
    body: params && new URLSearchParams(params)
  });
  const data = await r.json();
  if (!r.ok) throw new Error('Stripe : ' + (data.error?.message || r.status));
  return data;
}

export async function stripeCheckout(order, base, shippingLabel) {
  const p = {
    mode: 'payment', locale: 'fr', customer_email: order.customer.email,
    client_reference_id: order.id, 'metadata[commande]': order.id,
    success_url: `${base}/api/stripe/retour?commande=${order.id}&session={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/panier?paiement=annule`
  };
  order.items.forEach((it, i) => {
    const k = `line_items[${i}]`;
    p[k + '[quantity]'] = it.qty;
    p[k + '[price_data][currency]'] = 'eur';
    p[k + '[price_data][unit_amount]'] = it.price;
    p[k + '[price_data][product_data][name]'] = label(it);
  });
  if (order.shipping) {
    const k = 'shipping_options[0][shipping_rate_data]';
    p[k + '[type]'] = 'fixed_amount';
    p[k + '[display_name]'] = shippingLabel;
    p[k + '[fixed_amount][amount]'] = order.shipping;
    p[k + '[fixed_amount][currency]'] = 'eur';
  }
  const s = await stripe('checkout/sessions', p);
  return { url: s.url, ref: s.id };
}

export const stripeSession = id => stripe('checkout/sessions/' + encodeURIComponent(id));

// Vérifie la signature d'un webhook Stripe (en-tête Stripe-Signature) et renvoie l'événement, ou null.
export function verifyStripe(raw, header = '', secret = env.STRIPE_WEBHOOK_SECRET) {
  let t; const sigs = [];
  for (const kv of String(header).split(',')) {
    const [k, v] = kv.split('=');
    if (k === 't') t = v; else if (k === 'v1') sigs.push(v);
  }
  if (!secret || !t || Math.abs(Date.now() / 1000 - Number(t)) > 300) return null;
  const expected = createHmac('sha256', secret).update(`${t}.${raw}`).digest();
  const ok = sigs.some(s => { const b = Buffer.from(s, 'hex'); return b.length === expected.length && timingSafeEqual(b, expected); });
  return ok ? JSON.parse(raw) : null;
}

const ppBase = () => env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

async function paypal(path, body) {
  const auth = Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_SECRET}`).toString('base64');
  const tok = await fetch(ppBase() + '/v1/oauth2/token', {
    method: 'POST', body: 'grant_type=client_credentials',
    headers: { Authorization: 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded' }
  }).then(r => r.json());
  if (!tok.access_token) throw new Error('PayPal : identifiants refusés');
  const r = await fetch(ppBase() + path, {
    method: 'POST', body: JSON.stringify(body ?? {}),
    headers: { Authorization: 'Bearer ' + tok.access_token, 'Content-Type': 'application/json' }
  });
  const data = await r.json();
  if (!r.ok) throw new Error('PayPal : ' + (data.details?.[0]?.issue || data.name || r.status));
  return data;
}

const eur = cents => ({ currency_code: 'EUR', value: (cents / 100).toFixed(2) });

export async function paypalCheckout(order, base, brand) {
  const o = await paypal('/v2/checkout/orders', {
    intent: 'CAPTURE',
    purchase_units: [{
      reference_id: order.id, custom_id: order.id, description: `Commande ${order.id}`,
      amount: { ...eur(order.total), breakdown: { item_total: eur(order.subtotal), shipping: eur(order.shipping) } },
      items: order.items.map(it => ({ name: label(it), quantity: String(it.qty), unit_amount: eur(it.price), category: 'PHYSICAL_GOODS' }))
    }],
    payment_source: { paypal: { experience_context: {
      brand_name: brand.slice(0, 127), locale: 'fr-FR', shipping_preference: 'NO_SHIPPING', user_action: 'PAY_NOW',
      return_url: `${base}/api/paypal/retour?commande=${order.id}`, cancel_url: `${base}/panier?paiement=annule`
    } } }
  });
  return { url: o.links.find(l => l.rel === 'payer-action').href, ref: o.id };
}

export async function paypalCapture(id) {
  const c = await paypal(`/v2/checkout/orders/${encodeURIComponent(id)}/capture`);
  const cap = c.purchase_units?.[0]?.payments?.captures?.[0];
  return { paid: c.status === 'COMPLETED' && cap?.status === 'COMPLETED', ref: cap?.id, amount: Math.round(parseFloat(cap?.amount?.value) * 100) };
}
