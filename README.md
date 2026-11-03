# Kat's Eye Création

Boutique en ligne de vêtements et accessoires cousus main (la mère de Dorian).
Site, paiement Stripe et PayPal, e-mails, espace admin « l'atelier » et kit pro pour vendre du fait-main.

- Canevas de maquettes (site, mobile, admin) : https://claude.ai/artifact/XMpi2rrLapjGcP4iTZ7ixy
- `maquettes/` : copie des sources du canevas (`.dc.html` + `canvas.json`), au 2026-10-29.

## Lancer en local

Node 20.12 ou plus récent.

```bash
npm install
cp .env.example .env      # remplir au moins ADMIN_PASSWORD
npm start                 # http://localhost:8790, admin sur /admin
npm test
```

Sans clés Stripe/PayPal, le site fonctionne mais le paiement est fermé. Sans `SMTP_URL`, les e-mails sont affichés dans la console au lieu d'être envoyés.
Pour tester le paiement : clés `sk_test_…` de Stripe, `PAYPAL_ENV=sandbox` pour PayPal, et `stripe listen --forward-to localhost:8790/api/stripe/webhook` pour le webhook.

## Organisation

| Chemin | Rôle |
|---|---|
| `server/server.js` | Serveur HTTP (sans framework) : fichiers, API, commandes, admin, sitemap |
| `server/pay.js` | Stripe Checkout et PayPal Orders v2 par leurs API REST, vérification des webhooks |
| `server/mail.js` | Envoi des e-mails (nodemailer, `SMTP_URL`) |
| `server/boutique.example.json` | Infos de l'entreprise et livraison, copiées dans `data/boutique.json` au premier lancement |
| `server/produits-exemple.json` | Créations d'exemple chargées au premier lancement |
| `html/index.html` | Le site (une page, routes `/boutique`, `/produit/…`, `/panier`, `/commande`…) |
| `html/legal.js` | CGV, mentions légales, données personnelles, livraison & retours |
| `html/admin.html` | L'atelier : commandes, créations (photos réduites dans le navigateur), messages, lettre d'info, exports CSV |
| `html/fonts/` | Polices hébergées sur le site (aucune requête vers Google) |
| `kit/` | Kit pro (règles, calculateur de prix, modèles à imprimer, communication, routine), servi sur `/kit/` aux admins |
| `data/` | Données de production, **non versionnées** : `boutique.json`, `products.json`, `orders.json`, `messages.json`, `newsletter.json`, `uploads/` |

Les prix sont stockés en centimes. Le serveur recalcule toujours le panier depuis le catalogue (prix, options, stock) ; le stock baisse quand le paiement est confirmé (retour de paiement ou webhook, les deux sans effet en double).

## Mise en ligne sur le VPS

1. Cloner le repo (ex. `/opt/kats-eye`), `npm ci --omit=dev`, créer `.env` (voir `.env.example`, `PUBLIC_URL` en https).
2. Lancer `npm start` une fois pour créer `data/`, puis compléter `data/boutique.json` (nom, SIRET, adresse, médiateur, hébergeur).
3. Service systemd :
   ```ini
   [Unit]
   Description=Boutique Kat's Eyes Créations
   After=network.target
   [Service]
   WorkingDirectory=/opt/kats-eye
   ExecStart=/usr/bin/node server/server.js
   Restart=always
   User=www-data
   [Install]
   WantedBy=multi-user.target
   ```
4. HTTPS devant le serveur (il écoute sur 127.0.0.1:8790), par exemple Caddy : `kats-eye-creation.fr { reverse_proxy 127.0.0.1:8790 }`.
5. Stripe : webhook vers `https://<domaine>/api/stripe/webhook` (événements `checkout.session.completed` et `checkout.session.async_payment_succeeded`), secret dans `STRIPE_WEBHOOK_SECRET`.
6. Sauvegarder `data/` régulièrement (commandes = pièces comptables, 10 ans).

## Charte
- Couleurs : crème `#FCF8F2`, carte `#FFFDF9`, sable rosé `#F6E9E6`, sauge `#5F6E4B` / `#4B583A`, cuivre `#9A5B32`, rose `#E7B3BC` / `#B86A7C`, texte `#2B2622`
- Polices : Cormorant Garamond (titres), Nunito Sans (texte), Great Vibes (manuscrite), Josefin Sans (capitales)
- Motif : bordures en pointillés façon surpiqûre, végétaux aquarelle (`html/img/vegetal/`)
