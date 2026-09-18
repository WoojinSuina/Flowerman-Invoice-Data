import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { formatCents } from "@/lib/money";
import { NavBar } from "@/components/NavBar";

// Reads live from Prisma on every request — without this, Next prerenders
// the page as static HTML at build time and it never reflects new data.
export const dynamic = "force-dynamic";

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

export default async function DashboardPage() {
  const [totalInvoices, revenue, reviewCount, approvedCount, allItems] = await Promise.all([
    prisma.invoice.count(),
    prisma.invoice.aggregate({ _sum: { calculatedAmountDueCents: true } }),
    prisma.invoice.count({ where: { validationStatus: "REVIEW" } }),
    prisma.invoice.count({ where: { validationStatus: "APPROVED" } }),
    prisma.invoiceItem.findMany({
      select: { productId: true, soldQuantity: true, retailPriceCents: true, unitCostCents: true },
    }),
  ]);

  // Profit = the store's retail markup (what they sell for minus what they
  // pay the vendor) on units actually sold. There's no field for the
  // vendor's own wholesale cost, so this is the only profit the data
  // supports — not a Prisma-aggregatable sum, since it's a per-row
  // computation, so it's reduced here instead.
  const profitCentsByProductId = new Map<string, number>();
  let totalProfitCents = 0;
  for (const item of allItems) {
    const profit = item.soldQuantity * (item.retailPriceCents - item.unitCostCents);
    totalProfitCents += profit;
    if (item.productId) {
      profitCentsByProductId.set(
        item.productId,
        (profitCentsByProductId.get(item.productId) ?? 0) + profit
      );
    }
  }

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

  return (
    <main className="mx-auto max-w-5xl p-6">
      <NavBar />
      <h1 className="mb-4 text-2xl font-semibold">Dashboard</h1>

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-5">
        <StatTile label="Total invoices" value={totalInvoices.toLocaleString()} />
        <StatTile
          label="Total revenue"
          value={formatCents(revenue._sum.calculatedAmountDueCents ?? 0)}
        />
        <StatTile label="Total profit" value={formatCents(totalProfitCents)} />
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
                  <th className="py-2 pr-4">Profit</th>
                </tr>
              </thead>
              <tbody>
                {topProductsRaw.map((row) => {
                  const product = row.productId ? productById.get(row.productId) : undefined;
                  const profitCents = row.productId
                    ? (profitCentsByProductId.get(row.productId) ?? 0)
                    : 0;
                  return (
                    <tr key={row.productId} className="border-b">
                      <td className="py-2 pr-4">{product?.name ?? "Unknown"}</td>
                      <td className="py-2 pr-4 tabular-nums">{row._sum.soldQuantity ?? 0}</td>
                      <td className="py-2 pr-4 tabular-nums">
                        {formatCents(row._sum.netSoldAmountCents ?? 0)}
                      </td>
                      <td className="py-2 pr-4 tabular-nums">{formatCents(profitCents)}</td>
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
