import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { NavBar } from "@/components/NavBar";
import { InvoiceGallery } from "@/components/recommendations/InvoiceGallery";
import {
  ProductComparisonChart,
  DELIVERED_COLOR,
  SOLD_COLOR,
  type ComparisonPoint,
} from "@/components/recommendations/ProductTrendChart";
import { formatInvoiceDate } from "@/lib/dates";

export const dynamic = "force-dynamic";

const RECENT_WINDOW = 3;

interface HistoryEntry {
  invoiceDate: Date;
  delivered: number;
  returned: number;
  sold: number;
}

interface ProductRecommendation {
  productId: string;
  productName: string;
  recommendedQty: number;
  avgDelivered: number;
  avgReturned: number;
  basisCount: number;
  basisLabel: string;
  /** Delivered vs. sold across the store's FULL invoice history for this
   * product, oldest first — the averaging basis above only uses a
   * window of it, but the comparison chart shows the recent shape. */
  history: ComparisonPoint[];
}

interface StoreRecommendations {
  storeId: string;
  storeName: string;
  storeAddress: string | null;
  products: ProductRecommendation[];
  reviewCount: number;
}

function average(entries: HistoryEntry[], pick: (e: HistoryEntry) => number): number {
  return entries.reduce((sum, e) => sum + pick(e), 0) / entries.length;
}

// For a given invoice date, finds this store+product's entries from the
// same calendar month exactly one year earlier, so the comparison chart
// can show this year's delivery next to last year's for the same month —
// no matches yet for most stores (not enough history), but the chart
// picks this up automatically once a second year of data exists.
function findPriorYearMatch(
  entries: HistoryEntry[],
  target: Date
): { delivered: number; sold: number } | undefined {
  const matches = entries.filter(
    (e) =>
      e.invoiceDate.getUTCMonth() === target.getUTCMonth() &&
      e.invoiceDate.getUTCFullYear() === target.getUTCFullYear() - 1
  );
  if (matches.length === 0) return undefined;
  return { delivered: average(matches, (e) => e.delivered), sold: average(matches, (e) => e.sold) };
}

