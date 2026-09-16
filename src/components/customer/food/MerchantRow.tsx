"use client";

import { freshLabel } from "@/lib/merchants/freshness";
import { BusinessCard, fromMerchant } from "@/components/customer/business/BusinessCard";
import type { FoodMerchant } from "@/app/api/food/browse/route";

/**
 * A restaurant in the food list.
 *
 * This used to hold the row's markup. It now holds only what is specific to
 * *food*: the amber accent, the cart badge, and reading the freshness line.
 * Everything else is `BusinessCard`, which the pharmacy list, the parcel picker
 * and the discovery results all use too.
 *
 * Splitting it that way is not tidiness. The card is where "a business we have
 * called" and "a business we found on a map" are either told apart or quietly
 * conflated, and this product has already shipped invented restaurants once. A
 * second copy of that row is a second place for the distinction to go missing.
 *
 * The density decision the old billboard card was replaced over is unchanged
 * and lives in `BusinessCard` now, with the reasoning.
 */
export function MerchantRow({
  merchant,
  fr,
  inCart,
  onOpen,
}: {
  merchant: FoodMerchant;
  fr: boolean;
  inCart: number;
  onOpen: () => void;
}) {
  return (
    <BusinessCard
      business={fromMerchant(merchant, freshLabel(merchant.checkedAt, fr))}
      accent="amber"
      fr={fr}
      badgeCount={inCart}
      itemNoun={fr ? "plats" : "dishes"}
      onSelect={onOpen}
    />
  );
}
