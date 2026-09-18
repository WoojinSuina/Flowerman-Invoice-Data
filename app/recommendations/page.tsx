import { prisma } from "@/lib/db/client";
import { NavBar } from "@/components/NavBar";

export const dynamic = "force-dynamic";

interface ProductRecommendation {
  productId: string;
  productName: string;
  invoiceCount: number;
  avgDelivered: number;
  avgReturned: number;
  avgSold: number;
  recommendedQty: number;
}

interface StoreRecommendations {
  storeId: string;
  storeName: string;
  storeAddress: string | null;
  products: ProductRecommendation[];
}

export default async function RecommendationsPage() {
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
      invoice: { select: { storeId: true } },
    },
  });

  const agg = new Map<
    string,
    { storeId: string; productId: string; delivered: number; returned: number; sold: number; count: number }
  >();
  for (const item of items) {
    const key = `${item.invoice.storeId}|${item.productId}`;
    const existing = agg.get(key);
    if (existing) {
      existing.delivered += item.deliveredQuantity;
      existing.returned += item.returnedQuantity;
      existing.sold += item.soldQuantity;
      existing.count += 1;
    } else {
      agg.set(key, {
        storeId: item.invoice.storeId,
        productId: item.productId as string,
        delivered: item.deliveredQuantity,
        returned: item.returnedQuantity,
        sold: item.soldQuantity,
        count: 1,
      });
    }
  }

  const storeIds = [...new Set([...agg.values()].map((v) => v.storeId))];
  const productIds = [...new Set([...agg.values()].map((v) => v.productId))];

  const [stores, products] = await Promise.all([
    prisma.store.findMany({ where: { id: { in: storeIds } } }),
    prisma.product.findMany({ where: { id: { in: productIds } } }),
  ]);
  const storeById = new Map(stores.map((s) => [s.id, s]));
  const productById = new Map(products.map((p) => [p.id, p]));

  const byStore = new Map<string, StoreRecommendations>();
  for (const entry of agg.values()) {
    const store = storeById.get(entry.storeId);
    const product = productById.get(entry.productId);
    if (!store || !product) continue;

    const avgSold = entry.sold / entry.count;
    const recommendation: ProductRecommendation = {
      productId: entry.productId,
      productName: product.name,
      invoiceCount: entry.count,
      avgDelivered: entry.delivered / entry.count,
      avgReturned: entry.returned / entry.count,
      avgSold,
      recommendedQty: Math.max(0, Math.round(avgSold)),
    };

    const existing = byStore.get(entry.storeId);
    if (existing) {
      existing.products.push(recommendation);
    } else {
      byStore.set(entry.storeId, {
        storeId: entry.storeId,
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
        Suggested quantity is the average sold quantity per invoice, rounded to
        the nearest whole unit, across every passed or approved invoice recorded
        for that store and product (invoices still needing review are excluded).
        Delivered and returned averages are shown alongside so you can see the
        history behind each number.
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
                      <td className="py-2 pr-4 tabular-nums text-gray-500">
                        {p.invoiceCount} invoice{p.invoiceCount === 1 ? "" : "s"}
                      </td>
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
