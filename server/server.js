// Serveur de la boutique : site, API, paiement Stripe/PayPal, e-mails et espace admin.
import http from 'node:http';
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, statSync, createReadStream } from 'node:fs';
import { join, extname, resolve, sep } from 'node:path';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as pay from './pay.js';
import { sendMail } from './mail.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
if (!process.env.NODE_TEST_CONTEXT) try { process.loadEnvFile(join(ROOT, '.env')); } catch {} // .env ignoré pendant les tests
const env = process.env;
const HTML = join(ROOT, 'html'), KIT = join(ROOT, 'kit');
const DATA = resolve(env.DATA_DIR || join(ROOT, 'data')), UPLOADS = join(DATA, 'uploads');
const PORT = +env.PORT || 8790;
const BASE = (env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, '');

// shortcut: données en fichiers JSON chargés en mémoire, un seul processus ; passer à SQLite au-delà de quelques milliers de commandes.
mkdirSync(UPLOADS, { recursive: true });
function save(name) { const f = join(DATA, name + '.json'); writeFileSync(f + '.tmp', JSON.stringify(db[name], null, 1)); renameSync(f + '.tmp', f); }
function load(name, seedFile) {
  const f = join(DATA, name + '.json');
  if (!existsSync(f)) writeFileSync(f, seedFile ? readFileSync(join(ROOT, 'server', seedFile)) : '[]');
  return JSON.parse(readFileSync(f, 'utf8'));
}
const db = {
  boutique: load('boutique', 'boutique.example.json'),
  products: load('products', 'produits-exemple.json'),
  orders: load('orders'), messages: load('messages'), newsletter: load('newsletter')
};
const shop = db.boutique;
const cents = e => Math.round(Number(e) * 100);
const euro = c => (c / 100).toFixed(2).replace('.', ',') + ' €';
const byId = id => db.products.find(p => p.id === id);

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const fail = (status, msg) => { throw new HttpError(status, msg); };

// --- HTTP ---
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };
const HEADERS = {
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'"
};
function send(res, status, data, headers = {}) {
  const isText = typeof data === 'string' || Buffer.isBuffer(data);
  res.writeHead(status, { ...HEADERS, 'Content-Type': isText ? 'text/plain; charset=utf-8' : 'application/json', 'Cache-Control': 'no-store', ...headers });
  res.end(isText ? data : JSON.stringify(data));
}
const redirect = (res, to) => { res.writeHead(303, { Location: to }); res.end(); };

function file(res, root, rel) {
  let f;
  try { f = resolve(root, decodeURIComponent(rel)); } catch { return false; }
  if (!f.startsWith(root + sep) || !existsSync(f) || !statSync(f).isFile()) return false;
  const ext = extname(f).toLowerCase();
  if (!MIME[ext]) return false;
  res.writeHead(200, { ...HEADERS, 'Content-Type': MIME[ext], 'Cache-Control': ext === '.html' || ext === '.js' ? 'no-cache' : 'public, max-age=604800' });
  createReadStream(f).pipe(res);
  return true;
}

async function body(req, limit = 1e5) {
  const chunks = []; let n = 0;
  for await (const c of req) { if ((n += c.length) > limit) fail(413, 'Envoi trop volumineux'); chunks.push(c); }
  return Buffer.concat(chunks);
}
async function json(req) {
  const raw = (await body(req)).toString();
  try { return raw ? JSON.parse(raw) : {}; } catch { fail(400, 'Requête invalide'); }
}
const ip = req => req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=')));

// Limite simple anti-abus : max requêtes par IP et par minute.
const hits = new Map();
function throttle(req, key, max) {
  const k = key + ip(req), now = Date.now(), h = hits.get(k);
  if (!h || h.reset < now) return hits.set(k, { n: 1, reset: now + 60_000 });
  if (++h.n > max) fail(429, 'Trop de tentatives, réessayez dans une minute');
}

// --- Validation ---
const str = (v, max) => String(v ?? '').trim().slice(0, max);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function need(v, max, what, re) { const s = str(v, max); if (!s || (re && !re.test(s))) fail(400, `${what} manquant ou invalide`); return s; }

// --- Boutique publique ---
const sold = o => ['payée', 'expédiée'].includes(o.status);

