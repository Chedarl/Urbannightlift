import type { Order, Customer, Zone, User } from "@prisma/client";

export type ExportableOrder = Order & {
  customer: Pick<Customer, "fullName" | "whatsappNumber">;
  pickupZone: Pick<Zone, "zoneName"> | null;
  deliveryZone: Pick<Zone, "zoneName"> | null;
  assignedRider: Pick<User, "fullName"> | null;
};

const HEADERS = [
  "Order Code",
  "Created At",
  "Customer Name",
  "WhatsApp",
  "Service Type",
  "Pickup Location",
  "Pickup Zone",
  "Delivery Location",
  "Delivery Zone",
  "Item Description",
  "Quantity",
  "Declared Value XAF",
  "Estimated Fee XAF",
  "Final Fee XAF",
  "Payment Method",
  "Payment Status",
  "Order Status",
  "Assigned Rider",
  "Risk Flag",
  "High Value Flag",
  "Completed At",
];

function escape(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function ordersToCsv(orders: ExportableOrder[]): string {
  const rows = [HEADERS.join(",")];
  for (const o of orders) {
    rows.push(
      [
        o.orderCode,
        o.createdAt.toISOString(),
        o.customer.fullName,
        o.customer.whatsappNumber,
        o.serviceType,
        o.pickupLocation,
        o.pickupZone?.zoneName ?? "",
        o.deliveryLocation,
        o.deliveryZone?.zoneName ?? "",
        o.itemDescription,
        o.quantity,
        o.declaredValueXaf,
        o.estimatedDeliveryFeeXaf ?? "",
        o.finalDeliveryFeeXaf ?? "",
        o.paymentMethod,
        o.paymentStatus,
        o.orderStatus,
        o.assignedRider?.fullName ?? "",
        o.riskFlag ? "YES" : "NO",
        o.highValueFlag ? "YES" : "NO",
        o.completedAt?.toISOString() ?? "",
      ]
        .map(escape)
        .join(",")
    );
  }
  return rows.join("\n");
}
