import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { formatCents } from "@/lib/money";
import { NavBar } from "@/components/NavBar";

// Reads live from Prisma on every request — without this, Next prerenders
// the page as static HTML at build time and it never reflects new data.
export const dynamic = "force-dynamic";

function parseMonthParam(month: string | undefined): Date {
  if (month) {
    const match = month.match(/^(\d{4})-(\d{2})$/);
    if (match) {
      const year = Number(match[1]);
      const monthIndex = Number(match[2]) - 1;
      if (monthIndex >= 0 && monthIndex <= 11) {
        return new Date(Date.UTC(year, monthIndex, 1));
      }
    }
  }
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function monthParam(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function getWeekStart(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay()); // back up to Sunday
  return d;
}

function formatWeekLabel(weekStart: Date): string {
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
  return `${fmt(weekStart)} – ${fmt(weekEnd)}`;
}

function StatTile({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  const content = (
    <div className="rounded border p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-3xl font-semibold">{value}</p>
    </div>
  );
  return href ? (
    <Link href={href} className="block hover:bg-gray-50">
      {content}
    </Link>
  ) : (
    content
  );
}

export default async function DashboardPage(props: {
  searchParams: Promise<{ month?: string }>;
}) {
  const searchParams = await props.searchParams;
  const monthStart = parseMonthParam(searchParams.month);
  const nextMonthStart = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));
  const prevMonthStart = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() - 1, 1));
  const monthLabel = monthStart.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const thisMonth = { invoiceDate: { gte: monthStart, lt: nextMonthStart } };

  const [totalInvoices, revenue, potentialRevenue, reviewCount, approvedCount] = await Promise.all([
    prisma.invoice.count({ where: thisMonth }),
    prisma.invoice.aggregate({ _sum: { calculatedAmountDueCents: true }, where: thisMonth }),
    prisma.invoice.aggregate({ _sum: { calculatedTotalChargesCents: true }, where: thisMonth }),
    prisma.invoice.count({ where: { validationStatus: "REVIEW" } }),
    prisma.invoice.count({ where: { validationStatus: "APPROVED" } }),
  ]);

  const topStoresRaw = await prisma.invoice.groupBy({
    by: ["storeId"],
    _sum: { calculatedAmountDueCents: true },
    _count: true,
    orderBy: { _sum: { calculatedAmountDueCents: "desc" } },
    take: 5,
  });
  const stores = await prisma.store.findMany({
    where: { id: { in: topStoresRaw.map((s) => s.storeId) } },
  });
  const storeById = new Map(stores.map((s) => [s.id, s]));

  const topProductsRaw = await prisma.invoiceItem.groupBy({
    by: ["productId"],
    where: { productId: { not: null } },
    _sum: { netSoldAmountCents: true, soldQuantity: true },
    _count: true,
    orderBy: { _sum: { netSoldAmountCents: "desc" } },
    take: 5,
  });
  const products = await prisma.product.findMany({
    where: { id: { in: topProductsRaw.map((p) => p.productId as string) } },
  });
  const productById = new Map(products.map((p) => [p.id, p]));

  const allInvoiceDates = await prisma.invoice.findMany({
    select: { invoiceDate: true, calculatedAmountDueCents: true },
  });
  const revenueByWeek = new Map<string, { weekStart: Date; revenueCents: number; count: number }>();
  for (const inv of allInvoiceDates) {
    const weekStart = getWeekStart(inv.invoiceDate);
    const key = weekStart.toISOString();
    const existing = revenueByWeek.get(key);
    if (existing) {
      existing.revenueCents += inv.calculatedAmountDueCents;
      existing.count += 1;
    } else {
      revenueByWeek.set(key, { weekStart, revenueCents: inv.calculatedAmountDueCents, count: 1 });
    }
  }
  const weeklyRevenue = [...revenueByWeek.values()].sort(
    (a, b) => a.weekStart.getTime() - b.weekStart.getTime()
  );

  return (
    <main className="mx-auto max-w-5xl p-6">
      <NavBar />
      <h1 className="mb-4 text-2xl font-semibold">Dashboard</h1>

      <div className="mb-4 flex items-center gap-4">
        <Link
          href={`/dashboard?month=${monthParam(prevMonthStart)}`}
          className="text-sm text-blue-600 underline"
        >
          ← Previous month
        </Link>
        <span className="font-medium">{monthLabel}</span>
        <Link
          href={`/dashboard?month=${monthParam(nextMonthStart)}`}
          className="text-sm text-blue-600 underline"
        >
          Next month →
        </Link>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-5">
        <StatTile
          label={`Total invoices, ${monthLabel}`}
          value={totalInvoices.toLocaleString()}
        />
        <StatTile
          label={`Potential revenue, ${monthLabel} (no returns)`}
          value={formatCents(potentialRevenue._sum.calculatedTotalChargesCents ?? 0)}
        />
        <StatTile
          label={`Revenue, ${monthLabel}`}
          value={formatCents(revenue._sum.calculatedAmountDueCents ?? 0)}
        />
        <StatTile
          label="Needs review"
          value={reviewCount.toLocaleString()}
          href="/review?status=REVIEW"
        />
        <StatTile
          label="Approved"
          value={approvedCount.toLocaleString()}
          href="/review?status=APPROVED"
        />
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <div>
          <h2 className="mb-2 font-medium">Top stores</h2>
          {topStoresRaw.length === 0 ? (
            <p className="text-sm text-gray-500">No data yet.</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2 pr-4">Store</th>
                  <th className="py-2 pr-4">Invoices</th>
                  <th className="py-2 pr-4">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {topStoresRaw.map((row) => {
                  const store = storeById.get(row.storeId);
                  return (
                    <tr key={row.storeId} className="border-b">
                      <td className="py-2 pr-4">
                        <Link href={`/stores/${row.storeId}`} className="text-blue-600 underline">
                          {store?.name ?? row.storeId}
                        </Link>
                        {store?.address && (
                          <div className="text-xs text-gray-500">{store.address}</div>
                        )}
                      </td>
                      <td className="py-2 pr-4 tabular-nums">{row._count}</td>
                      <td className="py-2 pr-4 tabular-nums">
                        {formatCents(row._sum.calculatedAmountDueCents ?? 0)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div>
          <h2 className="mb-2 font-medium">Top products</h2>
          {topProductsRaw.length === 0 ? (
            <p className="text-sm text-gray-500">No data yet.</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2 pr-4">Product</th>
                  <th className="py-2 pr-4">Qty sold</th>
                  <th className="py-2 pr-4">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {topProductsRaw.map((row) => {
                  const product = row.productId ? productById.get(row.productId) : undefined;
                  return (
                    <tr key={row.productId} className="border-b">
                      <td className="py-2 pr-4">{product?.name ?? "Unknown"}</td>
                      <td className="py-2 pr-4 tabular-nums">{row._sum.soldQuantity ?? 0}</td>
                      <td className="py-2 pr-4 tabular-nums">
                        {formatCents(row._sum.netSoldAmountCents ?? 0)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="mt-8">
        <h2 className="mb-2 font-medium">Revenue by week</h2>
        {weeklyRevenue.length === 0 ? (
          <p className="text-sm text-gray-500">No data yet.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-2 pr-4">Week</th>
                <th className="py-2 pr-4">Invoices</th>
                <th className="py-2 pr-4">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {weeklyRevenue.map((week) => (
                <tr key={week.weekStart.toISOString()} className="border-b">
                  <td className="py-2 pr-4">{formatWeekLabel(week.weekStart)}</td>
                  <td className="py-2 pr-4 tabular-nums">{week.count}</td>
                  <td className="py-2 pr-4 tabular-nums">{formatCents(week.revenueCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