async function checkout(req, res) {
  throttle(req, 'checkout', 10);
  const b = await json(req);
  const method = b.method;
  if (!pay.enabled()[method]) fail(400, 'Mode de paiement indisponible');
  if (b.cgv !== true) fail(400, 'Merci d\'accepter les conditions générales de vente');
  const c = b.customer || {};
  const customer = {
    name: need(c.name, 100, 'Nom'), email: need(c.email, 150, 'E-mail', EMAIL), phone: str(c.phone, 30),
    address: need(c.address, 200, 'Adresse'), zip: need(c.zip, 10, 'Code postal', /^\d{5}$/), city: need(c.city, 80, 'Ville')
  };
  if (!Array.isArray(b.items) || !b.items.length || b.items.length > 30) fail(400, 'Panier vide');
  // Les prix viennent toujours du catalogue, jamais du navigateur.
  const items = b.items.map(l => {
    const p = byId(l.id);
    if (!p || !p.published) fail(409, 'Un article de votre panier n\'est plus disponible');
    const qty = Math.floor(l.qty);
    if (!(qty >= 1 && qty <= 20)) fail(400, 'Quantité invalide');
    const option = p.options ? str(l.option, 60) : '';
    if (p.options && !p.options.values.includes(option)) fail(400, `Choisissez une option pour « ${p.name} »`);
    return { id: p.id, name: p.name, option, qty, price: p.price };
  });
  for (const p of new Set(items.map(i => byId(i.id)))) {
    const want = items.filter(i => i.id === p.id).reduce((n, i) => n + i.qty, 0);
    if (p.stock != null && want > p.stock) fail(409, p.stock ? `Il ne reste que ${p.stock} « ${p.name} »` : `« ${p.name} » est épuisé`);
  }
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const shipping = subtotal >= cents(shop.livraison.offerteDes) ? 0 : cents(shop.livraison.prix);
  let id;
  do id = 'KE-' + new Date().toISOString().slice(2, 10).replace(/-/g, '') + '-' + randomBytes(3).toString('hex').toUpperCase(); while (db.orders.some(o => o.id === id));
  const order = {
    id, createdAt: new Date().toISOString(), status: 'en attente', method, customer, items, subtotal, shipping, total: subtotal + shipping,
    gift: !!b.gift, giftNote: b.gift ? str(b.giftNote, 500) : ''
  };
  const { url, ref } = method === 'stripe'
    ? await pay.stripeCheckout(order, BASE, `Livraison ${shop.livraison.transporteur}`)
    : await pay.paypalCheckout(order, BASE, shop.nom);
  order.payRef = ref;
  db.orders.push(order); save('orders');
  send(res, 200, { url });
}

function markPaid(order, ref) {
  if (order.status !== 'en attente') return;
  Object.assign(order, { status: 'payée', paidAt: new Date().toISOString(), payRef: ref || order.payRef });
  for (const it of order.items) { const p = byId(it.id); if (p && p.stock != null) p.stock -= it.qty; }
  save('orders'); save('products');
  const lines = order.items.map(i => `- ${i.qty} × ${i.name}${i.option ? ` (${i.option})` : ''} : ${euro(i.price * i.qty)}`).join('\n');
  const recap = `${lines}\nLivraison : ${order.shipping ? euro(order.shipping) : 'offerte'}\nTotal payé : ${euro(order.total)}\n\nLivraison à :\n${order.customer.name}\n${order.customer.address}\n${order.customer.zip} ${order.customer.city}`;
  sendMail({
    to: order.customer.email, replyTo: shop.email, subject: `Votre commande ${order.id} — ${shop.nom}`,
    text: `Bonjour ${order.customer.name},\n\nMerci pour votre commande ! Elle est bien payée et je commence à la préparer avec soin.\n\n${recap}\n\n` +
      `Expédition sous ${shop.livraison.delai} par ${shop.livraison.transporteur}. Vous recevrez un e-mail avec le numéro de suivi.\n\n` +
      `Droit de rétractation : vous disposez de 14 jours après réception pour changer d'avis (sauf pièces sur-mesure). ` +
      `Conditions générales de vente et formulaire de rétractation : ${BASE}/cgv\n\nÀ très vite,\nKat — ${shop.nom}\n${shop.email}\n\n${shop.nomLegal} — SIRET ${shop.siret} — ${shop.tva}`
  });
  sendMail({
    to: shop.email, replyTo: order.customer.email, subject: `Nouvelle commande ${order.id} (${euro(order.total)})`,
    text: `${recap}\n\nE-mail : ${order.customer.email}\nTéléphone : ${order.customer.phone || '—'}\n${order.gift ? `Cadeau. Mot : ${order.giftNote || '—'}\n` : ''}\nÀ préparer : ${BASE}/admin`
  });
}
const findOrder = id => db.orders.find(o => o.id === id) || fail(404, 'Commande introuvable');

