import type { Prisma } from "@prisma/client";
import { normalizePhone } from "@/lib/utils";

/**
 * Search customers by name or phone. Phone numbers are stored normalized
 * (237XXXXXXXXX), so a query like "+237 690..." or "690..." has to be normalized
 * before it will match.
 */
export function buildCustomerWhere(query: string): Prisma.CustomerWhereInput {
  const q = query.trim();
  if (!q) return {};

  const digits = q.replace(/[^\d]/g, "");
  const or: Prisma.CustomerWhereInput[] = [
    { fullName: { contains: q, mode: "insensitive" } },
  ];

  if (digits.length >= 3) {
    or.push({ whatsappNumber: { contains: digits } });
    or.push({ alternativePhone: { contains: digits } });
    const normalized = normalizePhone(q);
    if (normalized && normalized !== digits) {
      or.push({ whatsappNumber: { contains: normalized } });
    }
  }

  return { OR: or };
}

export const CUSTOMERS_PAGE_SIZE = 30;