export default async function RecommendationsPage(props: {
  searchParams: Promise<{ store?: string }>;
}) {
  const searchParams = await props.searchParams;
  const now = new Date();
  const currentMonth = now.getUTCMonth();
  const currentYear = now.getUTCFullYear();
  const currentMonthLabel = now.toLocaleDateString(undefined, { month: "long", timeZone: "UTC" });

  const items = await prisma.invoiceItem.findMany({
    where: {
      productId: { not: null },
      invoice: { validationStatus: { in: ["PASS", "APPROVED"] } },
    },
    select: {
      productId: true,
      deliveredQuantity: true,
      returnedQuantity: true,
      soldQuantity: true,
      invoice: { select: { storeId: true, invoiceDate: true } },
    },
  });

  const history = new Map<string, { storeId: string; productId: string; entries: HistoryEntry[] }>();
  for (const item of items) {
    const key = `${item.invoice.storeId}|${item.productId}`;
    const entry: HistoryEntry = {
      invoiceDate: item.invoice.invoiceDate,
      delivered: item.deliveredQuantity,
      returned: item.returnedQuantity,
      sold: item.soldQuantity,
    };
    const existing = history.get(key);
    if (existing) {
      existing.entries.push(entry);
    } else {
      history.set(key, {
        storeId: item.invoice.storeId,
        productId: item.productId as string,
        entries: [entry],
      });
    }
  }

  const reviewCountsRaw = await prisma.invoice.groupBy({
    by: ["storeId"],
    where: { validationStatus: "REVIEW" },
    _count: true,
  });
  const reviewCountByStore = new Map(reviewCountsRaw.map((r) => [r.storeId, r._count]));

  const storeIds = [
    ...new Set([
      ...[...history.values()].map((v) => v.storeId),
      ...reviewCountsRaw.map((r) => r.storeId),
    ]),
  ];
  const productIds = [...new Set([...history.values()].map((v) => v.productId))];

  const [stores, products] = await Promise.all([
    prisma.store.findMany({ where: { id: { in: storeIds } } }),
    prisma.product.findMany({ where: { id: { in: productIds } } }),
  ]);
  const storeById = new Map(stores.map((s) => [s.id, s]));
  const productById = new Map(products.map((p) => [p.id, p]));

  const byStore = new Map<string, StoreRecommendations>();
  for (const { storeId, productId, entries } of history.values()) {
    const store = storeById.get(storeId);
    const product = productById.get(productId);
    if (!store || !product) continue;

    const sorted = [...entries].sort((a, b) => b.invoiceDate.getTime() - a.invoiceDate.getTime());

    const sameMonthPriorYears = sorted.filter(
      (e) =>
        e.invoiceDate.getUTCMonth() === currentMonth &&
        e.invoiceDate.getUTCFullYear() < currentYear
    );

    let basis: HistoryEntry[];
    let basisLabel: string;
    if (sameMonthPriorYears.length > 0) {
      basis = sameMonthPriorYears;
      const years = [...new Set(basis.map((e) => e.invoiceDate.getUTCFullYear()))].sort();
      basisLabel = `${currentMonthLabel} (${years.join(", ")})`;
    } else {
      basis = sorted.slice(0, RECENT_WINDOW);
      basisLabel = `last ${basis.length} invoice${basis.length === 1 ? "" : "s"}`;
    }

    const avgSold = average(basis, (e) => e.sold);
    const history: ComparisonPoint[] = [...entries]
      .sort((a, b) => a.invoiceDate.getTime() - b.invoiceDate.getTime())
      .map((e) => ({
        dateLabel: formatInvoiceDate(e.invoiceDate),
        delivered: e.delivered,
        sold: e.sold,
        priorYear: findPriorYearMatch(entries, e.invoiceDate),
      }));
    const recommendation: ProductRecommendation = {
      productId,
      productName: product.name,
      recommendedQty: Math.max(0, Math.round(avgSold)),
      avgDelivered: average(basis, (e) => e.delivered),
      avgReturned: average(basis, (e) => e.returned),
      basisCount: basis.length,
      basisLabel,
      history,
    };

    const existing = byStore.get(storeId);
    if (existing) {
      existing.products.push(recommendation);
    } else {
      byStore.set(storeId, {
        storeId,
        storeName: store.name,
        storeAddress: store.address,
        products: [recommendation],
        reviewCount: reviewCountByStore.get(storeId) ?? 0,
      });
    }
  }

  // Stores whose only invoices are still in REVIEW have no PASS/APPROVED
  // history to base a recommendation on, so they'd otherwise be invisible
  // on this page even though they need attention.
  for (const [storeId, count] of reviewCountByStore) {
    if (byStore.has(storeId)) continue;
    const store = storeById.get(storeId);
    if (!store) continue;
    byStore.set(storeId, {
      storeId,
      storeName: store.name,
      storeAddress: store.address,
      products: [],
      reviewCount: count,
    });
  }

  const storeRecommendations = [...byStore.values()]
    .map((s) => ({
      ...s,
      products: s.products.sort((a, b) => b.recommendedQty - a.recommendedQty),
    }))
    .sort((a, b) => a.storeName.localeCompare(b.storeName));

  const selectedStoreId =
    searchParams.store && storeRecommendations.some((s) => s.storeId === searchParams.store)
      ? searchParams.store
      : storeRecommendations[0]?.storeId;
  const selectedStore = storeRecommendations.find((s) => s.storeId === selectedStoreId);

  const selectedStoreInvoices = selectedStoreId
    ? await prisma.invoice.findMany({
        where: { storeId: selectedStoreId },
        orderBy: { invoiceDate: "desc" },
        select: {
          id: true,
          invoiceNumber: true,
          invoiceDate: true,
          validationStatus: true,
          sourceImageUrl: true,
        },
      })
    : [];

  return (
    <main className="mx-auto max-w-6xl p-6">
      <NavBar />
      <h1 className="mb-2 text-2xl font-semibold">Delivery Recommendations</h1>
      <p className="mb-6 text-sm text-gray-500">
        Suggested quantity is an average sold quantity, rounded to the nearest
        whole unit, using only passed or approved invoices (invoices still
        needing review are excluded). If a store and product has history from{" "}
        {currentMonthLabel} in a prior year, that seasonal history is used;
        otherwise it falls back to the last {RECENT_WINDOW} invoices so the
        number tracks recent demand. The &quot;Based on&quot; column shows
        which one was used.
      </p>

      {storeRecommendations.length === 0 ? (
        <p className="text-sm text-gray-500">No data yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[16rem_1fr]">
          <nav className="order-2 md:order-none md:h-[calc(100vh-14rem)] md:overflow-auto md:border-r md:pr-4">
            <ul className="space-y-1">
              {storeRecommendations.map((store) => (
                <li key={store.storeId}>
                  <Link
                    href={`/recommendations?store=${store.storeId}`}
                    className={
                      store.storeId === selectedStoreId
                        ? "block rounded bg-gray-900 px-2 py-1 text-sm text-white"
                        : "block rounded px-2 py-1 text-sm text-blue-600 hover:bg-gray-50"
                    }
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span>{store.storeName}</span>
                      {store.reviewCount > 0 && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                          {store.reviewCount} need review
                        </span>
                      )}
                    </div>
                    {store.storeAddress && (
                      <div
                        className={
                          store.storeId === selectedStoreId
                            ? "text-xs text-gray-300"
                            : "text-xs text-gray-500"
                        }
                      >
                        {store.storeAddress}
                      </div>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {selectedStore && (
            <div className="order-1 md:order-none">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-medium">
                  {selectedStore.storeName}
                  {selectedStore.storeAddress && (
                    <span className="ml-2 text-xs font-normal text-gray-500">
                      {selectedStore.storeAddress}
                    </span>
                  )}
                </h2>
                {selectedStore.reviewCount > 0 && (
                  <Link
                    href={`/stores/${selectedStore.storeId}`}
                    className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-200"
                  >
                    {selectedStore.reviewCount} invoice
                    {selectedStore.reviewCount === 1 ? "" : "s"} need review
                  </Link>
                )}
              </div>

              {selectedStore.products.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No approved history yet for this store — its only invoice
                  {selectedStore.reviewCount === 1 ? " is" : "s are"} still awaiting
                  review, so there&apos;s nothing to base a recommendation on.
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b text-left text-gray-500">
                          <th className="py-2 pr-4">Product</th>
                          <th className="py-2 pr-4">Suggested qty</th>
                          <th className="py-2 pr-4">Avg delivered</th>
                          <th className="py-2 pr-4">Avg returned</th>
                          <th className="py-2 pr-4">Based on</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedStore.products.map((p) => (
                          <tr key={p.productId} className="border-b">
                            <td className="py-2 pr-4">{p.productName}</td>
                            <td className="py-2 pr-4 tabular-nums font-semibold">
                              {p.recommendedQty}
                            </td>
                            <td className="py-2 pr-4 tabular-nums text-gray-500">
                              {p.avgDelivered.toFixed(1)}
                            </td>
                            <td className="py-2 pr-4 tabular-nums text-gray-500">
                              {p.avgReturned.toFixed(1)}
                            </td>
                            <td className="py-2 pr-4 tabular-nums text-gray-500">{p.basisLabel}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <h2 className="mb-2 mt-8 font-medium">
                    Recent invoices: delivered vs sold
                  </h2>
                  <div className="mb-4 flex items-center gap-4 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-sm"
                        style={{ backgroundColor: DELIVERED_COLOR }}
                      />
                      Delivered
                    </span>
                    <span className="flex items-center gap-1">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-sm"
                        style={{ backgroundColor: SOLD_COLOR }}
                      />
                      Sold
                    </span>
                  </div>
                  <div className="space-y-6">
                    {selectedStore.products.map((p) => (
                      <div key={p.productId} className="overflow-x-auto">
                        <p className="mb-2 text-sm font-medium">{p.productName}</p>
                        <ProductComparisonChart points={p.history} />
                      </div>
                    ))}
                  </div>
                </>
              )}

              <h2 className="mb-2 mt-8 font-medium">
                Scanned invoices{" "}
                <span className="text-sm font-normal text-gray-400">
                  ({selectedStoreInvoices.length})
                </span>
              </h2>
              <InvoiceGallery
                invoices={selectedStoreInvoices.map((invoice) => ({
                  id: invoice.id,
                  invoiceNumber: invoice.invoiceNumber,
                  invoiceDateLabel: formatInvoiceDate(invoice.invoiceDate),
                  validationStatus: invoice.validationStatus,
                  sourceImageUrl: invoice.sourceImageUrl,
                }))}
              />
            </div>
          )}
        </div>
      )}
    </main>
  );
}