async function stripeReturn(res, q) {
  const order = findOrder(q.get('commande'));
  const s = await pay.stripeSession(q.get('session') || '');
  if (s.id === order.payRef && s.payment_status === 'paid' && s.amount_total === order.total) markPaid(order, s.payment_intent);
  redirect(res, s.status === 'complete' ? `/merci?commande=${order.id}` : '/panier?paiement=annule');
}

async function stripeWebhook(req, res) {
  const event = pay.verifyStripe(await body(req, 1e6), req.headers['stripe-signature']);
  if (!event) fail(400, 'Signature invalide');
  const s = event.data?.object;
  if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type) && s.payment_status === 'paid') {
    const order = db.orders.find(o => o.id === s.client_reference_id && o.payRef === s.id);
    if (order && s.amount_total === order.total) markPaid(order, s.payment_intent);
  }
  send(res, 200, { received: true });
}

async function paypalReturn(res, q) {
  const order = findOrder(q.get('commande'));
  if (order.status === 'en attente' && q.get('token') === order.payRef) {
    try {
      const c = await pay.paypalCapture(order.payRef);
      if (c.paid && c.amount === order.total) markPaid(order, c.ref);
    } catch (e) { console.error(e.message); }
  }
  redirect(res, order.status === 'en attente' ? '/panier?paiement=echec' : `/merci?commande=${order.id}`);
}

async function message(req, res) {
  throttle(req, 'msg', 5);
  const b = await json(req);
  if (b.website) return send(res, 200, { ok: true }); // champ piège anti-robots
  const m = {
    id: randomBytes(6).toString('hex'), date: new Date().toISOString(), type: b.type === 'sur-mesure' ? 'sur-mesure' : 'contact',
    name: need(b.name, 100, 'Prénom'), email: need(b.email, 150, 'E-mail', EMAIL), kind: str(b.kind, 60), text: need(b.text, 4000, 'Message'), read: false
  };
  db.messages.push(m); save('messages');
  sendMail({ to: shop.email, replyTo: m.email, subject: `${m.type === 'sur-mesure' ? 'Demande sur-mesure' : 'Message'} de ${m.name}`, text: `${m.kind ? m.kind + '\n\n' : ''}${m.text}\n\n— ${m.name} <${m.email}>` });
  send(res, 200, { ok: true });
}

async function newsletter(req, res) {
  throttle(req, 'news', 5);
  const b = await json(req);
  if (b.website) return send(res, 200, { ok: true });
  const email = need(b.email, 150, 'E-mail', EMAIL).toLowerCase();
  if (!db.newsletter.some(n => n.email === email)) { db.newsletter.push({ email, date: new Date().toISOString() }); save('newsletter'); }
  send(res, 200, { ok: true });
}

// --- Admin ---
const sessions = new Map(), failures = new Map();
const digest = s => createHash('sha256').update(String(s)).digest();
const isAdmin = req => (sessions.get(cookies(req).kat_admin) || 0) > Date.now();

async function login(req, res) {
  const f = failures.get(ip(req));
  if (f && f.n >= 5 && f.until > Date.now()) fail(429, 'Trop d\'essais, réessayez dans 15 minutes');
  const { password } = await json(req);
  if (!env.ADMIN_PASSWORD || !timingSafeEqual(digest(password), digest(env.ADMIN_PASSWORD))) {
    failures.set(ip(req), { n: (f && f.until > Date.now() ? f.n : 0) + 1, until: Date.now() + 15 * 60_000 });
    fail(401, 'Mot de passe incorrect');
  }
  failures.delete(ip(req));
  const token = randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + 30 * 864e5);
  send(res, 200, { ok: true }, { 'Set-Cookie': `kat_admin=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000${BASE.startsWith('https') ? '; Secure' : ''}` });
}

const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'creation';

