import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { formatCents } from "@/lib/money";
import { formatInvoiceDate } from "@/lib/dates";
import { StatusBadge } from "@/components/review/StatusBadge";
import { PdfPageImage } from "@/components/review/PdfPageImage";
import { RetryFailedPageButton } from "@/components/jobs/RetryFailedPageButton";
import { QueueKeepAlive } from "@/components/jobs/QueueKeepAlive";

function ScannedImage({ url, alt }: { url: string; alt: string }) {
  return url.endsWith(".pdf") ? (
    <div className="w-48">
      <PdfPageImage src={url} alt={alt} />
    </div>
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={alt} className="w-48 rounded border object-contain" />
  );
}

function FailedPageImage({
  url,
  page,
  existing,
}: {
  url: string | null;
  page: number | null;
  existing: { id: string; invoiceNumber: string; sourceImageUrl: string | null } | null;
}) {
  if (!url) {
    return <span className="text-xs text-gray-400">No image available</span>;
  }
  return (
    <div className="flex gap-3">
      <div>
        <p className="mb-1 text-xs text-gray-500">This scan</p>
        <ScannedImage url={url} alt={`Scanned page ${page ?? "?"}`} />
      </div>
      {existing && (
        <div>
          <p className="mb-1 text-xs text-gray-500">
            Already on file:{" "}
            <Link href={`/review/${existing.id}`} className="text-blue-600 underline">
              #{existing.invoiceNumber}
            </Link>
          </p>
          {existing.sourceImageUrl ? (
            <ScannedImage
              url={existing.sourceImageUrl}
              alt={`Existing invoice ${existing.invoiceNumber}`}
            />
          ) : (
            <span className="text-xs text-gray-400">No image available</span>
          )}
        </div>
      )}
    </div>
  );
}

export default async function JobDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const job = await prisma.processingJob.findUnique({
    where: { id: params.id },
    include: {
      // Most recently changed first, so approving/correcting an invoice
      // from this job brings it back to the top instead of leaving it
      // buried in original page order.
      invoices: { include: { store: true }, orderBy: { updatedAt: "desc" } },
      extractionAttempts: { where: { succeeded: false }, orderBy: { sourcePage: "asc" } },
    },
  });

  if (!job) {
    notFound();
  }

  const duplicateOfIds = [
    ...new Set(
      job.extractionAttempts
        .map((a) => a.duplicateOfInvoiceId)
        .filter((id): id is string => id !== null)
    ),
  ];
  const duplicateOfInvoices = await prisma.invoice.findMany({
    where: { id: { in: duplicateOfIds } },
    select: { id: true, invoiceNumber: true, sourceImageUrl: true },
  });
  const duplicateOfById = new Map(duplicateOfInvoices.map((inv) => [inv.id, inv]));

  const grandTotalCents = job.invoices.reduce((sum, inv) => sum + inv.totalAmountDueCents, 0);

  return (
    <main className="mx-auto max-w-5xl p-6">
      <QueueKeepAlive active={job.status === "PROCESSING"} />
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
              <th className="py-2 pr-4">Date</th>
              <th className="py-2 pr-4">Store</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Total Due</th>
              <th className="py-2 pr-4">Difference</th>
            </tr>
          </thead>
          <tbody>
            {job.invoices.map((invoice) => {
              const hasDifference = invoice.validationDifferenceCents !== 0;
              return (
                <tr
                  key={invoice.id}
                  className={
                    hasDifference ? "border-b bg-red-50 hover:bg-red-100" : "border-b hover:bg-gray-50"
                  }
                >
                  <td className="py-2 pr-4">{invoice.sourcePage}</td>
                  <td className="py-2 pr-4">
                    <Link href={`/review/${invoice.id}`} className="text-blue-600 underline">
                      {invoice.invoiceNumber}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{formatInvoiceDate(invoice.invoiceDate)}</td>
                  <td className="py-2 pr-4">{invoice.store.name}</td>
                  <td className="py-2 pr-4">
                    <StatusBadge status={invoice.validationStatus} />
                  </td>
                  <td className="py-2 pr-4 font-medium">{formatCents(invoice.totalAmountDueCents)}</td>
                  <td className={hasDifference ? "py-2 pr-4 font-semibold text-red-700" : "py-2 pr-4"}>
                    {formatCents(invoice.validationDifferenceCents)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 font-medium">
              <td className="py-2 pr-4" colSpan={5}>
                Grand total ({job.invoices.length} invoice{job.invoices.length === 1 ? "" : "s"})
              </td>
              <td className="py-2 pr-4">{formatCents(grandTotalCents)}</td>
              <td className="py-2 pr-4"></td>
            </tr>
          </tfoot>
        </table>
      )}

      {job.extractionAttempts.length > 0 && (
        <>
          <h2 className="mb-2 mt-6 font-medium">Failed pages</h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-2 pr-4">Page</th>
                <th className="py-2 pr-4">Scanned image</th>
                <th className="py-2 pr-4">Error</th>
                <th className="py-2 pr-4">Action</th>
              </tr>
            </thead>
            <tbody>
              {job.extractionAttempts.map((attempt) => (
                <tr key={attempt.id} className="border-b">
                  <td className="py-2 pr-4">{attempt.sourcePage}</td>
                  <td className="py-2 pr-4">
                    <FailedPageImage
                      url={attempt.sourceImageUrl}
                      page={attempt.sourcePage}
                      existing={
                        attempt.duplicateOfInvoiceId
                          ? (duplicateOfById.get(attempt.duplicateOfInvoiceId) ?? null)
                          : null
                      }
                    />
                  </td>
                  <td className="py-2 pr-4 text-red-700">{attempt.errorMessage}</td>
                  <td className="py-2 pr-4">
                    {attempt.sourceImageUrl && (
                      <RetryFailedPageButton
                        url={attempt.sourceImageUrl}
                        page={attempt.sourcePage}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}
