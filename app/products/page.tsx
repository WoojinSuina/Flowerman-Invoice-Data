import { prisma } from "@/lib/db/client";
import { formatCents } from "@/lib/money";
import { NavBar } from "@/components/NavBar";
import { MergeProductButton } from "@/components/products/MergeProductButton";
import { ProductCostInput } from "@/components/products/ProductCostInput";

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

  return (
    <main className="mx-auto max-w-5xl p-6">
      <NavBar />
      <h1 className="mb-4 text-2xl font-semibold">Products</h1>

      {aggregates.length === 0 ? (
        <p className="text-gray-500">
          No product data yet — this fills in as invoices are processed.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-2 pr-4">Product</th>
                <th className="py-2 pr-4">Qty sold</th>
                <th className="py-2 pr-4">Revenue</th>
                <th className="py-2 pr-4">Cost/unit</th>
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
                const soldQuantity = row._sum.soldQuantity ?? 0;
                const revenueCents = row._sum.netSoldAmountCents ?? 0;
                const profitCents =
                  product?.costCents != null ? revenueCents - product.costCents * soldQuantity : null;
                return (
                  <tr key={row.productId} className="border-b">
                    <td className="py-2 pr-4">{product?.name ?? "Unknown"}</td>
                    <td className="py-2 pr-4 tabular-nums">{soldQuantity}</td>
                    <td className="py-2 pr-4 tabular-nums">{formatCents(revenueCents)}</td>
                    <td className="py-2 pr-4 tabular-nums">
                      {row.productId && (
                        <ProductCostInput productId={row.productId} costCents={product?.costCents ?? null} />
                      )}
                    </td>
                    <td className="py-2 pr-4 tabular-nums">
                      {profitCents !== null ? (
                        formatCents(profitCents)
                      ) : (
                        <span className="text-gray-400">set cost</span>
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
        </div>
      )}
    </main>
  );
}
