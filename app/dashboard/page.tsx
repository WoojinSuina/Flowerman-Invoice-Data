import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { formatCents, formatWholeDollars } from "@/lib/money";
import { NavBar } from "@/components/NavBar";
import { MonthSelect } from "@/components/dashboard/MonthSelect";
import { StoreListModal } from "@/components/dashboard/StoreListModal";
import { MonthlyBarChart, type MonthlyBarDatum } from "@/components/dashboard/MonthlyBarChart";
import { getMismatchedInvoices, summarizeMismatches } from "@/lib/reconciliation";
import { T } from "@/components/T";
import { isElderlyMode } from "@/lib/elderlyMode";
import type { ReactNode } from "react";
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
  label: ReactNode;
  value: string;
  href?: string;
  sub?: ReactNode;
}) {
  const content = (
    <div className="h-full min-w-0 rounded-lg border bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-gray-600">{label}</p>
      <p className="whitespace-nowrap text-base font-semibold text-gray-900 sm:text-2xl">{value}</p>
      {sub && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
    </div>
  );
  return href ? (
    <Link href={href} className="block transition-shadow hover:shadow-md">
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
  const elderly = await isElderlyMode();
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
      getMismatchedInvoices({ gte: monthStart, lt: nextMonthStart }),
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
      displayValue: formatWholeDollars(revenueCents),
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
    .sort((a, b) => (b._sum.netSoldAmountCents ?? 0) - (a._sum.netSoldAmountCents ?? 0));
  const products = await prisma.product.findMany({
    where: { id: { in: topProductsRaw.map((p) => p.productId as string) } },
  });
  const productById = new Map(products.map((p) => [p.id, p]));

  // Profit only counts products with a cost set (lib/... has none of this
  // in the invoice data itself — it is entered by hand on the Products
  // page) — a product with no cost yet is left out of the total rather
  // than assumed to cost $0, which would overstate profit.
  let totalProfitCents = 0;
  let productsMissingCost = 0;
  for (const row of topProductsRaw) {
    const product = row.productId ? productById.get(row.productId) : undefined;
    if (!product || product.costCents == null) {
      productsMissingCost += 1;
      continue;
    }
    const soldQuantity = row._sum.soldQuantity ?? 0;
    const revenueCents = row._sum.netSoldAmountCents ?? 0;
    totalProfitCents += revenueCents - product.costCents * soldQuantity;
  }

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
      <h1 className="mb-4 text-2xl font-semibold">
        <T k="dashboard" elderly={elderly} />
      </h1>

      <div className="mb-4">
        <MonthSelect value={monthParam(monthStart)} options={monthOptions} />
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-6">
        <StatTile label={<T k="totalInvoices" elderly={elderly} />} value={totalInvoices.toLocaleString()} />
        <StatTile
          label={<T k="potentialRevenueNoReturns" elderly={elderly} />}
          value={formatCents(potentialRevenue._sum.calculatedTotalChargesCents ?? 0)}
        />
        <StatTile
          label={<T k="revenue" elderly={elderly} />}
          value={formatCents(revenue._sum.calculatedAmountDueCents ?? 0)}
        />
        <StatTile
          label={<T k="profit" elderly={elderly} />}
          value={formatCents(totalProfitCents)}
          href="/products"
          sub={
            productsMissingCost > 0
              ? `${productsMissingCost} product${productsMissingCost === 1 ? "" : "s"} without a set cost excluded`
              : undefined
          }
        />
        <StatTile
          label={<T k="needsReview" elderly={elderly} />}
          value={reviewCount.toLocaleString()}
          href="/review?status=REVIEW"
        />
        <StatTile
          label={<T k="writeInErrorImpact" elderly={elderly} />}
          value={formatCents(reconciliationSummary.approvedNetCents)}
          sub={
            <>
              <T k="approvedInvoicesSub" elderly={elderly} />
              {monthLabel}
            </>
          }
          href="/reconciliation"
        />
      </div>

      <section className="mt-6 rounded-lg border bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          <T k="revenueByMonth" elderly={elderly} /> ({year})
        </h2>
        <MonthlyBarChart
          data={monthlyRevenue}
          color="#2563eb"
          selectedMonthValue={monthParam(monthStart)}
          todayMonthValue={monthParam(new Date())}
        />
      </section>

      <section className="mt-6 rounded-lg border bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          <T k="revenueByWeek" elderly={elderly} />
        </h2>
        {weeklyRevenue.length === 0 ? (
          <p className="text-sm text-gray-500">
            <T k="noDataYet" elderly={elderly} />
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2 pr-4">
                    <T k="week" elderly={elderly} />
                  </th>
                  <th className="py-2 pr-4">
                    <T k="invoicesCount" elderly={elderly} />
                  </th>
                  <th className="py-2 pr-4">
                    <T k="revenue" elderly={elderly} />
                  </th>
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
          </div>
        )}
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <section className="rounded-lg border bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              <T k="topStores" elderly={elderly} />
            </h2>
            {topStoresRaw.length > 0 && (
              <StoreListModal stores={allStoresEnriched} month={monthParam(monthStart)} />
            )}
          </div>
          {topFiveStores.length === 0 ? (
            <p className="text-sm text-gray-500">
              <T k="noDataYet" elderly={elderly} />
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="py-2 pr-4">
                      <T k="store" elderly={elderly} />
                    </th>
                    <th className="py-2 pr-4">
                      <T k="delivered" elderly={elderly} />
                    </th>
                    <th className="py-2 pr-4">
                      <T k="sold" elderly={elderly} />
                    </th>
                    <th className="py-2 pr-4">
                      <T k="unsold" elderly={elderly} />
                    </th>
                    <th className="py-2 pr-4">
                      <T k="percentSold" elderly={elderly} />
                    </th>
                    <th className="py-2 pr-4">
                      <T k="revenue" elderly={elderly} />
                    </th>
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
            </div>
          )}
        </section>

        <section className="rounded-lg border bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            <T k="topProducts" elderly={elderly} />
          </h2>
          {topProductsRaw.length === 0 ? (
            <p className="text-sm text-gray-500">
              <T k="noDataYet" elderly={elderly} />
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="py-2 pr-4">
                      <T k="product" elderly={elderly} />
                    </th>
                    <th className="py-2 pr-4">
                      <T k="delivered" elderly={elderly} />
                    </th>
                    <th className="py-2 pr-4">
                      <T k="sold" elderly={elderly} />
                    </th>
                    <th className="py-2 pr-4">
                      <T k="unsold" elderly={elderly} />
                    </th>
                    <th className="py-2 pr-4">
                      <T k="percentSold" elderly={elderly} />
                    </th>
                    <th className="py-2 pr-4">
                      <T k="revenue" elderly={elderly} />
                    </th>
                    <th className="py-2 pr-4">
                      <T k="profit" elderly={elderly} />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {topProductsRaw.map((row) => {
                    const product = row.productId ? productById.get(row.productId) : undefined;
                    const soldQuantity = row._sum.soldQuantity ?? 0;
                    const revenueCents = row._sum.netSoldAmountCents ?? 0;
                    const profitCents =
                      product?.costCents != null ? revenueCents - product.costCents * soldQuantity : null;
                    return (
                      <tr key={row.productId} className="border-b">
                        <td className="py-2 pr-4">{product?.name ?? "Unknown"}</td>
                        <td className="py-2 pr-4 tabular-nums">{row._sum.deliveredQuantity ?? 0}</td>
                        <td className="py-2 pr-4 tabular-nums">{soldQuantity}</td>
                        <td className="py-2 pr-4 tabular-nums">{row.qtyUnsold}</td>
                        <td className="py-2 pr-4 tabular-nums">{formatPercent(row.percentSold)}</td>
                        <td className="py-2 pr-4 tabular-nums">{formatCents(revenueCents)}</td>
                        <td className="py-2 pr-4 tabular-nums">
                          {profitCents !== null ? (
                            formatCents(profitCents)
                          ) : (
                            <Link href="/products" className="text-xs text-gray-400 underline">
                              set cost
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
