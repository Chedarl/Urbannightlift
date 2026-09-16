/**
 * What people actually ask a night pharmacy for in Yaoundé.
 *
 * ## The gap this fills
 *
 * The medicine list on the pharmacy page is a row of blank text boxes. There is
 * a shelf that fills them — `addShelfItem` in `MedicineForm` — but it is bound
 * to a *specific merchant's* `MerchantProduct` rows, and production has no
 * verified pharmacy at all. So the shelf is empty and somebody with a feverish
 * child is typing a drug name from memory at 2 AM, into a box that will be read
 * aloud to a pharmacist.
 *
 * That is the same shape as the landmark field: required, and offering nothing.
 *
 * These twenty are merchant-independent. They are what a duty pharmacy in this
 * city is asked for at night, and the list came from the owner.
 *
 * ## What is here and what is deliberately not
 *
 * **No prices.** The source list carried one per item and they are not ours to
 * publish: a pharmacy sets its own, and this product's whole medicine flow is
 * the one written on `addShelfItem` — *the pharmacy's till decides the amount
 * and the rider photographs the receipt.* A price here would contradict the
 * screen it appears on, and a customer quoted 3,500 who is charged 4,200 has
 * been misled by us rather than by the pharmacy.
 *
 * **`requiresPrescription` is the reason this is worth more than autocomplete.**
 * It is a fact about the molecule, not about a shop, so it is the same in every
 * pharmacy in Cameroon. Tapping Coartem can raise the prescription upload
 * *before the rider leaves*, instead of at a counter with the customer asleep.
 *
 * Names are given the way they are asked for — brand first where that is what
 * people say (Doliprane, Smecta, Coartem), with the molecule after it, because
 * "paracetamol" gets a blank look and "Doliprane" does not.
 */

export interface PharmacyItem {
  /** As a customer says it. */
  name: string;
  /** Strength or size, when it is the thing that distinguishes two boxes. */
  strength: string;
  /** The physical form — what the pharmacist hands over. */
  form: string;
  category: PharmacyCategory;
  /**
   * Whether Cameroonian practice requires a prescription for this molecule.
   *
   * A fact about the drug rather than about a shop, which is why it can live in
   * a static list at all. When true, the screen asks for the prescription up
   * front rather than letting the rider discover it at the counter.
   */
  requiresPrescription: boolean;
  /** One line on what it is for, so somebody unsure can recognise it. */
  description: string;
  descriptionFr: string;
}

export type PharmacyCategory =
  | "MALARIA"
  | "FEVER_PAIN"
  | "CHILD"
  | "STOMACH"
  | "FIRST_AID"
  | "EQUIPMENT";

/** What each group is called on screen, in both languages. */
export const PHARMACY_CATEGORY_LABEL: Record<PharmacyCategory, { en: string; fr: string }> = {
  MALARIA: { en: "Malaria", fr: "Paludisme" },
  FEVER_PAIN: { en: "Fever & pain", fr: "Fièvre & douleurs" },
  CHILD: { en: "Children & babies", fr: "Enfants & bébés" },
  STOMACH: { en: "Stomach", fr: "Estomac & digestion" },
  FIRST_AID: { en: "First aid", fr: "Premiers soins" },
  EQUIPMENT: { en: "Equipment", fr: "Matériel médical" },
};

