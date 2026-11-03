// Tests du serveur : catalogue, commande (prix recalculés, stock), paiement simulé, webhook signé, admin.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';

const dir = mkdtempSync(join(tmpdir(), 'kats-'));
Object.assign(process.env, { DATA_DIR: dir, ADMIN_PASSWORD: 'test-admin', STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_test', PUBLIC_URL: 'http://localhost' });
delete process.env.SMTP_URL;

// Simule l'API Stripe ; le reste passe par le vrai fetch.
const realFetch = globalThis.fetch, stripeCalls = [];
let session = {};
globalThis.fetch = async (url, opts = {}) => {
  if (!String(url).startsWith('https://api.stripe.com')) return realFetch(url, opts);
  stripeCalls.push({ url: String(url), body: opts.body && Object.fromEntries(opts.body) });
  return new Response(JSON.stringify(session));
};

const { server } = await import('./server.js');
let base;
before(() => new Promise(r => server.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${server.address().port}`; r(); })));
after(() => { server.close(); rmSync(dir, { recursive: true, force: true }); });

const post = (path, body, headers = {}) => realFetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const customer = { name: 'Claire Test', email: 'claire@example.fr', address: '1 rue des Lilas', zip: '44000', city: 'Nantes' };

test('catalogue public : produits d\'exemple en ligne', async () => {
  const list = await (await realFetch(base + '/api/products')).json();
  assert.ok(list.length >= 5);
  assert.ok(list.every(p => p.published && p.compo));
});

test('commande : prix pris dans le catalogue, livraison calculée', async () => {
  session = { id: 'cs_1', url: 'https://checkout.stripe.com/cs_1' };
  const r = await post('/api/checkout', { method: 'stripe', cgv: true, customer, items: [{ id: 'trousse-noisette', qty: 2, price: 1 }] });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).url, session.url);
  const b = stripeCalls.at(-1).body;
  assert.equal(b['line_items[0][price_data][unit_amount]'], '1900');
  assert.equal(b['line_items[0][quantity]'], '2');
  assert.equal(b['shipping_options[0][shipping_rate_data][fixed_amount][amount]'], '590'); // 38 € < 60 €
});

test('commande refusée : CGV, option manquante, stock dépassé, code postal', async () => {
  const bad = async (patch, status) => assert.equal((await post('/api/checkout', { method: 'stripe', cgv: true, customer, items: [{ id: 'trousse-noisette', qty: 1 }], ...patch })).status, status);
  await bad({ cgv: false }, 400);
  await bad({ items: [{ id: 'chale-clairiere', qty: 1 }] }, 400);
  await bad({ items: [{ id: 'chale-clairiere', qty: 1, option: 'Fuchsia' }] }, 400);
  await bad({ items: [{ id: 'etole-sous-bois', qty: 2 }] }, 409);
  await bad({ items: [{ id: 'inconnu', qty: 1 }] }, 409);
  await bad({ customer: { ...customer, zip: '4400' } }, 400);
  await bad({ method: 'paypal' }, 400); // PayPal non configuré dans ce test
});

test('webhook Stripe : signature vérifiée, commande payée et stock décrémenté', async () => {
  session = { id: 'cs_2', url: 'https://checkout.stripe.com/cs_2' };
  await post('/api/checkout', { method: 'stripe', cgv: true, customer, items: [{ id: 'etole-sous-bois', qty: 1 }] });
  const event = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_2', client_reference_id: null, payment_status: 'paid', amount_total: 4900 + 590, payment_intent: 'pi_1' } } });
  const sign = (body, secret = 'whsec_test') => { const t = Math.floor(Date.now() / 1000); return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`; };

  assert.equal((await post('/api/stripe/webhook', event, { 'Stripe-Signature': sign(event, 'mauvais') })).status, 400);

  const login = await post('/api/admin/login', { password: 'test-admin' });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const orders = async () => (await (await realFetch(base + '/api/admin/data', { headers: { cookie } })).json());
  const order = (await orders()).orders.find(o => o.payRef === 'cs_2');
  const ok = event.replace('"client_reference_id":null', `"client_reference_id":"${order.id}"`);
  assert.equal((await post('/api/stripe/webhook', ok, { 'Stripe-Signature': sign(ok) })).status, 200);
  await post('/api/stripe/webhook', ok, { 'Stripe-Signature': sign(ok) }); // rejoué : sans effet

  const d = await orders();
  assert.equal(d.orders.find(o => o.id === order.id).status, 'payée');
  assert.equal(d.products.find(p => p.id === 'etole-sous-bois').stock, 0);
  const csv = await (await realFetch(base + '/api/admin/recettes.csv', { headers: { cookie } })).text();
  assert.match(csv, new RegExp(`${order.id}";"Claire Test";"Vente de marchandises";"54,90"`));
});

test('admin : accès refusé sans connexion, mauvais mot de passe', async () => {
  assert.equal((await realFetch(base + '/api/admin/data')).status, 401);
  assert.equal((await post('/api/admin/login', { password: 'faux' })).status, 401);
  assert.equal((await realFetch(base + '/kit/', { redirect: 'manual' })).status, 303);
});

test('admin : publier exige composition et photo', async () => {
  const cookie = (await post('/api/admin/login', { password: 'test-admin' })).headers.get('set-cookie').split(';')[0];
  const put = body => realFetch(base + '/api/admin/products/nouveau', { method: 'PUT', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await put({ name: 'Robe Fougère', cat: 'Vêtements', price: '79', published: true, images: ['/img/mousse.jpg'] })).status, 400);
  const r = await put({ name: 'Robe Fougère', cat: 'Vêtements', price: '79.5', stock: '', compo: '100 % lin', published: true, images: ['/img/mousse.jpg', '../../etc/passwd'], optionLabel: 'Taille', optionValues: 'S, M ,L' });
  const p = await r.json();
  assert.equal(p.id, 'robe-fougere');
  assert.equal(p.price, 7950);
  assert.equal(p.stock, null);
  assert.deepEqual(p.images, ['/img/mousse.jpg']);
  assert.deepEqual(p.options, { label: 'Taille', values: ['S', 'M', 'L'] });
});

test('fichiers : pas de sortie du dossier, routes du site servies', async () => {
  assert.equal((await realFetch(base + '/..%2fserver%2fserver.js')).status, 404);
  assert.equal((await realFetch(base + '/uploads/..%2f..%2fpackage.json')).status, 404);
  const r = await realFetch(base + '/produit/robe-fougere');
  assert.equal(r.status, 200);
  assert.match(await r.text(), /<main id="app">/);
  assert.match(await (await realFetch(base + '/sitemap.xml')).text(), /produit\/robe-fougere/);
});
