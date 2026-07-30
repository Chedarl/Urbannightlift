/**
 * What each staff screen is for, written for the person standing in front of it.
 *
 * There was no help of any kind in the admin or rider apps — no icon, no tour,
 * no manual. The console has thirteen destinations and a new dispatcher was
 * expected to infer all of them at 8 PM on their first night.
 *
 * The content is deliberately **data, not JSX**: it stays translatable, it can
 * be read by anyone editing it without knowing React, and it forces each entry
 * into the same honest shape — what this is, what you actually do here, and the
 * one mistake worth warning about. A screen with nothing worth warning about
 * simply omits `watchOut` rather than inventing a caution.
 *
 * The customer portal has none of this on purpose. It has `/help`, and a
 * consumer product that needs a manual has already failed.
 */

export interface Bilingual {
  en: string;
  fr: string;
}

export interface Guide {
  title: Bilingual;
  /** One sentence: why this screen exists. */
  purpose: Bilingual;
  /** The two or three things you would actually come here to do. */
  steps: Bilingual[];
  /** The mistake that costs money or trust. Omitted when there isn't one. */
  watchOut?: Bilingual;
}

export const GUIDES: Record<string, Guide> = {
  "/admin/dashboard": {
    title: { en: "Tonight's board", fr: "Le tableau de ce soir" },
    purpose: {
      en: "Everything currently stuck, oldest first, plus tonight's totals. This is the screen to leave open all night.",
      fr: "Tout ce qui est bloqué, le plus ancien d'abord, avec les totaux de la nuit. C'est l'écran à laisser ouvert toute la nuit.",
    },
    steps: [
      {
        en: "Work the Needs attention list from the top. Each row opens the order it is about.",
        fr: "Traitez la liste « À traiter » du haut vers le bas. Chaque ligne ouvre la commande concernée.",
      },
      {
        en: "It refreshes itself every 20 seconds and chimes when the queue grows. Leave the sound on.",
        fr: "Elle se rafraîchit toutes les 20 secondes et sonne quand la file s'allonge. Laissez le son activé.",
      },
      {
        en: "A red row means money is already spent and a customer has refused it. Nothing else here is red.",
        fr: "Une ligne rouge signifie que l'argent est déjà dépensé et qu'un client l'a refusé. Rien d'autre n'est rouge ici.",
      },
    ],
    watchOut: {
      en: "\"Nothing waiting\" means every order is with someone — not that there are no orders. Check the totals too.",
      fr: "« Rien en attente » veut dire que chaque commande est prise en charge — pas qu'il n'y a pas de commandes. Regardez aussi les totaux.",
    },
  },

  "/admin/orders": {
    title: { en: "All orders", fr: "Toutes les commandes" },
    purpose: {
      en: "The full history, searchable. Where you go when someone phones about an order.",
      fr: "L'historique complet, avec recherche. C'est ici qu'on va quand quelqu'un appelle au sujet d'une commande.",
    },
    steps: [
      {
        en: "Search by order code, customer name, or phone number — a caller will usually only know their number.",
        fr: "Cherchez par code de commande, nom du client ou numéro de téléphone — un appelant ne connaît souvent que son numéro.",
      },
      {
        en: "Open an order to price it, assign a rider, verify a payment, or read its full history.",
        fr: "Ouvrez une commande pour la tarifer, affecter un livreur, vérifier un paiement ou lire son historique.",
      },
      { en: "Export to CSV for the accounts.", fr: "Exportez en CSV pour la comptabilité." },
    ],
  },

  "/admin/orders/[orderId]": {
    title: { en: "One order", fr: "Une commande" },
    purpose: {
      en: "Everything about a single delivery, and every action you can take on it.",
      fr: "Tout sur une livraison, et toutes les actions possibles dessus.",
    },
    steps: [
      {
        en: "Price it and send the quote, then tell the customer — the board flags a quote nobody has passed on.",
        fr: "Tarifez et envoyez le devis, puis prévenez le client — le tableau signale un devis que personne n'a transmis.",
      },
      {
        en: "Verify a payment only against real evidence. Choosing a method is not paying.",
        fr: "Ne validez un paiement que sur preuve réelle. Choisir un moyen de paiement n'est pas payer.",
      },
      {
        en: "Assign a rider who is online and covers the zone; the rider then has to accept.",
        fr: "Affectez un livreur en ligne qui couvre la zone ; il doit ensuite accepter.",
      },
    ],
    watchOut: {
      en: "Correcting a recorded shop receipt moves someone's money. It needs a reason and it is written into the audit trail with your name on it.",
      fr: "Corriger un reçu déjà enregistré déplace l'argent de quelqu'un. Cela exige un motif et c'est inscrit au journal d'audit à votre nom.",
    },
  },

  "/admin/live": {
    title: { en: "Customer service", fr: "Service client" },
    purpose: {
      en: "One queue for everything a human has to answer, plus the live map and the customer and merchant records behind it.",
      fr: "Une seule file pour tout ce qui demande une réponse humaine, avec la carte en direct et les fiches clients et commerçants.",
    },
    steps: [
      {
        en: "The inbox sorts by who has been waiting on us longest — not by newest.",
        fr: "La boîte trie selon qui attend une réponse depuis le plus longtemps — pas par ordre d'arrivée.",
      },
      {
        en: "Resolve from inside the case: issue credit, re-price, reassign a rider, or call. You should not have to leave it.",
        fr: "Résolvez depuis le dossier : avoir, nouvelle tarification, changement de livreur, appel. Vous ne devriez pas avoir à en sortir.",
      },
      {
        en: "The 360 panel beside a case shows what that customer has spent, how often they order, and whether they are at risk of leaving.",
        fr: "Le panneau 360 à côté d'un dossier montre ce que ce client a dépensé, sa fréquence, et s'il risque de partir.",
      },
    ],
  },

  "/admin/customers": {
    title: { en: "Customers", fr: "Clients" },
    purpose: {
      en: "Everyone who has ever ordered, guests included. This is the database the business is built on.",
      fr: "Tous ceux qui ont commandé un jour, invités compris. C'est la base sur laquelle l'entreprise se construit.",
    },
    steps: [
      { en: "Search by name or number, open a row for their full order history.", fr: "Cherchez par nom ou numéro, ouvrez une ligne pour l'historique complet." },
      { en: "Export to CSV when you want to reach a group of them.", fr: "Exportez en CSV pour contacter un groupe." },
    ],
    watchOut: {
      en: "A guest and an account holder with the same number are the same person. Signing up claims their past orders.",
      fr: "Un invité et un titulaire de compte avec le même numéro sont la même personne. L'inscription récupère ses anciennes commandes.",
    },
  },

  "/admin/earnings": {
    title: { en: "Earnings", fr: "Revenus" },
    purpose: {
      en: "What the deliveries earned, what each rider earned, and what cash is still in someone's pocket.",
      fr: "Ce que les livraisons ont rapporté, ce que chaque livreur a gagné, et l'argent encore en poche.",
    },
    steps: [
      {
        en: "\"Outstanding\" is per rider: positive means they are holding our money, negative means we owe them.",
        fr: "« En attente » est par livreur : positif = il détient notre argent, négatif = nous lui devons.",
      },
      {
        en: "Settle a rider when they hand cash over. Record what actually arrived — a shortfall is worth keeping.",
        fr: "Réglez un livreur quand il remet l'argent. Notez ce qui est réellement arrivé — un manque mérite d'être conservé.",
      },
      {
        en: "Failed deliveries appear as a cost, because a wasted trip is one.",
        fr: "Les livraisons échouées apparaissent comme un coût, parce qu'un trajet perdu en est un.",
      },
    ],
    watchOut: {
      en: "The split is frozen at delivery. Changing the rider share later does not rewrite past nights, and it must not.",
      fr: "Le partage est figé à la livraison. Modifier la part livreur plus tard ne réécrit pas les nuits passées, et ne doit pas le faire.",
    },
  },

  "/admin/zones": {
    title: { en: "Zones and prices", fr: "Zones et tarifs" },
    purpose: {
      en: "The delivery tariff. A zone's tier and fee decide what every order in it costs.",
      fr: "Le tarif de livraison. Le niveau et le tarif d'une zone décident du prix de chaque commande.",
    },
    steps: [
      {
        en: "Green is easy and close, yellow is further or harder, red needs a human to price it.",
        fr: "Vert = facile et proche, jaune = plus loin ou plus difficile, rouge = tarification humaine nécessaire.",
      },
      {
        en: "Set each zone's centre point. Addresses resolve to the nearest one, so a missing centre means no automatic price.",
        fr: "Définissez le centre de chaque zone. Les adresses se rattachent au plus proche ; sans centre, pas de prix automatique.",
      },
      { en: "Mark a zone unsafe or blocked to stop taking orders there.", fr: "Marquez une zone dangereuse ou bloquée pour ne plus y prendre de commandes." },
    ],
    watchOut: {
      en: "Changing a fee changes what the next order quotes, immediately. Orders already priced keep their price.",
      fr: "Modifier un tarif change immédiatement le prix des prochaines commandes. Celles déjà tarifées gardent le leur.",
    },
  },

  "/admin/merchants": {
    title: { en: "Merchants", fr: "Commerçants" },
    purpose: {
      en: "The shops, restaurants and pharmacies we buy from. Only verified ones are ever shown to a customer.",
      fr: "Les boutiques, restaurants et pharmacies où nous achetons. Seuls les vérifiés sont montrés aux clients.",
    },
    steps: [
      {
        en: "Work the To verify queue: call them, confirm they are trading, then verify. Businesses that signed up themselves are the best leads.",
        fr: "Traitez la file « À vérifier » : appelez, confirmez qu'ils sont en activité, puis validez. Ceux qui se sont inscrits eux-mêmes sont les meilleures pistes.",
      },
      {
        en: "Share the join link over WhatsApp — a merchant who fills in their own page keeps it current.",
        fr: "Partagez le lien d'inscription par WhatsApp — un commerçant qui remplit sa propre page la tient à jour.",
      },
      {
        en: "Add up to five items with real prices. Five accurate prices beat a full stale menu.",
        fr: "Ajoutez jusqu'à cinq articles avec de vrais prix. Cinq prix justes valent mieux qu'un menu périmé.",
      },
    ],
    watchOut: {
      en: "Never copy a listing, photo or price from Google, TripAdvisor or Facebook. A place that no longer exists sends a rider to a closed door.",
      fr: "Ne copiez jamais une fiche, une photo ou un prix depuis Google, TripAdvisor ou Facebook. Un lieu qui n'existe plus envoie un livreur devant une porte fermée.",
    },
  },

  "/admin/ambassadors": {
    title: { en: "Ambassadors", fr: "Ambassadeurs" },
    purpose: {
      en: "People who bring us customers, and what we owe them for it.",
      fr: "Les personnes qui nous amènent des clients, et ce que nous leur devons.",
    },
    steps: [
      {
        en: "Approve or refuse an application. Approving is a standing commitment to pay someone.",
        fr: "Approuvez ou refusez une candidature. Approuver, c'est s'engager à payer quelqu'un.",
      },
      {
        en: "Commission accrues only on delivered, verified, non-test orders — never on a quote or a cancellation.",
        fr: "La commission n'est acquise que sur les commandes livrées, vérifiées et hors test — jamais sur un devis ou une annulation.",
      },
      { en: "Mark paid when you have actually paid them; it writes a ledger line.", fr: "Marquez « payé » quand vous avez réellement payé ; cela écrit une ligne au grand livre." },
    ],
    watchOut: {
      en: "The rider is never charged for this. Discounts and commission come out of the company's share, never out of a rider's pay.",
      fr: "Le livreur n'en paie jamais le prix. Remises et commissions sortent de la part de l'entreprise, jamais de la paie d'un livreur.",
    },
  },

  "/admin/riders/applications": {
    title: { en: "Rider applications", fr: "Candidatures livreurs" },
    purpose: {
      en: "People asking to ride for us, and the identity check before they carry anyone's shopping.",
      fr: "Les personnes qui veulent livrer pour nous, et la vérification d'identité avant qu'elles ne transportent quoi que ce soit.",
    },
    steps: [
      {
        en: "Check the ID document against the name and photo before approving.",
        fr: "Vérifiez la pièce d'identité par rapport au nom et à la photo avant d'approuver.",
      },
      {
        en: "Approving creates their login. They still need a float before they can take food or pharmacy jobs.",
        fr: "L'approbation crée leur accès. Il leur faut encore une caisse avant de prendre des courses repas ou pharmacie.",
      },
    ],
    watchOut: {
      en: "ID images never reach a customer and never appear in a public link. Do not copy them anywhere else.",
      fr: "Les pièces d'identité n'atteignent jamais un client ni un lien public. Ne les copiez nulle part ailleurs.",
    },
  },

  "/admin/complaints": {
    title: { en: "Incidents", fr: "Incidents" },
    purpose: {
      en: "What went wrong, who it was down to, and whether it is resolved. Riders report straight into here.",
      fr: "Ce qui s'est mal passé, à qui c'est imputable, et si c'est résolu. Les livreurs y signalent directement.",
    },
    steps: [
      { en: "A rider's report also risk-flags their order, so it surfaces on the board.", fr: "Un signalement de livreur marque aussi sa commande à risque, donc elle remonte au tableau." },
      { en: "Close an incident only once the customer has actually been dealt with.", fr: "Ne clôturez un incident qu'une fois le client réellement pris en charge." },
    ],
  },

  "/admin/support": {
    title: { en: "Support requests", fr: "Demandes d'assistance" },
    purpose: {
      en: "Messages sent from the Help Centre, and the service waiting lists.",
      fr: "Les messages envoyés depuis le centre d'aide, et les listes d'attente par service.",
    },
    steps: [
      { en: "Every message here was told someone would reach out. Somebody has to.", fr: "Chaque message ici s'est vu promettre une réponse. Quelqu'un doit la donner." },
      {
        en: "The waiting list shows who wants a paused service. Use it to decide what to switch on next.",
        fr: "La liste d'attente montre qui veut un service en pause. Servez-vous-en pour décider quoi activer ensuite.",
      },
    ],
  },

  "/admin/users": {
    title: { en: "Staff and riders", fr: "Personnel et livreurs" },
    purpose: {
      en: "Who can sign in, what they are allowed to do, which zones a rider covers, and the company cash they hold.",
      fr: "Qui peut se connecter, ce qui lui est permis, les zones couvertes par un livreur, et l'argent de l'entreprise qu'il détient.",
    },
    steps: [
      {
        en: "A rider with no zones selected is offered every area. That is usually what you want at first.",
        fr: "Un livreur sans zone sélectionnée se voit proposer toutes les zones. C'est en général ce qu'on veut au début.",
      },
      {
        en: "Open Float to grant a limit, hand cash over, or take it back. Without a float a rider cannot take shopping jobs at all.",
        fr: "Ouvrez « Caisse » pour accorder un plafond, remettre de l'argent ou le reprendre. Sans caisse, un livreur ne peut prendre aucune course avec achat.",
      },
      { en: "Suspend rather than delete — the history stays attached to the person.", fr: "Suspendez plutôt que supprimer — l'historique reste rattaché à la personne." },
    ],
    watchOut: {
      en: "The limit is the most a rider may carry at once. It is what bounds the loss if a phone is stolen, so set it to a night's work and no more.",
      fr: "Le plafond est le maximum qu'un livreur peut détenir à la fois. C'est ce qui limite la perte en cas de vol : fixez-le à une nuit de travail, pas plus.",
    },
  },

  "/admin/settings": {
    title: { en: "Settings", fr: "Paramètres" },
    purpose: {
      en: "The switches that change how the whole business behaves tonight.",
      fr: "Les réglages qui changent le fonctionnement de toute l'activité ce soir.",
    },
    steps: [
      { en: "Open and close the service, and set the hours the app offers.", fr: "Ouvrez et fermez le service, et définissez les horaires proposés par l'app." },
      {
        en: "Switch a service on and it becomes orderable immediately. The waiting-list count next to it says how many people asked.",
        fr: "Activez un service et il devient commandable immédiatement. Le compteur à côté indique combien de personnes l'ont demandé.",
      },
      {
        en: "Test mode keeps orders out of the earnings figures. Turn it off the night you actually launch.",
        fr: "Le mode test garde les commandes hors des revenus. Désactivez-le le soir du vrai lancement.",
      },
    ],
    watchOut: {
      en: "The merchant payment codes are where customers send money. Getting one wrong sends their payment to a stranger.",
      fr: "Les codes marchands sont l'endroit où les clients envoient l'argent. Une erreur envoie leur paiement à un inconnu.",
    },
  },

  // ------------------------------------------------------------------ rider

  "/rider/dashboard": {
    title: { en: "Tonight", fr: "Ce soir" },
    purpose: {
      en: "Your jobs, what you have earned, and how much company cash you can spend.",
      fr: "Vos courses, ce que vous avez gagné, et l'argent de l'entreprise que vous pouvez dépenser.",
    },
    steps: [
      { en: "Go online to be offered work. Offline means dispatch skips you.", fr: "Passez en ligne pour recevoir des courses. Hors ligne, le dispatch vous saute." },
      { en: "Tap a job to open it. The gold one is the delivery you are on now.", fr: "Touchez une course pour l'ouvrir. Celle en or est la livraison en cours." },
      {
        en: "Check \"left to spend\" before you set off on a food or pharmacy job.",
        fr: "Vérifiez « reste à dépenser » avant de partir sur une course repas ou pharmacie.",
      },
    ],
    watchOut: {
      en: "Never buy anything with your own money. If the float does not cover it, call dispatch before you pay.",
      fr: "N'achetez jamais avec votre propre argent. Si la caisse ne suffit pas, appelez le dispatch avant de payer.",
    },
  },

  "/rider/earnings": {
    title: { en: "Your earnings", fr: "Vos gains" },
    purpose: {
      en: "What you have earned, and separately, the company cash passing through your hands.",
      fr: "Ce que vous avez gagné, et séparément, l'argent de l'entreprise qui passe entre vos mains.",
    },
    steps: [
      { en: "Earnings are yours. The float is not — you get back what you laid out at settlement.", fr: "Les gains sont à vous. La caisse ne l'est pas — vous récupérez vos avances au règlement." },
      { en: "Every delivery is listed with what it paid. Check it against your own count.", fr: "Chaque livraison est listée avec son montant. Comparez avec votre propre compte." },
    ],
  },

  "/rider/orders/[orderId]": {
    title: { en: "The job", fr: "La course" },
    purpose: {
      en: "Everything you need for this delivery, in the order you need it.",
      fr: "Tout ce qu'il faut pour cette livraison, dans l'ordre où vous en avez besoin.",
    },
    steps: [
      { en: "Accept first, so dispatch knows you are on the way.", fr: "Acceptez d'abord, pour que le dispatch sache que vous partez." },
      { en: "Use Navigate rather than reading the address off the screen while riding.", fr: "Utilisez « Navigate » plutôt que de lire l'adresse en roulant." },
      {
        en: "On a shopping job, photograph the shop's receipt and record the amount before you leave the counter.",
        fr: "Sur une course avec achat, photographiez le reçu et enregistrez le montant avant de quitter le comptoir.",
      },
    ],
    watchOut: {
      en: "Give the goods first, then ask for the code. The code is proof the customer received their order, not a condition of getting it.",
      fr: "Remettez la commande d'abord, puis demandez le code. Le code prouve que le client a reçu sa commande, ce n'est pas une condition pour l'obtenir.",
    },
  },

  // --------------------------------------------------------------- merchant

  "/merchant": {
    title: { en: "Tonight", fr: "Ce soir" },
    purpose: {
      en: "What we are bringing you tonight, and the switch that says you are closed.",
      fr: "Ce que nous vous apportons ce soir, et l'interrupteur qui dit que vous êtes fermé.",
    },
    steps: [
      {
        en: "Tap Open / Closed the moment your kitchen stops. Customers stop seeing you immediately.",
        fr: "Touchez Ouvert / Fermé dès que la cuisine s'arrête. Les clients cessent de vous voir immédiatement.",
      },
      {
        en: "Orders appear here as they come in. Our rider collects them — you do not deliver anything.",
        fr: "Les commandes apparaissent au fur et à mesure. Notre livreur vient les chercher — vous ne livrez rien.",
      },
    ],
    watchOut: {
      en: "We never give you a customer's name or number, and we never give them yours. The rider is the whole hand-off.",
      fr: "Nous ne vous donnons jamais le nom ni le numéro d'un client, et nous ne leur donnons pas les vôtres. Le livreur fait tout le lien.",
    },
  },

  "/merchant/products": {
    title: { en: "Your items", fr: "Vos articles" },
    purpose: {
      en: "What customers see when they pick you, and the price they pay.",
      fr: "Ce que les clients voient quand ils vous choisissent, et le prix qu'ils paient.",
    },
    steps: [
      {
        en: "Start with your five most-asked-for items. A short accurate list beats a long stale one.",
        fr: "Commencez par vos cinq articles les plus demandés. Une liste courte et juste vaut mieux qu'une longue et périmée.",
      },
      {
        en: "Mark something sold out for the night rather than closing the whole shop.",
        fr: "Marquez un article épuisé pour la soirée plutôt que de fermer toute la boutique.",
      },
    ],
    watchOut: {
      en: "Leave a price blank if you are not sure. Customers set how much they will spend from what they read here, so a wrong price is worse than none.",
      fr: "Laissez le prix vide en cas de doute. Les clients fixent leur budget d'après ce qu'ils lisent ici : un prix faux est pire qu'un prix absent.",
    },
  },

  "/merchant/insights": {
    title: { en: "Your numbers", fr: "Vos chiffres" },
    purpose: {
      en: "What actually sells through us, which nights are dead, and whether you are growing.",
      fr: "Ce qui se vend réellement chez nous, quels soirs sont morts, et si vous progressez.",
    },
    steps: [
      { en: "Use the quiet nights — that is where the room to grow is.", fr: "Servez-vous des soirs calmes — c'est là qu'il y a de la place." },
      {
        en: "Below eight orders we say nothing rather than give you a number built on noise.",
        fr: "En dessous de huit commandes, nous ne disons rien plutôt que de vous donner un chiffre bâti sur du bruit.",
      },
    ],
    watchOut: {
      en: "This only counts orders placed through Urban Night Lift. It is not your whole trade, so do not change a menu on it alone.",
      fr: "Cela ne compte que les commandes passées par Urban Night Lift. Ce n'est pas tout votre commerce : ne changez pas un menu sur cette seule base.",
    },
  },

  "/merchant/profile": {
    title: { en: "Your shop", fr: "Votre boutique" },
    purpose: {
      en: "Where you are, when you are open, and how we reach you.",
      fr: "Où vous êtes, quand vous êtes ouvert, et comment vous joindre.",
    },
    steps: [
      {
        en: "A good landmark beats an exact address — it is what a rider reads at 1 AM.",
        fr: "Un bon point de repère vaut mieux qu'une adresse exacte — c'est ce que lit un livreur à 1 h du matin.",
      },
      {
        en: "\"Open at night\" is the only availability that matters to us. We deliver 6 PM to 4 AM.",
        fr: "« Ouvert la nuit » est la seule disponibilité qui compte pour nous. Nous livrons de 18 h à 4 h.",
      },
    ],
    watchOut: {
      en: "Your shop's name and account number can't be changed here — a person confirmed them when we called you. Ring dispatch to change either.",
      fr: "Le nom de la boutique et le numéro du compte ne se changent pas ici — une personne les a confirmés lors de notre appel. Appelez le dispatch pour les modifier.",
    },
  },

  "/rider/profile": {
    title: { en: "Your profile", fr: "Votre profil" },
    purpose: {
      en: "How a customer recognises you at their door at 1 AM.",
      fr: "Comment un client vous reconnaît à sa porte à 1 h du matin.",
    },
    steps: [
      { en: "Your photo and your bike's plate are shown to the customer before you arrive.", fr: "Votre photo et la plaque de votre moto sont montrées au client avant votre arrivée." },
      { en: "Keep them current — it is what makes someone comfortable opening the door.", fr: "Gardez-les à jour — c'est ce qui met quelqu'un à l'aise pour ouvrir." },
    ],
  },
};