export const COMMON_PHARMACY_ITEMS: PharmacyItem[] = [
  // Malaria first, and not alphabetically. It is the single most common reason
  // somebody needs a pharmacy in this city at night.
  {
    name: "Coartem / Artefan (artéméther + luméfantrine)",
    strength: "20 / 120 mg",
    form: "Comprimés, boîte de 24",
    category: "MALARIA",
    requiresPrescription: true,
    description: "First-line treatment for uncomplicated malaria.",
    descriptionFr: "Traitement de première intention du paludisme simple.",
  },
  {
    name: "Maloxine (sulfadoxine + pyriméthamine)",
    strength: "500 / 25 mg",
    form: "Comprimés, boîte de 3",
    category: "MALARIA",
    requiresPrescription: true,
    description: "Single-dose antimalarial, on medical advice.",
    descriptionFr: "Antipaludéen en prise unique, sur avis médical.",
  },
  {
    name: "Test rapide paludisme (TDR)",
    strength: "1 test",
    form: "Kit à usage unique",
    category: "MALARIA",
    requiresPrescription: false,
    description: "Finger-prick test, result in about 15 minutes.",
    descriptionFr: "Test au bout du doigt, résultat en 15 minutes environ.",
  },

  {
    name: "Efferalgan (paracétamol)",
    strength: "1000 mg",
    form: "Comprimés effervescents, tube de 8",
    category: "FEVER_PAIN",
    requiresPrescription: false,
    description: "Fever, headache, flu-like aches.",
    descriptionFr: "Fièvre, maux de tête, courbatures.",
  },
  {
    name: "Doliprane (paracétamol)",
    strength: "500 mg",
    form: "Gélules, boîte de 16",
    category: "FEVER_PAIN",
    requiresPrescription: false,
    description: "Everyday painkiller for adults and teenagers.",
    descriptionFr: "Antalgique courant, adultes et adolescents.",
  },
  {
    name: "Ibuprofène (Advil / Nureflex)",
    strength: "400 mg",
    form: "Comprimés, boîte de 10",
    category: "FEVER_PAIN",
    requiresPrescription: false,
    description: "Toothache, migraine, period pain.",
    descriptionFr: "Maux de dents, migraines, règles douloureuses.",
  },
  {
    name: "Aspégic (acétylsalicylate de lysine)",
    strength: "1000 mg",
    form: "Sachets poudre, boîte de 6",
    category: "FEVER_PAIN",
    requiresPrescription: false,
    description: "Fast-acting for sharp pain.",
    descriptionFr: "Action rapide sur une douleur aiguë.",
  },

  {
    name: "Doliprane sirop pédiatrique",
    strength: "2,4 % — flacon 100 ml",
    form: "Sirop avec pipette graduée",
    category: "CHILD",
    requiresPrescription: false,
    description: "Fever and pain in infants and children, 3–26 kg.",
    descriptionFr: "Fièvre et douleurs du nourrisson et de l'enfant, 3 à 26 kg.",
  },
  {
    name: "Sérum physiologique (dosettes)",
    strength: "5 ml × 10",
    form: "Solution stérile, nez et yeux",
    category: "CHILD",
    requiresPrescription: false,
    description: "Clearing a blocked nose and washing eyes.",
    descriptionFr: "Lavage du nez bouché et hygiène des yeux.",
  },
  {
    name: "SRO — sels de réhydratation orale",
    strength: "Sachet à diluer dans 1 L",
    form: "Poudre, sachets",
    category: "CHILD",
    requiresPrescription: false,
    description: "Stops dehydration from diarrhoea or vomiting. Urgent in a small child.",
    descriptionFr: "Contre la déshydratation due aux diarrhées ou vomissements. Urgent chez un petit enfant.",
  },
  {
    name: "Lait infantile 1er âge (Guigoz / Modilac)",
    strength: "0 à 6 mois — 400 g",
    form: "Boîte poudre",
    category: "CHILD",
    requiresPrescription: false,
    description: "Night top-up when a tin runs out.",
    descriptionFr: "Dépannage de nuit quand la boîte est finie.",
  },

  {
    name: "Smecta (diosmectite)",
    strength: "3 g × 12",
    form: "Sachets, suspension buvable",
    category: "STOMACH",
    requiresPrescription: false,
    description: "Acute diarrhoea.",
    descriptionFr: "Diarrhée aiguë.",
  },
  {
    name: "Spasfon Lyoc (phloroglucinol)",
    strength: "80 mg",
    form: "Lyophilisats, boîte de 10",
    category: "STOMACH",
    requiresPrescription: false,
    description: "Stomach cramps and intestinal spasms.",
    descriptionFr: "Crampes d'estomac et spasmes intestinaux.",
  },
  {
    name: "Gaviscon",
    strength: "10 ml × 12",
    form: "Sachets unidoses",
    category: "STOMACH",
    requiresPrescription: false,
    description: "Reflux and night-time heartburn.",
    descriptionFr: "Reflux et brûlures d'estomac nocturnes.",
  },

  {
    name: "Bétadine dermique",
    strength: "10 % — 125 ml",
    form: "Flacon",
    category: "FIRST_AID",
    requiresPrescription: false,
    description: "Antiseptic for cuts and grazes.",
    descriptionFr: "Antiseptique pour plaies et écorchures.",
  },
  {
    name: "Alcool médical à 70°",
    strength: "250 ml",
    form: "Flacon",
    category: "FIRST_AID",
    requiresPrescription: false,
    description: "Skin and small-instrument disinfection.",
    descriptionFr: "Désinfection de la peau et du petit matériel.",
  },
  {
    name: "Compresses stériles 10 × 10 cm",
    strength: "Pochette de 10",
    form: "Non tissées, stériles",
    category: "FIRST_AID",
    requiresPrescription: false,
    description: "Dressing a wound without leaving fibres.",
    descriptionFr: "Pansement d'une plaie sans peluchage.",
  },

  {
    name: "Thermomètre électronique",
    strength: "Précision 0,1 °C",
    form: "Appareil avec étui",
    category: "EQUIPMENT",
    requiresPrescription: false,
    description: "Reads a temperature in seconds, with a fever beep.",
    descriptionFr: "Température en quelques secondes, avec alerte fièvre.",
  },
  {
    name: "Tensiomètre électronique au bras",
    strength: "Mémoire 60 mesures",
    form: "Appareil avec brassard réglable",
    category: "EQUIPMENT",
    requiresPrescription: false,
    description: "Blood pressure and pulse at home.",
    descriptionFr: "Tension artérielle et pouls à domicile.",
  },
];

/**
 * Items matching what somebody has typed.
 *
 * Matched on the name, the molecule in brackets and the category label, because
 * people arrive at the same box from different directions — "palu", "Coartem"
 * and "artéméther" are one search. Accent-insensitive: a phone keyboard at 2 AM
 * does not produce "fièvre".
 */
export function searchPharmacyItems(query: string, fr = false, limit = 8): PharmacyItem[] {
  const q = fold(query);
  if (!q) return [];
  return COMMON_PHARMACY_ITEMS.filter((it) => {
    const label = PHARMACY_CATEGORY_LABEL[it.category];
    const hay = fold(
      [it.name, it.strength, it.form, label.en, label.fr, fr ? it.descriptionFr : it.description].join(" ")
    );
    return hay.includes(q);
  }).slice(0, limit);
}

/** Lower-cased and stripped of accents, so "fievre" finds "fièvre". */
function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** The items of one group, for a browsable list rather than a search box. */
export function itemsByCategory(category: PharmacyCategory): PharmacyItem[] {
  return COMMON_PHARMACY_ITEMS.filter((it) => it.category === category);
}

/** The groups that actually have items, in the order they should be shown. */
export const PHARMACY_CATEGORIES: PharmacyCategory[] = [
  "MALARIA",
  "FEVER_PAIN",
  "CHILD",
  "STOMACH",
  "FIRST_AID",
  "EQUIPMENT",
];
