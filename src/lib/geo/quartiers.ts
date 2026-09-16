/**
 * The quartiers of Yaoundé, and what people actually say instead of an address.
 *
 * ## The problem this is for
 *
 * `LocationField` asks every customer for "the nearest landmark", makes it
 * **required** for any pin that did not come from our own catalogue — which is
 * most of them — and then offers a blank box and the placeholder *"e.g.
 * Opposite the petrol station"*. A grep for landmark suggestions across this
 * repo returned nothing: there were none. Somebody standing in Mendong at 1 AM
 * had to invent, from nothing, the phrase a rider would navigate by.
 *
 * That is a strange gap, because this is a city where the landmark **is** the
 * address. Nobody in Biyem-Assi gives a street number; they say Carrefour
 * Acacias, or face Total, or the montée past Maison Blanche. The information
 * exists, it is stable, and it was simply never written down here.
 *
 * ## Where this came from, and what was left out of it
 *
 * The owner supplied a quartier table from a Google AI Studio prototype. These
 * are its coordinates, sectors and landmark lists — real places, checkable on
 * any map of Yaoundé, and the one part of that prototype's data that was not
 * invented. The rest of the same file carried patterned placeholder phone
 * numbers, Unsplash stock photographs labelled as Google Places attribution,
 * and invented ratings, and none of that is here.
 *
 * **These are deliberately not `Zone` rows.** `Zone` is the pricing table: 16
 * rows with hand-set fees, where Yaoundé 6 is GREEN and the rest of the city is
 * RED and carries "owner approval recommended". Loading 29 quartier centroids
 * into it would reprice every address in Yaoundé and quietly hand a green tier
 * to areas the owner marked restricted. This table prices nothing and decides
 * nothing. It suggests words.
 */

import { distanceKm } from "@/lib/orders/pricing";

export interface Quartier {
  /** As a resident would name it, parenthetical and all. */
  name: string;
  /** Yaoundé 1–6. The arrondissement, for grouping. */
  sector: string;
  lat: number;
  lng: number;
  /**
   * What people give as the nearest landmark here.
   *
   * Written the way they are spoken, in French, because that is what gets typed
   * into the box and read out to a rider over a bad line. Translating
   * "Carrefour Acacias" would make it findable by nobody.
   */
  landmarks: string[];
}

