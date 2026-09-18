import { prisma } from "@/lib/db/client";
import { formatCents } from "@/lib/money";
import { NavBar } from "@/components/NavBar";
import { MergeProductButton } from "@/components/products/MergeProductButton";

// Reads live from Prisma on every request — without this, Next prerenders
// the page as static HTML at build time and it never reflects new data.
export const dynamic = "force-dynamic";

export default async function ProductsListPage() {
  const aggregates = await prisma.invoiceItem.groupBy({
    by: ["productId"],
    where: { productId: { not: null } },
    _sum: {
      netSoldAmountCents: true,
      soldQuantity: true,
      deliveredQuantity: true,
      returnedQuantity: true,
    },
    _avg: { confidence: true },
    _count: true,
    orderBy: { _sum: { netSoldAmountCents: "desc" } },
  });

  const products = await prisma.product.findMany({
    where: { id: { in: aggregates.map((a) => a.productId as string) } },
  });
  const productById = new Map(products.map((p) => [p.id, p]));

  // Profit = retail markup (retail price minus vendor cost) on units sold —
  // a per-row computation, not something groupBy's _sum can express.
  const items = await prisma.invoiceItem.findMany({
    where: { productId: { not: null } },
    select: { productId: true, soldQuantity: true, retailPriceCents: true, unitCostCents: true },
  });
  const profitCentsByProductId = new Map<string, number>();
  for (const item of items) {
    const profit = item.soldQuantity * (item.retailPriceCents - item.unitCostCents);
    profitCentsByProductId.set(
      item.productId as string,
      (profitCentsByProductId.get(item.productId as string) ?? 0) + profit
    );
  }

  return (
    <main className="mx-auto max-w-5xl p-6">
      <NavBar />
      <h1 className="mb-4 text-2xl font-semibold">Products</h1>

      {aggregates.length === 0 ? (
        <p className="text-gray-500">
          No product data yet — this fills in as invoices are processed.
        </p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="py-2 pr-4">Product</th>
              <th className="py-2 pr-4">Qty sold</th>
              <th className="py-2 pr-4">Revenue</th>
              <th className="py-2 pr-4">Profit</th>
              <th className="py-2 pr-4">Times seen</th>
              <th className="py-2 pr-4">Avg. confidence</th>
              <th className="py-2 pr-4">Duplicate?</th>
            </tr>
          </thead>
          <tbody>
            {aggregates.map((row) => {
              const product = row.productId ? productById.get(row.productId) : undefined;
              const avgConfidence = row._avg.confidence;
              const otherProducts = products
                .filter((p) => p.id !== row.productId)
                .map((p) => ({ id: p.id, name: p.name }));
              return (
                <tr key={row.productId} className="border-b">
                  <td className="py-2 pr-4">{product?.name ?? "Unknown"}</td>
                  <td className="py-2 pr-4 tabular-nums">{row._sum.soldQuantity ?? 0}</td>
                  <td className="py-2 pr-4 tabular-nums">
                    {formatCents(row._sum.netSoldAmountCents ?? 0)}
                  </td>
                  <td className="py-2 pr-4 tabular-nums">
                    {formatCents(
                      row.productId ? (profitCentsByProductId.get(row.productId) ?? 0) : 0
                    )}
                  </td>
                  <td className="py-2 pr-4 tabular-nums">{row._count}</td>
                  <td className="py-2 pr-4 tabular-nums">
                    {avgConfidence !== null ? `${Math.round(avgConfidence * 100)}%` : "—"}
                  </td>
                  <td className="py-2 pr-4">
                    {row.productId && (
                      <MergeProductButton productId={row.productId} otherProducts={otherProducts} />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}
