import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { formatCents } from "@/lib/money";
import { NavBar } from "@/components/NavBar";
import { MonthSelect } from "@/components/dashboard/MonthSelect";
import { StoreListModal } from "@/components/dashboard/StoreListModal";
import { MonthlyBarChart, type MonthlyBarDatum } from "@/components/dashboard/MonthlyBarChart";
import { getMismatchedInvoices, summarizeMismatches } from "@/lib/reconciliation";
import {
  parseMonthParam,
  monthParam,
  formatMonthLabel,
  getWeekStart,
  weekParam,
  formatWeekLabel,
} from "@/lib/dates";

// Reads live from Prisma on every request — without this, Next prerenders
// the page as static HTML at build time and it never reflects new data.
export const dynamic = "force-dynamic";

function percentSold(sold: number, delivered: number): number | null {
  return delivered > 0 ? (sold / delivered) * 100 : null;
}

function formatPercent(percent: number | null): string {
  return percent === null ? "—" : `${percent.toFixed(0)}%`;
}

function StatTile({
  label,
  value,
  href,
  sub,
}: {
  label: string;
  value: string;
  href?: string;
  sub?: string;
}) {
  const content = (
    <div className="rounded border p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-3xl font-semibold">{value}</p>
      {sub && <p className="mt-1 text-xs text-gray-400">{sub}</p>}
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
  const monthLabel = formatMonthLabel(monthStart);
  const thisMonth = { invoiceDate: { gte: monthStart, lt: nextMonthStart } };

  const monthRows = await prisma.$queryRaw<{ month: string }[]>`
    SELECT DISTINCT to_char(invoice_date, 'YYYY-MM') AS month
    FROM invoices
    ORDER BY month DESC
  `;
  const monthValues = new Set(monthRows.map((r) => r.month));
  monthValues.add(monthParam(monthStart));
  const monthOptions = [...monthValues]
    .sort((a, b) => (a < b ? 1 : -1))
    .map((value) => ({
      value,
      label: formatMonthLabel(parseMonthParam(value)),
    }));

  const year = monthStart.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const nextYearStart = new Date(Date.UTC(year + 1, 0, 1));

  const [totalInvoices, revenue, potentialRevenue, reviewCount, mismatches, monthlyRaw] =
    await Promise.all([
      prisma.invoice.count({ where: thisMonth }),
      prisma.invoice.aggregate({ _sum: { calculatedAmountDueCents: true }, where: thisMonth }),
      prisma.invoice.aggregate({ _sum: { calculatedTotalChargesCents: true }, where: thisMonth }),
      prisma.invoice.count({ where: { ...thisMonth, validationStatus: "REVIEW" } }),
      getMismatchedInvoices(),
      prisma.$queryRaw<{ month: string; revenue_cents: number }[]>`
      SELECT to_char(invoice_date, 'YYYY-MM') AS month,
             SUM(calculated_amount_due_cents)::int AS revenue_cents
      FROM invoices
      WHERE invoice_date >= ${yearStart} AND invoice_date < ${nextYearStart}
      GROUP BY month
    `,
    ]);
  const reconciliationSummary = summarizeMismatches(mismatches);

  // Always all 12 months of the selected year, even ones with no invoices
  // yet, so the shape of the year is visible rather than just the months
  // with data so far.
  const monthlyByKey = new Map(monthlyRaw.map((r) => [r.month, r]));
  const monthlyRevenue: MonthlyBarDatum[] = [];
  for (let m = 0; m < 12; m++) {
    const monthDate = new Date(Date.UTC(year, m, 1));
    const monthValue = monthParam(monthDate);
    const label = monthDate.toLocaleDateString(undefined, { month: "short", timeZone: "UTC" });
    const revenueCents = monthlyByKey.get(monthValue)?.revenue_cents ?? 0;
    monthlyRevenue.push({
      label,
      monthValue,
      value: revenueCents,
      displayValue: formatCents(revenueCents),
    });
  }

  const monthInvoicesForStores = await prisma.invoice.findMany({
    where: thisMonth,
    select: {
      storeId: true,
      calculatedAmountDueCents: true,
      items: { select: { soldQuantity: true, deliveredQuantity: true } },
    },
  });
  const storeAgg = new Map<
    string,
    { qtySold: number; qtyDelivered: number; revenueCents: number; invoiceCount: number }
  >();
  for (const inv of monthInvoicesForStores) {
    const qtySold = inv.items.reduce((sum, item) => sum + item.soldQuantity, 0);
    const qtyDelivered = inv.items.reduce((sum, item) => sum + item.deliveredQuantity, 0);
    const existing = storeAgg.get(inv.storeId);
    if (existing) {
      existing.qtySold += qtySold;
      existing.qtyDelivered += qtyDelivered;
      existing.revenueCents += inv.calculatedAmountDueCents;
      existing.invoiceCount += 1;
    } else {
      storeAgg.set(inv.storeId, {
        qtySold,
        qtyDelivered,
        revenueCents: inv.calculatedAmountDueCents,
        invoiceCount: 1,
      });
    }
  }
  const topStoresRaw = [...storeAgg.entries()]
    .map(([storeId, agg]) => ({
      storeId,
      ...agg,
      qtyUnsold: agg.qtyDelivered - agg.qtySold,
      percentSold: percentSold(agg.qtySold, agg.qtyDelivered),
    }))
    .sort((a, b) => (b.percentSold ?? -1) - (a.percentSold ?? -1));
  const stores = await prisma.store.findMany({
    where: { id: { in: topStoresRaw.map((s) => s.storeId) } },
  });
  const storeById = new Map(stores.map((s) => [s.id, s]));
  const allStoresEnriched = topStoresRaw.map((row) => ({
    storeId: row.storeId,
    storeName: storeById.get(row.storeId)?.name ?? row.storeId,
    storeAddress: storeById.get(row.storeId)?.address ?? null,
    qtySold: row.qtySold,
    qtyDelivered: row.qtyDelivered,
    qtyUnsold: row.qtyUnsold,
    percentSold: row.percentSold,
    revenueCents: row.revenueCents,
  }));
  const topFiveStores = topStoresRaw.slice(0, 5);

  const productAggRaw = await prisma.invoiceItem.groupBy({
    by: ["productId"],
    where: { productId: { not: null }, invoice: thisMonth },
    _sum: { netSoldAmountCents: true, soldQuantity: true, deliveredQuantity: true },
    _count: true,
  });
  const topProductsRaw = productAggRaw
    .map((row) => ({
      ...row,
      qtyUnsold: (row._sum.deliveredQuantity ?? 0) - (row._sum.soldQuantity ?? 0),
      percentSold: percentSold(row._sum.soldQuantity ?? 0, row._sum.deliveredQuantity ?? 0),
    }))
    .sort((a, b) => (b.percentSold ?? -1) - (a.percentSold ?? -1))
    .slice(0, 5);
  const products = await prisma.product.findMany({
    where: { id: { in: topProductsRaw.map((p) => p.productId as string) } },
  });
  const productById = new Map(products.map((p) => [p.id, p]));

  const allInvoiceDates = await prisma.invoice.findMany({
    where: thisMonth,
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

      <div className="mb-4">
        <MonthSelect value={monthParam(monthStart)} options={monthOptions} />
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-5">
        <StatTile label="Total invoices" value={totalInvoices.toLocaleString()} />
        <StatTile
          label="Potential revenue (no returns)"
          value={formatCents(potentialRevenue._sum.calculatedTotalChargesCents ?? 0)}
        />
        <StatTile
          label="Revenue"
          value={formatCents(revenue._sum.calculatedAmountDueCents ?? 0)}
        />
        <StatTile
          label="Needs review"
          value={reviewCount.toLocaleString()}
          href="/review?status=REVIEW"
        />
        <StatTile
          label="Write-in error impact"
          value={formatCents(reconciliationSummary.approvedNetCents)}
          sub="approved invoices, all-time"
          href="/reconciliation"
        />
      </div>

      <div className="mt-8">
        <h2 className="mb-4 font-medium">Revenue by month ({year})</h2>
        <MonthlyBarChart
          data={monthlyRevenue}
          color="#2563eb"
          highlightMonthValue={monthParam(monthStart)}
        />
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
                  <td className="py-2 pr-4 tabular-nums">
                    <Link
                      href={`/review?status=ALL&week=${weekParam(week.weekStart)}`}
                      className="text-blue-600 underline"
                    >
                      {week.count}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 tabular-nums">{formatCents(week.revenueCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-medium">Top stores</h2>
            {topStoresRaw.length > 0 && (
              <StoreListModal stores={allStoresEnriched} month={monthParam(monthStart)} />
            )}
          </div>
          {topFiveStores.length === 0 ? (
            <p className="text-sm text-gray-500">No data yet.</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2 pr-4">Store</th>
                  <th className="py-2 pr-4">Delivered</th>
                  <th className="py-2 pr-4">Sold</th>
                  <th className="py-2 pr-4">Unsold</th>
                  <th className="py-2 pr-4">% sold</th>
                  <th className="py-2 pr-4">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {topFiveStores.map((row) => {
                  const store = storeById.get(row.storeId);
                  return (
                    <tr key={row.storeId} className="border-b">
                      <td className="py-2 pr-4">
                        <Link
                          href={`/review?status=ALL&store=${row.storeId}&month=${monthParam(monthStart)}`}
                          className="text-blue-600 underline"
                        >
                          {store?.name ?? row.storeId}
                        </Link>
                        {store?.address && (
                          <div className="text-xs text-gray-500">{store.address}</div>
                        )}
                      </td>
                      <td className="py-2 pr-4 tabular-nums">{row.qtyDelivered}</td>
                      <td className="py-2 pr-4 tabular-nums">{row.qtySold}</td>
                      <td className="py-2 pr-4 tabular-nums">{row.qtyUnsold}</td>
                      <td className="py-2 pr-4 tabular-nums">{formatPercent(row.percentSold)}</td>
                      <td className="py-2 pr-4 tabular-nums">{formatCents(row.revenueCents)}</td>
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
                  <th className="py-2 pr-4">Delivered</th>
                  <th className="py-2 pr-4">Sold</th>
                  <th className="py-2 pr-4">Unsold</th>
                  <th className="py-2 pr-4">% sold</th>
                  <th className="py-2 pr-4">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {topProductsRaw.map((row) => {
                  const product = row.productId ? productById.get(row.productId) : undefined;
                  return (
                    <tr key={row.productId} className="border-b">
                      <td className="py-2 pr-4">{product?.name ?? "Unknown"}</td>
                      <td className="py-2 pr-4 tabular-nums">{row._sum.deliveredQuantity ?? 0}</td>
                      <td className="py-2 pr-4 tabular-nums">{row._sum.soldQuantity ?? 0}</td>
                      <td className="py-2 pr-4 tabular-nums">{row.qtyUnsold}</td>
                      <td className="py-2 pr-4 tabular-nums">{formatPercent(row.percentSold)}</td>
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
    </main>
  );
}