export const QUARTIERS: Quartier[] = [
  // Centre & Bastos — Yaoundé 1
  { name: "Bastos (Ambassades / Nouvelle Route)", sector: "Yaoundé 1", lat: 3.8912, lng: 11.5124, landmarks: ["Rond-point Bastos", "Nouvelle Route Bastos", "Face Ambassade de France", "Carrefour Golf"] },
  { name: "Centre-Ville (Poste Centrale / Kennedy)", sector: "Yaoundé 1", lat: 3.8667, lng: 11.5167, landmarks: ["Poste Centrale", "Avenue Kennedy", "Boulevard du 20 Mai", "Hôtel de Ville"] },
  { name: "Nlongkak (Rond-Point / Etoa-Meki)", sector: "Yaoundé 1", lat: 3.8821, lng: 11.5195, landmarks: ["Rond-Point Nlongkak", "Vallée Nlongkak", "Face Commissariat 5e", "Carrefour Etoa-Meki"] },
  { name: "Warda (PlaYce / Lac)", sector: "Yaoundé 1", lat: 3.8688, lng: 11.5122, landmarks: ["Centre Commercial PlaYce", "Carrefour Warda", "Lac Municipal", "Ministère des Enseignements"] },
  { name: "Elig-Essono & Jamot", sector: "Yaoundé 1", lat: 3.8745, lng: 11.5245, landmarks: ["Hôpital Jamot", "Axe Gare Ferroviaire", "Carrefour Jamot", "Station Total Elig-Essono"] },
  { name: "Etoudi (Présidence)", sector: "Yaoundé 1", lat: 3.9085, lng: 11.5288, landmarks: ["Carrefour Ancien 6e", "Palais de l'Unité", "Rond-Point Etoudi"] },
  { name: "Emana (Socropole)", sector: "Yaoundé 1", lat: 3.9188, lng: 11.5312, landmarks: ["Socropole Emana", "Carrefour Emana", "Axe Olembe", "Poste Emana"] },

  // Tsinga, Mokolo & Madagascar — Yaoundé 2
  { name: "Tsinga (Palais des Congrès)", sector: "Yaoundé 2", lat: 3.8805, lng: 11.4998, landmarks: ["Palais des Congrès", "Carrefour Tsinga", "Sous-Préfecture Tsinga", "Grand Goudron"] },
  { name: "Mokolo (Grand Marché)", sector: "Yaoundé 2", lat: 3.8711, lng: 11.4925, landmarks: ["Marché Mokolo Entrée Principale", "Carrefour Meec", "Carrefour Camp Militaire", "Bord Marché"] },
  { name: "Madagascar & Marché", sector: "Yaoundé 2", lat: 3.8765, lng: 11.4885, landmarks: ["Grand Marché Madagascar", "Carrefour Madagascar", "Camp Militaire", "Axe Cité Verte"] },

  // Melen, Obili, Nsam & Efoulan — Yaoundé 3
  { name: "Melen & Ngoa-Ekellé (Université Yaoundé I)", sector: "Yaoundé 3", lat: 3.8562, lng: 11.4988, landmarks: ["Carrefour Emia", "Château Ngoa-Ekellé", "Hôpital Militaire", "Entrée Polytechnique"] },
  { name: "Obili (Chapelle / Cradat)", sector: "Yaoundé 3", lat: 3.8532, lng: 11.4925, landmarks: ["Chapelle Obili", "Carrefour Cradat", "Cité Universitaire"] },
  { name: "Nsam & Ahala (Carrefour Damas)", sector: "Yaoundé 3", lat: 3.8255, lng: 11.5052, landmarks: ["Carrefour Damas", "Nsam Escale", "Entrée Ahala", "Face SCDP"] },
  { name: "Efoulan (Palais Charles Atangana)", sector: "Yaoundé 3", lat: 3.8378, lng: 11.5032, landmarks: ["Palais Charles Atangana", "Hôpital de District Efoulan", "Carrefour Efoulan", "Axe Nsam"] },

  // Mimboman, Odza, Awae & Ekie — Yaoundé 4
  { name: "Mimboman & Emombo", sector: "Yaoundé 4", lat: 3.8588, lng: 11.5477, landmarks: ["Carrefour Mimboman", "Sapeurs-Pompiers", "Carrefour Emombo", "Collège Don Bosco"] },
  { name: "Odza (Carrefour Tropicana)", sector: "Yaoundé 4", lat: 3.8122, lng: 11.5344, landmarks: ["Carrefour Tropicana", "Route Mbalmayo", "Messamendongo", "Entrée Auberge"] },
  { name: "Awae & Escalier", sector: "Yaoundé 4", lat: 3.8445, lng: 11.5582, landmarks: ["Awae Escalier", "Carrefour Awae", "Chefferie Awae", "Route Soa"] },
  { name: "Ekie (Dépôt de Planches)", sector: "Yaoundé 4", lat: 3.8295, lng: 11.5398, landmarks: ["Carrefour Dépôt de Planches", "Axe Ekie", "Collège Vogt Annexe", "Carrefour Safari"] },

  // Omnisports, Essos, Ngousso & Mvog-Ada — Yaoundé 5
  { name: "Omnisports (Stade Ahmadou Ahidjo)", sector: "Yaoundé 5", lat: 3.8789, lng: 11.5365, landmarks: ["Stade Ahmadou Ahidjo", "Nouvelle Route Omnisports", "Carrefour Footeux", "Hôtel Franco"] },
  { name: "Essos (Camp Sonel)", sector: "Yaoundé 5", lat: 3.8712, lng: 11.5421, landmarks: ["Carrefour Camp Sonel", "Marché Essos", "Station Total Essos", "Face Hôpital de District"] },
  { name: "Ngousso (Hôpital Général)", sector: "Yaoundé 5", lat: 3.8955, lng: 11.5492, landmarks: ["Hôpital Général de Yaoundé", "Carrefour Ngousso", "Face Chapelle Ngousso"] },
  { name: "Mvog-Ada (Rue de la Joie)", sector: "Yaoundé 5", lat: 3.8654, lng: 11.5332, landmarks: ["Rue de la Joie Mvog-Ada", "Maison Blanche", "Carrefour Mvog-Ada"] },
  { name: "Essomba & Coron", sector: "Yaoundé 5", lat: 3.8622, lng: 11.5385, landmarks: ["Mosquée Essomba", "Marché Essomba", "Carrefour Coron", "Axe Mvog-Mbi"] },
  { name: "Éleveurs & Tradex", sector: "Yaoundé 5", lat: 3.8925, lng: 11.5388, landmarks: ["Carrefour Tradex Éleveurs", "Marché du Bétail", "Montée Éleveurs"] },

  // Biyem-Assi, Mendong, Etoug-Ebe & Simbock — Yaoundé 6, where we deliver
  { name: "Biyem-Assi (Carrefour Acacias)", sector: "Yaoundé 6", lat: 3.8345, lng: 11.4889, landmarks: ["Carrefour Acacias", "Boulangerie Acacias", "Face Total Biyem-Assi", "Montée Maison Blanche"] },
  { name: "Biyem-Assi (Rond-Point Express)", sector: "Yaoundé 6", lat: 3.8392, lng: 11.4921, landmarks: ["Rond-point Express", "Ancien Cinéma Abbia", "Carrefour Scalom", "Face Collège Mongo Beti"] },
  { name: "Mendong (Camp SIC & Jouvence)", sector: "Yaoundé 6", lat: 3.8211, lng: 11.4784, landmarks: ["Camp SIC Mendong Entrée Principale", "Carrefour Jouvence", "Lycée de Mendong", "Montée Descente"] },
  { name: "Etoug-Ebe (Centre des Handicapés)", sector: "Yaoundé 6", lat: 3.8441, lng: 11.4842, landmarks: ["Centre des Handicapés Etoug-Ebe", "Carrefour Brique", "Carrefour Meec"] },
  { name: "Simbock (Tam-Tam Weekend)", sector: "Yaoundé 6", lat: 3.8155, lng: 11.4722, landmarks: ["Entrée Simbock", "Bord Goudron Simbock", "Carrefour Tam-Tam Weekend"] },
];

