"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BadgeCheck,
  Clock3,
  MapPin,
  Phone,
  Search,
  ShoppingBag,
  Sparkles,
  Star,
  Store,
  UtensilsCrossed,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { saveDraft, type OrderDraft } from "@/lib/orders/draft";
import { cn, formatXaf } from "@/lib/utils";

type PaymentMethod = "CASH" | "MTN_MOMO" | "ORANGE_MONEY";

type MenuItem = {
  id: string;
  name: string;
  description: string;
  priceXaf: number;
  tag: string;
};

type Restaurant = {
  id: string;
  name: string;
  area: string;
  location: string;
  image: string;
  rating: number;
  deliveryTime: string;
  openLabel: string;
  description: string;
  tags: string[];
  accent: string;
  menu: MenuItem[];
};

const RESTAURANTS: Restaurant[] = [
  {
    id: "basilic",
    name: "Le Basilic",
    area: "Biyem Assi",
    location: "Rue des Cocotiers, Biyem Assi",
    image: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=80",
    rating: 4.8,
    deliveryTime: "20–30 mins",
    openLabel: "Open from 6:00 PM",
    description: "Grilled chicken, local rice dishes, and fresh juices for late-night cravings.",
    tags: ["Late night", "Grill", "Popular"],
    accent: "#f59e0b",
    menu: [
      { id: "basilic-rice", name: "Signature Rice Bowl", description: "Chicken, plantains, and spicy sauce", priceXaf: 6500, tag: "Best seller" },
      { id: "basilic-wrap", name: "Chicken Wrap", description: "Packed with greens and crunchy fries", priceXaf: 4500, tag: "Quick bite" },
      { id: "basilic-juice", name: "Fresh Juice", description: "Pineapple or orange", priceXaf: 2500, tag: "Fresh" },
    ],
  },
  {
    id: "mama-fanta",
    name: "Mama Fanta Kitchen",
    area: "Mendong",
    location: "Avenue de la Paix, Mendong",
    image: "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=80",
    rating: 4.7,
    deliveryTime: "25–35 mins",
    openLabel: "Open until 1:00 AM",
    description: "Comfort food and hearty soups made for small family orders and group meals.",
    tags: ["Soup", "Family meals", "Local"],
    accent: "#8b5cf6",
    menu: [
      { id: "mama-soup", name: "Chicken Soup", description: "Served with plantain and rice", priceXaf: 5500, tag: "Comfort food" },
      { id: "mama-plate", name: "Spicy Jollof Plate", description: "With grilled chicken and salad", priceXaf: 7000, tag: "Popular" },
      { id: "mama-sandwich", name: "Veggie Sandwich", description: "Soft bread with fresh vegetables", priceXaf: 3200, tag: "Light" },
    ],
  },
  {
    id: "night-grill",
    name: "Night Grill House",
    area: "Biyem Assi",
    location: "Route de l’Aéroport, Biyem Assi",
    image: "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=900&q=80",
    rating: 4.9,
    deliveryTime: "15–25 mins",
    openLabel: "Open from 7:00 PM",
    description: "Fast burgers, fries, and sharing platters for the evening rush.",
    tags: ["Burgers", "Fast", "Late"],
    accent: "#fb923c",
    menu: [
      { id: "grill-burger", name: "Double Burger", description: "With cheddar, salad, and fries", priceXaf: 6200, tag: "Best seller" },
      { id: "grill-fries", name: "Loaded Fries", description: "Cheese, sauce, and grilled chicken", priceXaf: 4800, tag: "Sharing" },
      { id: "grill-drink", name: "Smoothie", description: "Mango or passion fruit", priceXaf: 2800, tag: "Cold" },
    ],
  },
];

const AREAS = ["Biyem Assi", "Mendong", "Nkolbisson", "Omnisport", "Mokolo"];

