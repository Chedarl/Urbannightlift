/**
 * Machine-readable proof that a real business is behind this domain.
 *
 * A young domain that collects a phone number and a PIN and displays
 * mobile-money merchant codes is, to an automated classifier, shaped almost
 * exactly like a mobile-money phishing page. Nothing here is a magic fix — only
 * a Search Console review lifts a Safe Browsing flag — but a named business,
 * with a real address, a real phone number, stated hours and a published
 * anti-phishing promise, is the evidence a reviewer looks for and the kind of
 * structured data Google uses to tell a local business from a lookalike.
 *
 * Everything below must stay true. Structured data that disagrees with the page
 * is worse than none at all.
 */
export function OrganizationSchema() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": "https://urbannighlift.com/#organization",
    name: "Urban Night Lift",
    alternateName: "UNL",
    description:
      "Night-only pickup and delivery of food, medicine, groceries and parcels across Yaoundé, Cameroon. Open 6:00 PM to 4:00 AM.",
    url: "https://urbannighlift.com",
    logo: "https://urbannighlift.com/logo.png",
    image: "https://urbannighlift.com/icons/icon-512.png",
    email: "urbannightlift@gmail.com",
    telephone: "+237680038004",
    priceRange: "1000–3000 XAF",
    currenciesAccepted: "XAF",
    paymentAccepted: "Cash, MTN Mobile Money, Orange Money",
    address: {
      "@type": "PostalAddress",
      addressLocality: "Yaoundé",
      addressRegion: "Centre",
      addressCountry: "CM",
    },
    areaServed: {
      "@type": "City",
      name: "Yaoundé",
      containedInPlace: { "@type": "Country", name: "Cameroon" },
    },
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: [
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
          "Sunday",
        ],
        opens: "18:00",
        closes: "04:00",
      },
    ],
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "customer support",
        telephone: "+237680038004",
        email: "urbannightlift@gmail.com",
        availableLanguage: ["en", "fr"],
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      // Static, authored object — no user input reaches this.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
