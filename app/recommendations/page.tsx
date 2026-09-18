import { prisma } from "@/lib/db/client";
import { NavBar } from "@/components/NavBar";

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
}

interface StoreRecommendations {
  storeId: string;
  storeName: string;
  storeAddress: string | null;
  products: ProductRecommendation[];
}

function average(entries: HistoryEntry[], pick: (e: HistoryEntry) => number): number {
  return entries.reduce((sum, e) => sum + pick(e), 0) / entries.length;
}

export default async function RecommendationsPage() {
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

  const storeIds = [...new Set([...history.values()].map((v) => v.storeId))];
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
    const recommendation: ProductRecommendation = {
      productId,
      productName: product.name,
      recommendedQty: Math.max(0, Math.round(avgSold)),
      avgDelivered: average(basis, (e) => e.delivered),
      avgReturned: average(basis, (e) => e.returned),
      basisCount: basis.length,
      basisLabel,
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
      });
    }
  }

  const storeRecommendations = [...byStore.values()]
    .map((s) => ({
      ...s,
      products: s.products.sort((a, b) => b.recommendedQty - a.recommendedQty),
    }))
    .sort((a, b) => a.storeName.localeCompare(b.storeName));

  return (
    <main className="mx-auto max-w-5xl p-6">
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
        <div className="space-y-8">
          {storeRecommendations.map((store) => (
            <div key={store.storeId}>
              <h2 className="mb-2 font-medium">
                {store.storeName}
                {store.storeAddress && (
                  <span className="ml-2 text-xs font-normal text-gray-500">
                    {store.storeAddress}
                  </span>
                )}
              </h2>
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
                  {store.products.map((p) => (
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
          ))}
        </div>
      )}
    </main>
  );
}
