import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { formatCents } from "@/lib/money";
import { NavBar } from "@/components/NavBar";
import { MergeStoreButton } from "@/components/stores/MergeStoreButton";
import { StoreTypeBadge } from "@/components/stores/StoreTypeBadge";
import { isConsignmentStore } from "@/lib/stores";

// Reads live from Prisma on every request — without this, Next prerenders
// the page as static HTML at build time and it never reflects new data.
export const dynamic = "force-dynamic";

export default async function StoresListPage() {
  const [stores, aggregates] = await Promise.all([
    prisma.store.findMany({ orderBy: { name: "asc" } }),
    prisma.invoice.groupBy({
      by: ["storeId"],
      _count: true,
      _sum: { calculatedAmountDueCents: true },
    }),
  ]);
  const aggregateByStoreId = new Map(aggregates.map((a) => [a.storeId, a]));

  return (
    <main className="mx-auto max-w-5xl p-6">
      <NavBar />
      <h1 className="mb-4 text-2xl font-semibold">Stores</h1>

      {stores.length === 0 ? (
        <p className="text-gray-500">No stores yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-2 pr-4">Store</th>
                <th className="py-2 pr-4">Store #</th>
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4">Invoices</th>
                <th className="py-2 pr-4">Revenue</th>
                <th className="py-2 pr-4">Duplicate?</th>
              </tr>
            </thead>
            <tbody>
              {stores.map((store) => {
                const agg = aggregateByStoreId.get(store.id);
                const otherStores = stores
                  .filter((s) => s.id !== store.id)
                  .map((s) => ({ id: s.id, name: s.name, address: s.address }));
                return (
                  <tr key={store.id} className="border-b hover:bg-gray-50">
                    <td className="py-2 pr-4">
                      <Link href={`/stores/${store.id}`} className="text-blue-600 underline">
                        {store.name}
                      </Link>
                      {store.address && (
                        <div className="text-xs text-gray-500">{store.address}</div>
                      )}
                    </td>
                    <td className="py-2 pr-4">{store.storeNumber}</td>
                    <td className="py-2 pr-4">
                      <StoreTypeBadge consignment={isConsignmentStore(store)} />
                    </td>
                    <td className="py-2 pr-4 tabular-nums">{agg?._count ?? 0}</td>
                    <td className="py-2 pr-4 tabular-nums">
                      {formatCents(agg?._sum.calculatedAmountDueCents ?? 0)}
                    </td>
                    <td className="py-2 pr-4">
                      <MergeStoreButton storeId={store.id} otherStores={otherStores} />
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
