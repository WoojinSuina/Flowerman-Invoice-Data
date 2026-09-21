import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { formatCents } from "@/lib/money";
import { StatusBadge } from "@/components/review/StatusBadge";
import { NavBar } from "@/components/NavBar";
import { ReviewFilters } from "@/components/review/ReviewFilters";
import { BulkApproveButton } from "@/components/review/BulkApproveButton";
import {
  parseMonthParam,
  formatMonthLabel,
  getWeekStart,
  weekParam,
  formatWeekLabel,
  formatInvoiceDate,
} from "@/lib/dates";
import {
  buildReviewWhere,
  findToleranceApprovableInvoiceIds,
  findZeroDiffApprovableInvoiceIds,
} from "@/lib/reviewFilters";
import type { Prisma, ValidationStatus } from "@prisma/client";

const FILTERS: (ValidationStatus | "ALL" | "AUTO_APPROVED")[] = [
  "ALL",
  "REVIEW",
  "APPROVED",
  "AUTO_APPROVED",
];
const FILTER_LABELS: Record<string, string> = { AUTO_APPROVED: "AUTO-APPROVED" };
const PAGE_SIZE = 25;
const BULK_TOLERANCE_DOLLARS = 5;

export default async function ReviewListPage(props: {
  searchParams: Promise<{
    status?: string;
    page?: string;
    store?: string;
    month?: string;
    week?: string;
    search?: string;
  }>;
}) {
  const searchParams = await props.searchParams;
  const status = searchParams.status ?? "ALL";
  const page = Math.max(1, Number(searchParams.page) || 1);
  const storeFilter = searchParams.store ?? "";
  const monthFilter = searchParams.month ?? "";
  const weekFilter = searchParams.week ?? "";
  const searchFilter = searchParams.search ?? "";

  function buildQuery(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    const merged = {
      status,
      page: String(page),
      store: storeFilter,
      month: monthFilter,
      week: weekFilter,
      search: searchFilter,
      ...overrides,
    };
    for (const [key, value] of Object.entries(merged)) {
      if (value) params.set(key, value);
    }
    return `/review?${params.toString()}`;
  }

  const filterParams = {
    status,
    store: storeFilter,
    month: monthFilter,
    week: weekFilter,
    search: searchFilter,
  };
  const where = buildReviewWhere(filterParams);
  // Approved invoices are ordered by when they were last touched, not by
  // invoice date, so approving/correcting one brings it to the top instead
  // of leaving it wherever its date happens to fall.
  const orderBy: Prisma.InvoiceOrderByWithRelationInput[] =
    status === "APPROVED"
      ? [{ updatedAt: "desc" }]
      : [{ invoiceDate: "desc" }, { createdAt: "desc" }];

  const [
    invoices,
    totalCount,
    zeroDiffApprovableIds,
    toleranceApprovableIds,
    stores,
    monthRows,
    invoiceDatesForWeeks,
  ] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: { store: true },
        orderBy,
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.invoice.count({ where }),
      findZeroDiffApprovableInvoiceIds(filterParams),
      findToleranceApprovableInvoiceIds(filterParams, BULK_TOLERANCE_DOLLARS * 100),
      prisma.store.findMany({ orderBy: { name: "asc" } }),
      prisma.$queryRaw<{ month: string }[]>`
      SELECT DISTINCT to_char(invoice_date, 'YYYY-MM') AS month
      FROM invoices
      ORDER BY month DESC
    `,
      prisma.invoice.findMany({ select: { invoiceDate: true }, distinct: ["invoiceDate"] }),
    ]);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const storeOptions = stores.map((s) => ({
    value: s.id,
    label: s.address ? `${s.name} — ${s.address}` : s.name,
  }));
  const monthOptions = monthRows.map((r) => ({
    value: r.month,
    label: formatMonthLabel(parseMonthParam(r.month)),
  }));
  const weekStartsSeen = new Map<string, Date>();
  for (const inv of invoiceDatesForWeeks) {
    const weekStart = getWeekStart(inv.invoiceDate);
    weekStartsSeen.set(weekParam(weekStart), weekStart);
  }
  const weekOptions = [...weekStartsSeen.entries()]
    .sort((a, b) => b[1].getTime() - a[1].getTime())
    .map(([value, weekStart]) => ({ value, label: formatWeekLabel(weekStart) }));

  return (
    <main className="mx-auto max-w-5xl p-6">
      <NavBar />
      <h1 className="mb-4 text-2xl font-semibold">Invoice Review</h1>

      <nav className="mb-4 flex gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={buildQuery({ status: f, page: undefined })}
            className={`rounded px-3 py-1 text-sm ${
              status === f ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {FILTER_LABELS[f] ?? f}
          </Link>
        ))}
      </nav>

      <ReviewFilters stores={storeOptions} months={monthOptions} weeks={weekOptions} />

      <BulkApproveButton
        eligibleCount={zeroDiffApprovableIds.length}
        label={`Approve all ${zeroDiffApprovableIds.length} with $0.00 difference`}
      />
      <BulkApproveButton
        eligibleCount={toleranceApprovableIds.length}
        maxDifferenceDollars={BULK_TOLERANCE_DOLLARS}
        label={`Approve all ${toleranceApprovableIds.length} with under $${BULK_TOLERANCE_DOLLARS} difference (flagged for later review)`}
      />

      {invoices.length === 0 ? (
        <p className="text-gray-500">No invoices match these filters.</p>
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
                  {formatInvoiceDate(invoice.invoiceDate)}
                </td>
                <td className="py-2 pr-4">
                  <StatusBadge status={invoice.validationStatus} />
                  {invoice.autoApprovedReason && (
                    <span
                      className="ml-1 text-xs text-gray-400"
                      title={invoice.autoApprovedReason}
                    >
                      (auto)
                    </span>
                  )}
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
              href={buildQuery({ page: String(page - 1) })}
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
              href={buildQuery({ page: String(page + 1) })}
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
