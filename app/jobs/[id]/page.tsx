import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { formatCents } from "@/lib/money";
import { StatusBadge } from "@/components/review/StatusBadge";

export default async function JobDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const job = await prisma.processingJob.findUnique({
    where: { id: params.id },
    include: {
      invoices: { include: { store: true }, orderBy: { sourcePage: "asc" } },
      extractionAttempts: { where: { succeeded: false }, orderBy: { sourcePage: "asc" } },
    },
  });

  if (!job) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{job.filename}</h1>
          <p className="text-sm text-gray-500">
            <StatusBadge status={job.status} /> · {job.processedPages}/{job.totalPages} pages
            processed
          </p>
        </div>
        <Link href="/jobs" className="text-sm text-blue-600 underline">
          Back to jobs
        </Link>
      </div>

      <h2 className="mb-2 mt-6 font-medium">Invoices produced</h2>
      {job.invoices.length === 0 ? (
        <p className="text-gray-500">No invoices produced.</p>
      ) : (
        <table className="mb-6 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="py-2 pr-4">Page</th>
              <th className="py-2 pr-4">Invoice #</th>
              <th className="py-2 pr-4">Store</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Difference</th>
            </tr>
          </thead>
          <tbody>
            {job.invoices.map((invoice) => (
              <tr key={invoice.id} className="border-b hover:bg-gray-50">
                <td className="py-2 pr-4">{invoice.sourcePage}</td>
                <td className="py-2 pr-4">
                  <Link href={`/review/${invoice.id}`} className="text-blue-600 underline">
                    {invoice.invoiceNumber}
                  </Link>
                </td>
                <td className="py-2 pr-4">{invoice.store.name}</td>
                <td className="py-2 pr-4">
                  <StatusBadge status={invoice.validationStatus} />
                </td>
                <td className="py-2 pr-4">{formatCents(invoice.validationDifferenceCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {job.extractionAttempts.length > 0 && (
        <>
          <h2 className="mb-2 mt-6 font-medium">Failed pages</h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-2 pr-4">Page</th>
                <th className="py-2 pr-4">Error</th>
              </tr>
            </thead>
            <tbody>
              {job.extractionAttempts.map((attempt) => (
                <tr key={attempt.id} className="border-b">
                  <td className="py-2 pr-4">{attempt.sourcePage}</td>
                  <td className="py-2 pr-4 text-red-700">{attempt.errorMessage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}
