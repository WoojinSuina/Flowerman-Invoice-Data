import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { formatCents } from "@/lib/money";
import { StatusBadge } from "@/components/review/StatusBadge";
import { NavBar } from "@/components/NavBar";
import { formatInvoiceDate } from "@/lib/dates";
import { isConsignmentStore } from "@/lib/stores";
import { StoreTypeBadge } from "@/components/stores/StoreTypeBadge";

export default async function StoreDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const store = await prisma.store.findUnique({ where: { id: params.id } });
  if (!store) {
    notFound();
  }

  const invoices = await prisma.invoice.findMany({
    where: { storeId: params.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="mx-auto max-w-5xl p-6">
      <NavBar />
      <div className="mb-1 flex items-center gap-2">
        <h1 className="text-xl font-semibold">{store.name}</h1>
        <StoreTypeBadge consignment={isConsignmentStore(store)} />
      </div>
      <p className="mb-4 text-sm text-gray-500">
        Store #{store.storeNumber}
        {store.address ? ` · ${store.address}` : ""}
      </p>

      {invoices.length === 0 ? (
        <p className="text-gray-500">No invoices for this store yet.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="py-2 pr-4">Invoice #</th>
              <th className="py-2 pr-4">Date</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Difference</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => (
              <tr key={invoice.id} className="border-b hover:bg-gray-50">
                <td className="py-2 pr-4">
                  <Link href={`/review/${invoice.id}`} className="text-blue-600 underline">
                    {invoice.invoiceNumber}
                  </Link>
                </td>
                <td className="py-2 pr-4">{formatInvoiceDate(invoice.invoiceDate)}</td>
                <td className="py-2 pr-4">
                  <StatusBadge status={invoice.validationStatus} />
                </td>
                <td className="py-2 pr-4 tabular-nums">
                  {formatCents(invoice.validationDifferenceCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