/**
 * How far a pin may sit from a quartier's centre and still be "in" it.
 *
 * Yaoundé's quartiers are a few kilometres across and these centres are single
 * points, so this is loose. Past it we suggest nothing rather than something
 * wrong: a rider sent to "Carrefour Acacias" for a flat in Nkolbisson is worse
 * off than a rider given no landmark at all, because the wrong one reads as
 * confirmed.
 */
const MAX_SUGGEST_KM = 6;

/** The quartier a pin is in, or null if it is not near any of them. */
export function nearestQuartier(lat: number, lng: number): Quartier | null {
  let best: Quartier | null = null;
  let bestKm = Infinity;
  for (const q of QUARTIERS) {
    const km = distanceKm(lat, lng, q.lat, q.lng);
    if (km < bestKm) {
      bestKm = km;
      best = q;
    }
  }
  return bestKm <= MAX_SUGGEST_KM ? best : null;
}

/**
 * Landmarks to offer somebody who has just dropped a pin here.
 *
 * The nearest quartier's own list first, then the next nearest to fill out a
 * short row — a pin between Biyem-Assi and Etoug-Ebe should be able to reach
 * either, because the person standing there knows which one they mean and we
 * do not.
 *
 * These are **suggestions, never a value**. Tapping one fills the box, which
 * the customer can then edit; nothing is stored until they submit, and nothing
 * here is claimed to be their location.
 */
export function landmarksNear(lat: number, lng: number, limit = 6): string[] {
  const ranked = QUARTIERS.map((q) => ({ q, km: distanceKm(lat, lng, q.lat, q.lng) }))
    .filter((x) => x.km <= MAX_SUGGEST_KM)
    .sort((a, b) => a.km - b.km);

  const out: string[] = [];
  for (const { q } of ranked) {
    for (const l of q.landmarks) {
      if (out.length >= limit) return out;
      // Several quartiers share a landmark — Carrefour Meec is named by both
      // Mokolo and Etoug-Ebe — and offering it twice in one row looks broken.
      if (!out.includes(l)) out.push(l);
    }
  }
  return out;
}

/** The bare quartier name, without the parenthetical hint for a reader. */
function bareName(name: string): string {
  return name.replace(/\s*\(.*\)\s*$/, "").trim();
}

/**
 * Quartier names for the merchant gatherer's search seeds.
 *
 * Places caps a text search at twenty results, so "restaurant Yaoundé" returns
 * twenty places in the centre and nothing in Essos — the search has to be run
 * quartier by quartier. The gatherer had eight names hardcoded in it; these are
 * twenty-nine, and they are the ones people use.
 *
 * Deduplicated because two rows share a bare name: Biyem-Assi appears twice,
 * once for Acacias and once for Rond-Point Express, and searching it twice
 * would double the bill for the same twenty results.
 */
export function quartierNames(): string[] {
  return [...new Set(QUARTIERS.map((q) => bareName(q.name)))];
}

/**
 * Landmark-level seeds, for a deeper sweep than the quartier names give.
 *
 * "Carrefour Acacias, Yaoundé" finds the bar on that junction; "Biyem-Assi,
 * Yaoundé" finds whatever Google ranks highest across a quartier of tens of
 * thousands of people. Four times as many searches, so it is opt-in.
 */
export function landmarkSeeds(): string[] {
  return [...new Set(QUARTIERS.flatMap((q) => q.landmarks))];
}