export function FoodForm() {
  const { locale } = useTranslation();
  const fr = locale === "fr";
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<"all" | "late" | "local" | "fast">("all");
  const [selectedRestaurantId, setSelectedRestaurantId] = useState(RESTAURANTS[0].id);
  const [selectedArea, setSelectedArea] = useState("Biyem Assi");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [recipientName, setRecipientName] = useState(fr ? "Aïcha" : "Aicha");
  const [recipientPhone, setRecipientPhone] = useState("6 90 12 34 56");
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");

  const filteredRestaurants = useMemo(() => {
    const q = query.trim().toLowerCase();
    return RESTAURANTS.filter((restaurant) => {
      const matchesQuery = !q || restaurant.name.toLowerCase().includes(q) || restaurant.tags.some((tag) => tag.toLowerCase().includes(q));
      const matchesTag =
        activeTag === "all" ||
        (activeTag === "late" && restaurant.tags.some((tag) => tag.toLowerCase().includes("late"))) ||
        (activeTag === "local" && restaurant.tags.some((tag) => tag.toLowerCase().includes("local"))) ||
        (activeTag === "fast" && restaurant.tags.some((tag) => tag.toLowerCase().includes("fast")));
      return matchesQuery && matchesTag;
    });
  }, [activeTag, query]);

  const selectedRestaurant = filteredRestaurants.find((restaurant) => restaurant.id === selectedRestaurantId) ?? filteredRestaurants[0] ?? RESTAURANTS[0];

  const cartItems = useMemo(() => {
    return Object.entries(cart)
      .map(([itemId, quantity]) => {
        const restaurant = RESTAURANTS.find((entry) => entry.menu.some((menuItem) => menuItem.id === itemId));
        const menuItem = restaurant?.menu.find((entry) => entry.id === itemId);
        if (!menuItem || !quantity) return null;
        return { ...menuItem, quantity, restaurantName: restaurant?.name ?? "" };
      })
      .filter(Boolean) as Array<MenuItem & { quantity: number; restaurantName: string }>;
  }, [cart]);

  const subtotal = useMemo(() => cartItems.reduce((sum, item) => sum + item.priceXaf * item.quantity, 0), [cartItems]);
  const total = subtotal + 1500;

  function addItem(restaurantId: string, itemId: string) {
    setSelectedRestaurantId(restaurantId);
    setCart((prev) => ({ ...prev, [itemId]: (prev[itemId] ?? 0) + 1 }));
  }

  function submitOrder() {
    if (!cartItems.length) return;

    const restaurant = selectedRestaurant;
    const lineItems = cartItems.map((item) => `${item.quantity}× ${item.name}`).join(" · ");
    const draft: OrderDraft = {
      fullName: recipientName.trim() || (fr ? "Client" : "Customer"),
      whatsappNumber: recipientPhone.trim() || (fr ? "690123456" : "690123456"),
      preferredLanguage: fr ? "FR" : "EN",
      serviceType: "FOOD_PICKUP",
      merchantId: restaurant.id,
      pickupLocation: `${restaurant.name} — ${restaurant.location}`,
      pickupLandmark: restaurant.area,
      deliveryLocation: `${selectedArea} — ${restaurant.area}`,
      deliveryLandmark: selectedArea,
      pickupZoneId: "",
      deliveryZoneId: "",
      pickupLat: null,
      pickupLng: null,
      deliveryLat: null,
      deliveryLng: null,
      itemDescription: lineItems,
      serviceDetails: {
        vendorName: restaurant.name,
        restaurantId: restaurant.id,
        area: selectedArea,
        items: cartItems.map((item) => ({ name: item.name, qty: item.quantity, notes: "" })),
        notes,
      },
      quantity: cartItems.reduce((sum, item) => sum + item.quantity, 0),
      declaredValueXaf: 0,
      preferredDeliveryTime: "ASAP",
      specialInstructions: notes,
      itemAlreadyPaid: false,
      riderPaysAtPickup: false,
      isFragile: false,
      needsTemperatureCare: false,
      isMedicine: false,
      paymentMethod,
      paymentPhone: recipientPhone.trim(),
      transactionReference: "",
      referralCode: "",
      goodsCapXaf: 0,
      acceptedTerms: true,
      estimatedFeeXaf: total,
      merchantName: restaurant.name,
      pickupZoneName: restaurant.area,
      deliveryZoneName: selectedArea,
      priceFirm: true,
    };

    saveDraft(draft);
    router.push("/order/review");
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-3">
      <section className="overflow-hidden rounded-[2rem] border border-amber-500/20 bg-gradient-to-br from-amber-500/20 via-black to-violet-950/30 p-5 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-500/15 px-3 py-1 text-sm font-semibold text-amber-200">
              <Sparkles className="h-4 w-4" />
              {fr ? "Commande facile à partir de 18h" : "Easy late-night ordering"}
            </div>
            <h1 className="mt-3 font-display text-3xl font-bold leading-tight text-white md:text-4xl">
              {fr ? "Découvrez les restaurants ouverts autour de Biyem Assi" : "Browse open restaurants around Biyem Assi"}
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-mist-300 md:text-base">
              {fr
                ? "Choisissez un restaurant, ajoutez vos plats préférés et faites-vous livrer rapidement dans Yaoundé."
                : "Pick a restaurant, add your favourite meals, and have them delivered quickly across Yaoundé."}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-mist-200">
            <div className="flex items-center gap-2 font-semibold text-amber-200">
              <Store className="h-4 w-4" />
              {fr ? "Restaurants vérifiés" : "Verified partners"}
            </div>
            <div className="mt-1 text-2xl font-bold text-white">{RESTAURANTS.length}+</div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {[
            { key: "all", label: fr ? "Tout" : "All" },
            { key: "late", label: fr ? "Tard le soir" : "Late night" },
            { key: "local", label: fr ? "Spécialités locales" : "Local favourites" },
            { key: "fast", label: fr ? "Rapide" : "Fast" },
          ].map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => setActiveTag(chip.key as typeof activeTag)}
              className={cn(
                "rounded-full border px-3 py-2 text-sm font-medium transition",
                activeTag === chip.key ? "border-amber-400 bg-amber-500/20 text-amber-100" : "border-white/10 bg-black/20 text-mist-300"
              )}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </section>

      <div className="mt-4 flex items-center gap-2 rounded-2xl border border-ink-700 bg-ink-900/70 px-3 py-3">
        <Search className="h-4 w-4 text-mist-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={fr ? "Rechercher un restaurant ou un plat" : "Search a restaurant or dish"}
          className="w-full bg-transparent text-sm text-mist-100 outline-none placeholder:text-mist-500"
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="space-y-4">
          {filteredRestaurants.map((restaurant) => {
            const isSelected = selectedRestaurant.id === restaurant.id;
            return (
              <article key={restaurant.id} className="overflow-hidden rounded-[1.5rem] border border-ink-700 bg-ink-900/80 shadow-lg shadow-black/20">
                <div className="relative h-44 w-full">
                  <img src={restaurant.image} alt={restaurant.name} className="h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                  <div className="absolute left-4 top-4 rounded-full border border-white/15 bg-black/50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">
                    {restaurant.openLabel}
                  </div>
                  <div className="absolute right-4 top-4 flex items-center gap-1 rounded-full bg-black/55 px-3 py-1 text-sm font-semibold text-white">
                    <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                    {restaurant.rating.toFixed(1)}
                  </div>
                </div>

                <div className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="font-display text-xl font-semibold text-white">{restaurant.name}</h2>
                      <p className="mt-1 text-sm text-mist-400">{restaurant.description}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedRestaurantId(restaurant.id)}
                      className={cn(
                        "rounded-full border px-3 py-2 text-sm font-semibold transition",
                        isSelected ? "border-amber-400 bg-amber-500/20 text-amber-100" : "border-ink-600 bg-ink-800 text-mist-200"
                      )}
                    >
                      {isSelected ? (fr ? "Sélectionné" : "Selected") : (fr ? "Voir le menu" : "Open menu")}
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {restaurant.tags.map((tag) => (
                      <span key={tag} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-mist-300">
                        {tag}
                      </span>
                    ))}
                    <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300">
                      <Clock3 className="mr-1 inline h-3 w-3" /> {restaurant.deliveryTime}
                    </span>
                  </div>

                  <div className="mt-4 space-y-3">
                    {restaurant.menu.map((item) => (
                      <div key={item.id} className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-ink-700 bg-ink-950/60 p-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-mist-100">{item.name}</p>
                            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-200">{item.tag}</span>
                          </div>
                          <p className="mt-1 text-sm text-mist-400">{item.description}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-amber-200">{formatXaf(item.priceXaf)}</span>
                          <button
                            type="button"
                            onClick={() => addItem(restaurant.id, item.id)}
                            className="rounded-full bg-amber-400 px-3 py-2 text-sm font-semibold text-ink-950"
                          >
                            {fr ? "Ajouter" : "Add"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <aside className="lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-[1.5rem] border border-ink-700 bg-ink-900/85 p-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-xl font-semibold text-white">{fr ? "Votre commande" : "Your order"}</h2>
                <p className="text-sm text-mist-400">{fr ? "Sélectionnez vos plats, puis passez au paiement." : "Pick your meals, then continue to checkout."}</p>
              </div>
              <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-sm font-semibold text-emerald-300">
                <BadgeCheck className="mr-1 inline h-4 w-4" /> {fr ? "Prêt" : "Ready"}
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-ink-700 bg-ink-950/70 p-3">
              {cartItems.length ? (
                <div className="space-y-2">
                  {cartItems.map((item) => (
                    <div key={`${item.restaurantName}-${item.id}`} className="flex items-center justify-between gap-3 text-sm text-mist-300">
                      <span>
                        <span className="font-semibold text-mist-100">{item.quantity}×</span> {item.name}
                      </span>
                      <span>{formatXaf(item.priceXaf * item.quantity)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-mist-400">{fr ? "Ajoutez un repas pour commencer." : "Add a meal to begin."}</p>
              )}
            </div>

            <div className="mt-4 space-y-3 rounded-2xl border border-ink-700 bg-ink-950/60 p-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <MapPin className="h-4 w-4 text-amber-300" />
                {fr ? "Lieu de livraison" : "Delivery area"}
              </div>
              <select
                value={selectedArea}
                onChange={(event) => setSelectedArea(event.target.value)}
                className="w-full rounded-xl border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-mist-100 outline-none"
              >
                {AREAS.map((area) => (
                  <option key={area} value={area}>{area}</option>
                ))}
              </select>

              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Phone className="h-4 w-4 text-amber-300" />
                {fr ? "Détails du destinataire" : "Recipient details"}
              </div>
              <input
                value={recipientName}
                onChange={(event) => setRecipientName(event.target.value)}
                className="w-full rounded-xl border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-mist-100 outline-none"
                placeholder={fr ? "Nom du destinataire" : "Recipient name"}
              />
              <input
                value={recipientPhone}
                onChange={(event) => setRecipientPhone(event.target.value)}
                className="w-full rounded-xl border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-mist-100 outline-none"
                placeholder={fr ? "Numéro WhatsApp" : "WhatsApp number"}
              />
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className="min-h-20 w-full rounded-xl border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-mist-100 outline-none"
                placeholder={fr ? "Instructions supplémentaires" : "Add delivery notes"}
              />

              <div className="flex flex-wrap gap-2">
                {([
                  { value: "CASH", label: fr ? "Espèces" : "Cash" },
                  { value: "MTN_MOMO", label: "MTN MoMo" },
                  { value: "ORANGE_MONEY", label: "Orange Money" },
                ] as Array<{ value: PaymentMethod; label: string }>).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPaymentMethod(option.value)}
                    className={cn(
                      "rounded-full border px-3 py-2 text-sm font-semibold",
                      paymentMethod === option.value ? "border-amber-400 bg-amber-500/20 text-amber-100" : "border-ink-600 bg-ink-800 text-mist-300"
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-amber-500/15 bg-amber-500/10 p-3 text-sm text-amber-100">
              <div className="flex items-center justify-between">
                <span>{fr ? "Sous-total" : "Subtotal"}</span>
                <span>{formatXaf(subtotal)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-mist-300">
                <span>{fr ? "Frais de livraison" : "Delivery fee"}</span>
                <span>{formatXaf(1500)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-amber-400/20 pt-2 font-semibold text-white">
                <span>{fr ? "Total" : "Total"}</span>
                <span>{formatXaf(total)}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={submitOrder}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-400 px-4 py-3 font-display text-base font-bold text-ink-950"
            >
              <ShoppingBag className="h-5 w-5" />
              {fr ? "Continuer la commande" : "Continue to review"}
              <ArrowRight className="h-5 w-5" />
            </button>
            <p className="mt-2 flex items-center justify-center gap-2 text-center text-xs text-mist-400">
              <UtensilsCrossed className="h-3.5 w-3.5 text-amber-300" />
              {fr ? "Votre commande est protégée, avec suivi simple et livraison rapide." : "Your order is protected with simple tracking and fast delivery."}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