function saveProduct(id, b) {
  const old = id === 'nouveau' ? null : byId(id) || fail(404, 'Produit introuvable');
  const price = cents(b.price);
  if (!(price > 0)) fail(400, 'Prix invalide');
  const values = str(b.optionValues, 500).split(',').map(v => v.trim()).filter(Boolean).slice(0, 30);
  const p = {
    id: old?.id, name: need(b.name, 120, 'Nom'), cat: need(b.cat, 60, 'Catégorie'), detail: str(b.detail, 160), desc: str(b.desc, 4000),
    price, stock: b.stock === '' || b.stock == null ? null : Math.max(0, Math.floor(b.stock) || 0), unique: !!b.unique,
    options: values.length ? { label: str(b.optionLabel, 40) || 'Option', values } : null,
    images: (Array.isArray(b.images) ? b.images : []).filter(u => /^\/(uploads|img)\/[\w.-]+$/.test(u)).slice(0, 8),
    compo: str(b.compo, 1000), care: str(b.care, 1000), safety: str(b.safety, 1000), published: !!b.published
  };
  if (p.published && !p.compo) fail(400, 'La composition est obligatoire pour publier un article textile');
  if (p.published && !p.images.length) fail(400, 'Ajoutez au moins une photo pour publier');
  if (old) Object.assign(old, p);
  else {
    let s = slug(p.name), n = 1;
    while (byId(s)) s = slug(p.name) + '-' + ++n;
    db.products.unshift({ ...p, id: s, createdAt: new Date().toISOString() });
  }
  save('products');
  return old || db.products[0];
}

function updateOrder(order, b) {
  if (b.tracking !== undefined) order.tracking = str(b.tracking, 80);
  if (b.note !== undefined) order.note = str(b.note, 2000);
  const was = order.status;
  if (b.status === 'payée' && was === 'en attente') markPaid(order); // paiement confirmé à la main : stock et e-mails comme en ligne
  else if (b.status && b.status !== was) {
    if (!['en attente', 'payée', 'expédiée', 'remboursée', 'annulée'].includes(b.status)) fail(400, 'Statut inconnu');
    order.status = b.status;
    const at = { 'payée': 'paidAt', 'expédiée': 'shippedAt', 'remboursée': 'refundedAt' }[b.status];
    if (at) order[at] ||= new Date().toISOString();
    if (b.status === 'expédiée') sendMail({
      to: order.customer.email, replyTo: shop.email, subject: `Votre commande ${order.id} est en route !`,
      text: `Bonjour ${order.customer.name},\n\nVotre colis vient de partir par ${shop.livraison.transporteur}.` +
        `${order.tracking ? `\nNuméro de suivi : ${order.tracking}\nSuivre le colis : https://www.laposte.fr/outils/suivre-vos-envois?code=${encodeURIComponent(order.tracking)}` : ''}` +
        `\n\nJ'espère que votre création vous plaira. Un petit avis ou une photo sur Instagram (@${shop.instagram}) me ferait très plaisir !\n\nKat — ${shop.nom}`
    });
  }
  save('orders');
}

const csv = rows => '﻿' + rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
function recettes() {
  const rows = [['Date d\'encaissement', 'Référence', 'Client', 'Nature', 'Montant (€)', 'Mode de règlement']];
  const day = d => d.slice(0, 10).split('-').reverse().join('/');
  const amount = c => (c / 100).toFixed(2).replace('.', ',');
  for (const o of db.orders.filter(o => o.paidAt).sort((a, b) => a.paidAt.localeCompare(b.paidAt))) {
    const mode = o.method === 'stripe' ? 'Carte bancaire (Stripe)' : 'PayPal';
    rows.push([day(o.paidAt), o.id, o.customer.name, 'Vente de marchandises', amount(o.total), mode]);
    if (o.refundedAt) rows.push([day(o.refundedAt), o.id, o.customer.name, 'Remboursement', amount(-o.total), mode]);
  }
  return csv(rows);
}

