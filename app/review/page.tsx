import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { formatCents } from "@/lib/money";
import { StatusBadge } from "@/components/review/StatusBadge";
import { NavBar } from "@/components/NavBar";
import type { ValidationStatus } from "@prisma/client";

const FILTERS: (ValidationStatus | "ALL")[] = ["REVIEW", "PASS", "APPROVED", "FAILED", "ALL"];
const PAGE_SIZE = 25;

export default async function ReviewListPage(
  props: {
    searchParams: Promise<{ status?: string; page?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const status = searchParams.status ?? "REVIEW";
  const page = Math.max(1, Number(searchParams.page) || 1);

  const where = status === "ALL" ? undefined : { validationStatus: status as ValidationStatus };

  const [invoices, totalCount] = await Promise.all([
    prisma.invoice.findMany({
      where,
      include: { store: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.invoice.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <main className="mx-auto max-w-5xl p-6">
      <NavBar />
      <h1 className="mb-4 text-2xl font-semibold">Invoice Review</h1>

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
                <td className="py-2 pr-4">
                  {invoice.store.name}
                  {invoice.store.address && (
                    <div className="text-xs text-gray-500">{invoice.store.address}</div>
                  )}
                </td>
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

      {totalCount > 0 && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
          <span>
            Page {page} of {totalPages} ({totalCount} invoice{totalCount === 1 ? "" : "s"})
          </span>
          <div className="flex gap-2">
            <Link
              href={`/review?status=${status}&page=${page - 1}`}
              aria-disabled={page <= 1}
              className={`rounded px-3 py-1 ${
                page <= 1
                  ? "pointer-events-none bg-gray-100 text-gray-300"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Previous
            </Link>
            <Link
              href={`/review?status=${status}&page=${page + 1}`}
              aria-disabled={page >= totalPages}
              className={`rounded px-3 py-1 ${
                page >= totalPages
                  ? "pointer-events-none bg-gray-100 text-gray-300"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Next
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
