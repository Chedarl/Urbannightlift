import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MessageCircle, Phone } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/admin/StatusBadge";
import { buildWaLink } from "@/lib/whatsapp/links";
import { formatXaf } from "@/lib/utils";

export const dynamic = "force-dynamic";

const card = "rounded-2xl border border-ink-700 bg-ink-900 p-4";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
      orders: {
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          deliveryZone: { select: { zoneName: true } },
        },
      },
    },
  });
  if (!customer) notFound();

  const fees = customer.orders.reduce(
    (sum, o) => sum + (o.finalDeliveryFeeXaf ?? o.estimatedDeliveryFeeXaf ?? 0),
    0
  );
  const delivered = customer.orders.filter((o) => o.orderStatus === "DELIVERED").length;

  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin/customers" className="inline-flex items-center gap-1.5 text-sm text-mist-400 hover:text-mist-200">
        <ArrowLeft className="h-4 w-4" /> All customers
      </Link>

      <section className={card}>
        <h1 className="font-display text-xl font-bold text-mist-100">{customer.fullName}</h1>
        <p className="mt-1 text-sm text-mist-400">{customer.whatsappNumber}</p>
        {customer.alternativePhone && (
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-mist-500">
            <Phone className="h-3 w-3" /> {customer.alternativePhone}
          </p>
        )}

        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Orders" value={String(customer.orders.length)} />
          <Stat label="Delivered" value={String(delivered)} />
          <Stat label="Delivery fees" value={formatXaf(fees)} />
          <Stat label="Language" value={customer.preferredLanguage} />
        </div>

        <a
          href={buildWaLink(customer.whatsappNumber, `Urban Night Lift — hello ${customer.fullName}`)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-4 py-2 text-sm font-semibold text-ink-950"
        >
          <MessageCircle className="h-4 w-4" /> Message on WhatsApp
        </a>

        {customer.notes && (
          <p className="mt-3 rounded-xl bg-ink-800 p-3 text-xs text-mist-300">{customer.notes}</p>
        )}
      </section>

      <section className={card}>
        <h2 className="mb-3 font-display text-sm font-semibold text-gold-300">Order history</h2>
        {customer.orders.length === 0 ? (
          <p className="text-sm text-mist-500">No orders yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {customer.orders.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/admin/orders/${o.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-700/70 bg-ink-800/50 px-3 py-2 hover:border-violet-500/60"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-gold-300">{o.orderCode}</span>
                    <span className="text-xs text-mist-400">
                      {new Date(o.createdAt).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "2-digit",
                      })}
                    </span>
                    {o.deliveryZone && <span className="text-xs text-mist-500">{o.deliveryZone.zoneName}</span>}
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-mist-300">
                      {formatXaf(o.finalDeliveryFeeXaf ?? o.estimatedDeliveryFeeXaf ?? 0)}
                    </span>
                    <PaymentStatusBadge status={o.paymentStatus} />
                    <OrderStatusBadge status={o.orderStatus} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-800/60 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-mist-500">{label}</p>
      <p className="mt-0.5 font-display text-sm font-bold text-mist-100">{value}</p>
    </div>
  );
}