async function admin(req, res, path, method) {
  if (path === '/api/admin/login' && method === 'POST') return login(req, res);
  if (!isAdmin(req)) fail(401, 'Connexion requise');
  const [, , , what, id] = path.split('/');
  if (what === 'logout') { sessions.delete(cookies(req).kat_admin); return send(res, 200, { ok: true }, { 'Set-Cookie': 'kat_admin=; Path=/; Max-Age=0' }); }
  if (what === 'data') return send(res, 200, { ...db, payments: pay.enabled() });
  if (what === 'products' && method === 'PUT') return send(res, 200, saveProduct(id, await json(req)));
  if (what === 'products' && method === 'DELETE') { db.products = db.products.filter(p => p.id !== id); save('products'); return send(res, 200, { ok: true }); }
  if (what === 'upload' && method === 'POST') {
    const ext = { 'image/webp': '.webp', 'image/jpeg': '.jpg', 'image/png': '.png' }[req.headers['content-type']] || fail(400, 'Format d\'image non accepté');
    const name = randomBytes(8).toString('hex') + ext;
    writeFileSync(join(UPLOADS, name), await body(req, 6e6));
    return send(res, 200, { url: '/uploads/' + name });
  }
  if (what === 'orders' && method === 'PATCH') { const o = findOrder(id); updateOrder(o, await json(req)); return send(res, 200, o); }
  if (what === 'messages' && method === 'PATCH') { const m = db.messages.find(m => m.id === id) || fail(404, 'Message introuvable'); m.read = !!(await json(req)).read; save('messages'); return send(res, 200, m); }
  if (what === 'messages' && method === 'DELETE') { db.messages = db.messages.filter(m => m.id !== id); save('messages'); return send(res, 200, { ok: true }); }
  if (what === 'newsletter' && method === 'DELETE') { db.newsletter = db.newsletter.filter(n => n.email !== decodeURIComponent(id)); save('newsletter'); return send(res, 200, { ok: true }); }
  if (what === 'recettes.csv') return send(res, 200, recettes(), { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="livre-des-recettes.csv"' });
  if (what === 'newsletter.csv') return send(res, 200, csv([['E-mail', 'Inscription'], ...db.newsletter.map(n => [n.email, n.date.slice(0, 10)])]), { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="newsletter.csv"' });
  fail(404, 'Introuvable');
}

const PAGES = ['', 'boutique', 'atelier', 'sur-mesure', 'contact', 'livraison-retours', 'cgv', 'mentions-legales', 'confidentialite'];
const sitemap = () => '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
  [...PAGES, ...db.products.filter(p => p.published).map(p => 'produit/' + p.id)].map(u => `<url><loc>${BASE}/${u}</loc></url>`).join('') + '</urlset>';

// --- Routage ---
async function handle(req, res) {
  const url = new URL(req.url, BASE), path = url.pathname, method = req.method;
  try {
    if (path.startsWith('/api/admin/')) return await admin(req, res, path, method);
    if (path === '/api/products') return send(res, 200, db.products.filter(p => p.published));
    if (path === '/api/shop') return send(res, 200, { ...shop, payments: pay.enabled() });
    if (path === '/api/checkout' && method === 'POST') return await checkout(req, res);
    if (path === '/api/stripe/retour') return await stripeReturn(res, url.searchParams);
    if (path === '/api/stripe/webhook' && method === 'POST') return await stripeWebhook(req, res);
    if (path === '/api/paypal/retour') return await paypalReturn(res, url.searchParams);
    if (path === '/api/message' && method === 'POST') return await message(req, res);
    if (path === '/api/newsletter' && method === 'POST') return await newsletter(req, res);
    if (path.startsWith('/api/')) fail(404, 'Introuvable');
    if (path === '/sitemap.xml') return send(res, 200, sitemap(), { 'Content-Type': 'application/xml' });
    if (path === '/robots.txt') return send(res, 200, `User-agent: *\nDisallow: /admin\nDisallow: /api/\nDisallow: /kit/\nSitemap: ${BASE}/sitemap.xml\n`);
    if (path.startsWith('/uploads/') && file(res, UPLOADS, path.slice(9))) return;
    if (path === '/kit') return redirect(res, '/kit/');
    if (path.startsWith('/kit/')) return isAdmin(req) ? file(res, KIT, path.slice(5) || 'index.html') || send(res, 404, 'Introuvable') : redirect(res, '/admin');
    if (path === '/admin') return file(res, HTML, 'admin.html');
    if (file(res, HTML, path.slice(1))) return;
    if (extname(path)) return send(res, 404, 'Introuvable');
    file(res, HTML, 'index.html'); // routes du site (/boutique, /produit/…) gérées côté navigateur
  } catch (e) {
    if (!(e instanceof HttpError)) console.error(e);
    if (!res.headersSent) send(res, e.status || 500, { error: e instanceof HttpError ? e.message : 'Erreur du serveur, réessayez dans un instant' });
  }
}

export const server = http.createServer(handle);
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(PORT, env.HOST || '127.0.0.1', () => {
    console.log(`Boutique sur ${BASE} (données : ${DATA})`);
    const p = pay.enabled();
    if (!p.stripe && !p.paypal) console.warn('Aucun paiement configuré : STRIPE_SECRET_KEY ou PAYPAL_CLIENT_ID/PAYPAL_SECRET manquants.');
    if (!env.ADMIN_PASSWORD) console.warn('ADMIN_PASSWORD absent : espace admin inaccessible.');
  });
}
