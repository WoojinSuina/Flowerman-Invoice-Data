import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { formatCents } from "@/lib/money";
import { StatusBadge } from "@/components/review/StatusBadge";
import type { ValidationStatus } from "@prisma/client";

const FILTERS: (ValidationStatus | "ALL")[] = ["REVIEW", "PASS", "APPROVED", "FAILED", "ALL"];

export default async function ReviewListPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const status = searchParams.status ?? "REVIEW";

  const invoices = await prisma.invoice.findMany({
    where: status === "ALL" ? undefined : { validationStatus: status as ValidationStatus },
    include: { store: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Invoice Review</h1>
        <Link href="/jobs" className="text-sm text-blue-600 underline">
          View batch jobs
        </Link>
      </div>

      <nav className="mb-6 flex gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={`/review?status=${f}`}
            className={`rounded px-3 py-1 text-sm ${
              status === f ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {f}
          </Link>
        ))}
      </nav>

      {invoices.length === 0 ? (
        <p className="text-gray-500">No invoices with status {status}.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="py-2 pr-4">Invoice #</th>
              <th className="py-2 pr-4">Store</th>
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
                <td className="py-2 pr-4">{invoice.store.name}</td>
                <td className="py-2 pr-4">
                  {new Date(invoice.invoiceDate).toLocaleDateString()}
                </td>
                <td className="py-2 pr-4">
                  <StatusBadge status={invoice.validationStatus} />
                </td>
                <td className="py-2 pr-4">{formatCents(invoice.validationDifferenceCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
