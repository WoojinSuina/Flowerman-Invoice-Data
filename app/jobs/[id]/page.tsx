import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { formatCents } from "@/lib/money";
import { formatInvoiceDate } from "@/lib/dates";
import { StatusBadge } from "@/components/review/StatusBadge";
import { PdfPageImage } from "@/components/review/PdfPageImage";
import { RetryFailedPageButton } from "@/components/jobs/RetryFailedPageButton";
import { QueueKeepAlive } from "@/components/jobs/QueueKeepAlive";
import { NavBar } from "@/components/NavBar";
import { T } from "@/components/T";
import { isElderlyMode } from "@/lib/elderlyMode";

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
  const [job, elderly] = await Promise.all([
    prisma.processingJob.findUnique({
      where: { id: params.id },
      include: {
        // Most recently changed first, so approving/correcting an invoice
        // from this job brings it back to the top instead of leaving it
        // buried in original page order.
        invoices: { include: { store: true }, orderBy: { updatedAt: "desc" } },
        extractionAttempts: { where: { succeeded: false }, orderBy: { sourcePage: "asc" } },
      },
    }),
    isElderlyMode(),
  ]);

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
  const grandDifferenceCents = job.invoices.reduce(
    (sum, inv) => sum + inv.validationDifferenceCents,
    0
  );

  return (
    <main className="mx-auto max-w-5xl p-6">
      <QueueKeepAlive active={job.status === "PROCESSING"} />
      <NavBar />
      <div className="mb-6 flex items-center justify-between rounded-lg border bg-white p-5 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{job.filename}</h1>
          <p className="text-sm text-gray-500">
            <StatusBadge status={job.status} /> · {job.processedPages}/{job.totalPages}{" "}
            <T k="pagesProcessed" elderly={elderly} />
          </p>
        </div>
        <Link href="/jobs" className="text-sm text-blue-600 underline">
          <T k="backToJobs" elderly={elderly} />
        </Link>
      </div>

      <section className="rounded-lg border bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          <T k="invoicesProduced" elderly={elderly} />
        </h2>
        {job.invoices.length === 0 ? (
          <p className="text-gray-500">
            <T k="noInvoicesProduced" elderly={elderly} />
          </p>
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-2 pr-4">
                  <T k="page" elderly={elderly} />
                </th>
                <th className="py-2 pr-4">
                  <T k="invoiceNumber" elderly={elderly} />
                </th>
                <th className="py-2 pr-4">
                  <T k="date" elderly={elderly} />
                </th>
                <th className="py-2 pr-4">
                  <T k="store" elderly={elderly} />
                </th>
                <th className="py-2 pr-4">
                  <T k="status" elderly={elderly} />
                </th>
                <th className="py-2 pr-4">
                  <T k="totalDue" elderly={elderly} />
                </th>
                <th className="py-2 pr-4">
                  <T k="difference" elderly={elderly} />
                </th>
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
                  <T k="grandTotal" elderly={elderly} /> ({job.invoices.length}{" "}
                  {elderly ? <T k="invoice" elderly={elderly} /> : `invoice${job.invoices.length === 1 ? "" : "s"}`})
                </td>
                <td className="py-2 pr-4">{formatCents(grandTotalCents)}</td>
                <td className={grandDifferenceCents !== 0 ? "py-2 pr-4 text-red-700" : "py-2 pr-4"}>
                  {formatCents(grandDifferenceCents)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        )}
      </section>

      {job.extractionAttempts.length > 0 && (
        <section className="mt-6 rounded-lg border bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            <T k="failedPages" elderly={elderly} />
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2 pr-4">
                    <T k="page" elderly={elderly} />
                  </th>
                  <th className="py-2 pr-4">
                    <T k="scannedImage" elderly={elderly} />
                  </th>
                  <th className="py-2 pr-4">
                    <T k="error" elderly={elderly} />
                  </th>
                  <th className="py-2 pr-4">
                    <T k="action" elderly={elderly} />
                  </th>
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
          </div>
        </section>
      )}
    </main>
  );
}
