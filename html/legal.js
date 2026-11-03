// Pages légales et d'information. Les infos de l'entreprise viennent de data/boutique.json (via /api/shop).
// À faire relire avant l'ouverture : voir le kit (kit/obligations.html).
window.LEGAL = {
  'livraison-retours': {
    title: 'Livraison &amp; retours',
    body: s => { const L = s.livraison; return `
      <h2>Livraison</h2>
      <p>Les commandes sont expédiées en ${esc(L.zone)} par ${esc(L.transporteur)}, sous ${esc(L.delai)} après le paiement. Chaque pièce étant cousue à la main, les créations « à la commande » peuvent demander un peu plus de temps : le délai est alors indiqué sur la fiche de l'article.</p>
      <p>Frais de livraison : ${euro(Math.round(L.prix * 100))} par commande, offerts dès ${euro(L.offerteDes * 100)} d'achat. Vous recevez un e-mail avec le numéro de suivi dès l'envoi du colis.</p>
      <p>À la réception, vérifiez l'état du colis devant le livreur. S'il est abîmé, notez des réserves précises et prévenez-moi dans les 3 jours avec une photo.</p>
      <h2>Changer d'avis</h2>
      <p>Vous disposez de <b>14 jours à compter de la réception</b> pour me signaler que vous souhaitez retourner un article, sans avoir à vous justifier. Écrivez-moi à <a href="mailto:${esc(s.email)}">${esc(s.email)}</a> ou utilisez le formulaire de rétractation en bas des <a href="/cgv">CGV</a>.</p>
      <p>Renvoyez ensuite l'article dans les 14 jours, non porté, non lavé et dans son état d'origine. Les frais de retour sont à votre charge. Je vous rembourse le prix de l'article et les frais de livraison initiaux (tarif standard) dans les 14 jours, par le même moyen de paiement, dès réception du colis.</p>
      <div class="box"><b>Exception :</b> les pièces sur-mesure ou personnalisées (mesures, tissu ou broderie à votre demande) ne peuvent pas être retournées pour changement d'avis, car elles sont faites spécialement pour vous.</div>
      <h2>Un souci avec votre création ?</h2>
      <p>Si un article présente un défaut, contactez-moi : il sera réparé, échangé ou remboursé dans le cadre des garanties légales décrites dans les <a href="/cgv">CGV</a>.</p>`; }
  },

  'mentions-legales': {
    title: 'Mentions légales',
    body: s => `
      <h2>Éditeur du site</h2>
      <p>${esc(s.nom)}<br>${esc(s.nomLegal)}<br>SIRET : ${esc(s.siret)}<br>Adresse : ${esc(s.adresse)}<br>E-mail : <a href="mailto:${esc(s.email)}">${esc(s.email)}</a><br>Téléphone : ${esc(s.telephone)}<br>${esc(s.tva)}</p>
      <p>Directrice de la publication : ${esc(s.nomLegal.split(',')[0])}.</p>
      <h2>Hébergement</h2>
      <p>${esc(s.hebergeur)}</p>
      <h2>Propriété intellectuelle</h2>
      <p>Les créations, photos, textes, logo et illustrations de ce site sont la propriété de ${esc(s.nom)}. Toute reproduction sans autorisation écrite est interdite.</p>
      <h2>Médiation</h2>
      <p>En cas de litige, voir l'article « Réclamations et médiation » des <a href="/cgv">conditions générales de vente</a>.</p>`
  },

  confidentialite: {
    title: 'Données personnelles',
    body: s => `
      <p>${esc(s.nom)} (${esc(s.nomLegal)}, ${esc(s.adresse)}) est responsable des données collectées sur ce site. Elles servent uniquement à la boutique et ne sont jamais vendues.</p>
      <h2>Ce qui est collecté, et pourquoi</h2>
      <ul>
        <li><b>Commandes</b> : nom, e-mail, téléphone (facultatif), adresse de livraison, contenu de la commande. Pour préparer, expédier et suivre votre commande (exécution du contrat), puis pour la comptabilité (obligation légale). Conservées 10 ans.</li>
        <li><b>Paiement</b> : géré entièrement par Stripe ou PayPal sur leurs pages sécurisées. Aucune donnée bancaire n'est reçue ni conservée par ce site.</li>
        <li><b>Messages et demandes sur-mesure</b> : prénom, e-mail et message, pour vous répondre (intérêt légitime). Conservés 3 ans après le dernier échange.</li>
        <li><b>Lettre d'information</b> : votre e-mail, avec votre accord, jusqu'à votre désinscription.</li>
      </ul>
      <h2>Qui y a accès</h2>
      <p>Kat uniquement, et les prestataires nécessaires : le prestataire de paiement (Stripe ou PayPal), le transporteur (${esc(s.livraison.transporteur)}), l'hébergeur du site (${esc(s.hebergeur)}) et le service d'envoi d'e-mails. Certains peuvent traiter des données hors de l'Union européenne, avec les garanties prévues par le RGPD.</p>
      <h2>Cookies</h2>
      <p>Ce site n'utilise ni cookie publicitaire, ni mesure d'audience, ni réseau social intégré. Votre panier est simplement mémorisé dans votre navigateur. Les polices de caractères sont hébergées sur le site : aucune donnée n'est envoyée à des tiers en naviguant.</p>
      <h2>Vos droits</h2>
      <p>Vous pouvez accéder à vos données, les corriger, les effacer, vous opposer à leur utilisation ou en demander une copie en écrivant à <a href="mailto:${esc(s.email)}">${esc(s.email)}</a>. Vous pouvez aussi adresser une réclamation à la CNIL (cnil.fr).</p>`
  },

  cgv: {
    title: 'Conditions générales de vente',
    body: s => { const L = s.livraison; return `
      <p>En vigueur au 3 novembre 2026. Ces conditions s'appliquent à toute commande passée sur ce site par un consommateur.</p>
      <h2>1. Vendeur</h2>
      <p>${esc(s.nom)} — ${esc(s.nomLegal)}, SIRET ${esc(s.siret)}, ${esc(s.adresse)}. E-mail : ${esc(s.email)}. Téléphone : ${esc(s.telephone)}.</p>
      <h2>2. Les créations</h2>
      <p>Les articles sont cousus à la main, en pièce unique ou en petite série. La composition, les dimensions et l'entretien sont indiqués sur chaque fiche. Les photos sont prises au plus près de la réalité ; de légères variations de teinte ou de motif d'une pièce à l'autre sont propres au fait-main.</p>
      <h2>3. Prix</h2>
      <p>Les prix sont indiqués en euros, toutes taxes comprises. ${esc(s.tva)}. Les frais de livraison (${euro(Math.round(L.prix * 100))}, offerts dès ${euro(L.offerteDes * 100)}) sont indiqués avant la validation de la commande.</p>
      <h2>4. Commande</h2>
      <p>Vous choisissez vos articles, indiquez vos coordonnées, acceptez les présentes conditions puis payez. La vente est conclue à la confirmation du paiement ; un e-mail récapitulatif vous est alors envoyé. Les articles sont vendus dans la limite des stocks disponibles. Les commandes sont archivées et vous pouvez en demander une copie par e-mail.</p>
      <h2>5. Paiement</h2>
      <p>Le paiement se fait en ligne, au moment de la commande, par carte bancaire (via Stripe) ou par PayPal. Les données de paiement sont traitées directement par ces prestataires sécurisés et ne sont jamais communiquées au vendeur.</p>
      <h2>6. Livraison</h2>
      <p>Livraison en ${esc(L.zone)} par ${esc(L.transporteur)}. Expédition sous ${esc(L.delai)} après le paiement (délai plus long indiqué sur la fiche pour les pièces à la commande) ; à défaut, la livraison intervient au plus tard 30 jours après la commande. En cas de retard, vous pouvez, après une mise en demeure restée sans effet, annuler la commande et être remboursé. Les articles voyagent aux risques du vendeur jusqu'à leur remise.</p>
      <h2>7. Pièces sur-mesure</h2>
      <p>Les pièces sur-mesure font l'objet d'un devis accepté par écrit. Confectionnées selon vos indications, elles ne bénéficient pas du droit de rétractation (article L221-28, 3° du Code de la consommation).</p>
      <h2>8. Droit de rétractation</h2>
      <p>Vous disposez de 14 jours à compter de la réception de votre commande pour vous rétracter, sans motif (article L221-18 du Code de la consommation). Notifiez votre décision par e-mail ou avec le formulaire ci-dessous, puis renvoyez les articles dans les 14 jours suivant cette notification. <b>Les frais de retour sont à votre charge.</b> Les articles doivent être retournés complets, non portés et non lavés ; une dépréciation due à une manipulation au-delà de ce qui est nécessaire pour les essayer peut être déduite du remboursement.</p>
      <p>Le remboursement de toutes les sommes versées, y compris les frais de livraison initiaux (sur la base du tarif standard), intervient dans les 14 jours suivant votre rétractation, par le même moyen de paiement. Il peut être différé jusqu'à la réception des articles retournés.</p>
      <h2>9. Garanties légales</h2>
      <div class="box">
        <p>Vous bénéficiez de la <b>garantie légale de conformité</b> (articles L217-3 et suivants du Code de la consommation) : vous disposez de deux ans à compter de la délivrance du bien pour la faire jouer en cas de défaut de conformité. Durant ce délai, vous n'avez à établir que l'existence du défaut, pas sa date d'apparition. Vous avez droit à la réparation ou au remplacement du bien dans les 30 jours suivant votre demande, sans frais ni inconvénient majeur. Si la réparation ou le remplacement est impossible, refusé ou non effectué dans ce délai, vous pouvez obtenir une réduction du prix ou l'annulation de la vente avec remboursement. Un bien réparé dans ce cadre bénéficie d'une extension de garantie de six mois.</p>
        <p>Vous bénéficiez aussi de la <b>garantie des vices cachés</b> (articles 1641 à 1649 du Code civil), pendant deux ans à compter de la découverte du défaut, qui permet d'obtenir l'annulation de la vente ou une réduction du prix.</p>
        <p>Le vendeur qui fait obstacle de mauvaise foi à la garantie légale de conformité encourt une amende civile pouvant aller jusqu'à 300 000 €.</p>
      </div>
      <h2>10. Données personnelles</h2>
      <p>Voir la page <a href="/confidentialite">Données personnelles</a>.</p>
      <h2>11. Réclamations et médiation</h2>
      <p>Pour toute réclamation, écrivez d'abord à ${esc(s.email)}. Si aucune solution n'est trouvée, vous pouvez recourir gratuitement au médiateur de la consommation : ${esc(s.mediateur.nom)}, ${esc(s.mediateur.adresse)} — ${esc(s.mediateur.site)}.</p>
      <h2>12. Droit applicable</h2>
      <p>Ces conditions sont soumises au droit français.</p>
      <h2>Formulaire de rétractation</h2>
      <div class="box"><p>(Complétez et renvoyez ce formulaire uniquement si vous souhaitez vous rétracter.)</p>
        <p>À l'attention de ${esc(s.nomLegal)}, ${esc(s.adresse)}, ${esc(s.email)} :</p>
        <p>Je vous notifie par la présente ma rétractation du contrat portant sur la vente du bien ci-dessous :<br>
        Commandé le / reçu le :<br>Numéro de commande :<br>Nom :<br>Adresse :<br>Signature (uniquement en cas d'envoi papier) :<br>Date :</p></div>`; }
  }
};
