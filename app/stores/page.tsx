import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { formatCents } from "@/lib/money";
import { NavBar } from "@/components/NavBar";

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
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="py-2 pr-4">Store</th>
              <th className="py-2 pr-4">Store #</th>
              <th className="py-2 pr-4">Invoices</th>
              <th className="py-2 pr-4">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {stores.map((store) => {
              const agg = aggregateByStoreId.get(store.id);
              return (
                <tr key={store.id} className="border-b hover:bg-gray-50">
                  <td className="py-2 pr-4">
                    <Link href={`/stores/${store.id}`} className="text-blue-600 underline">
                      {store.name}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{store.storeNumber}</td>
                  <td className="py-2 pr-4 tabular-nums">{agg?._count ?? 0}</td>
                  <td className="py-2 pr-4 tabular-nums">
                    {formatCents(agg?._sum.calculatedAmountDueCents ?? 0)}
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