/**
 * The guide for a path, matching the most specific entry.
 *
 * Dynamic routes are keyed with their bracket form (`/admin/orders/[orderId]`),
 * so a real id has to be matched by shape rather than by string equality —
 * otherwise every order page would silently fall back to the list's guide,
 * which is the sort of half-right help that is worse than none.
 */
export function guideForPath(pathname: string): Guide | null {
  if (GUIDES[pathname]) return GUIDES[pathname];

  const parts = pathname.split("/").filter(Boolean);
  let best: { key: string; depth: number } | null = null;

  for (const key of Object.keys(GUIDES)) {
    const keyParts = key.split("/").filter(Boolean);
    if (keyParts.length !== parts.length) continue;
    const matches = keyParts.every(
      (k, i) => (k.startsWith("[") && k.endsWith("]")) || k === parts[i]
    );
    if (matches && (!best || keyParts.length > best.depth)) {
      best = { key, depth: keyParts.length };
    }
  }
  if (best) return GUIDES[best.key];

  // A sub-page with no entry of its own falls back to its section, which is
  // better than nothing and never wrong about what area you are in.
  for (let i = parts.length - 1; i > 0; i--) {
    const parent = "/" + parts.slice(0, i).join("/");
    if (GUIDES[parent]) return GUIDES[parent];
  }
  return null;
}
