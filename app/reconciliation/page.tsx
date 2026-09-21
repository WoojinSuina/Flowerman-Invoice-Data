import Link from "next/link";
import { NavBar } from "@/components/NavBar";
import { StatusBadge } from "@/components/review/StatusBadge";
import { formatCents } from "@/lib/money";
import { formatInvoiceDate } from "@/lib/dates";
import {
  getMismatchedInvoices,
  summarizeMismatches,
  topStoresByNet,
  type MismatchClassification,
  type MismatchedInvoice,
} from "@/lib/reconciliation";

export const dynamic = "force-dynamic";

const STATUS_FILTERS = ["ALL", "APPROVED", "REVIEW"] as const;
const CLASS_FILTERS = ["ALL", "plausible", "likely_misread"] as const;
const CLASS_LABELS: Record<MismatchClassification, string> = {
  plausible: "Plausible error",
  likely_misread: "Likely misread",
};
const PAGE_SIZE = 25;

function StatTile({ label, value, href, sub }: { label: string; value: string; href?: string; sub?: string }) {
  const content = (
    <div className="rounded border p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
      {sub && <p className="mt-1 text-xs text-gray-400">{sub}</p>}
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

function ClassificationBadge({ classification }: { classification: MismatchClassification }) {
  const style =
    classification === "likely_misread"
      ? "bg-red-100 text-red-800"
      : "bg-gray-100 text-gray-700";
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}>
      {CLASS_LABELS[classification]}
    </span>
  );
}

export default async function ReconciliationPage(props: {
  searchParams: Promise<{ status?: string; classification?: string; page?: string }>;
}) {
  const searchParams = await props.searchParams;
  const statusFilter = (searchParams.status ?? "ALL").toUpperCase();
  const classFilter = (searchParams.classification ?? "ALL") as (typeof CLASS_FILTERS)[number];
  const page = Math.max(1, Number(searchParams.page) || 1);

  const allMismatches = await getMismatchedInvoices();
  const summary = summarizeMismatches(allMismatches);
  const worstStores = topStoresByNet(allMismatches);

  function buildQuery(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    const merged = {
      status: statusFilter,
      classification: classFilter,
      page: String(page),
      ...overrides,
    };
    for (const [key, value] of Object.entries(merged)) {
      if (value && value !== "ALL" && !(key === "page" && value === "1")) params.set(key, value);
    }
    const qs = params.toString();
    return `/reconciliation${qs ? `?${qs}` : ""}`;
  }

  const filtered = allMismatches
    .filter((i) => statusFilter === "ALL" || i.validationStatus === statusFilter)
    .filter((i) => classFilter === "ALL" || i.classification === classFilter)
    .sort((a, b) => Math.abs(b.impactCents) - Math.abs(a.impactCents));
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <main className="mx-auto max-w-5xl p-6">
      <NavBar />
      <h1 className="mb-1 text-2xl font-semibold">Reconciliation</h1>
      <p className="mb-4 text-sm text-gray-500">
        What it costs (or saves) to approve an invoice on its written total when
        the line items add up to something else — a written total higher than
        the math is a gain for us, lower is a loss.
      </p>

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile
          label="Net from approved errors"
          value={formatCents(summary.approvedNetCents)}
          sub={`${summary.approvedCount} already approved as written`}
          href="/reconciliation?status=APPROVED"
        />
        <StatTile
          label="Pending in review"
          value={formatCents(summary.reviewNetCents)}
          sub={`${summary.reviewCount} invoices, if approved as written`}
          href="/reconciliation?status=REVIEW"
        />
        <StatTile
          label="Likely misreads to check"
          value={summary.likelyMisreadInReviewCount.toLocaleString()}
          sub="in REVIEW — probably a bad scan read, not human error"
          href="/reconciliation?status=REVIEW&classification=likely_misread"
        />
        <StatTile label="Total mismatches" value={summary.totalCount.toLocaleString()} />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <Link
            key={f}
            href={buildQuery({ status: f, page: undefined })}
            className={`rounded px-3 py-1 text-sm ${
              statusFilter === f ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {f}
          </Link>
        ))}
        <span className="mx-1 self-center text-gray-300">|</span>
        {CLASS_FILTERS.map((f) => (
          <Link
            key={f}
            href={buildQuery({ classification: f, page: undefined })}
            className={`rounded px-3 py-1 text-sm ${
              classFilter === f ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {f === "ALL" ? "ALL" : CLASS_LABELS[f as MismatchClassification]}
          </Link>
        ))}
      </div>

      <div className="mb-8">
        <h2 className="mb-2 font-medium">
          Largest discrepancies{" "}
          <span className="text-sm font-normal text-gray-400">
            (sorted by size, {filtered.length} total)
          </span>
        </h2>
        {filtered.length === 0 ? (
          <p className="text-sm text-gray-500">No invoices match these filters.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-2 pr-4">Invoice #</th>
                <th className="py-2 pr-4">Store</th>
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Written</th>
                <th className="py-2 pr-4">Calculated</th>
                <th className="py-2 pr-4">Impact</th>
                <th className="py-2 pr-4">Classification</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((inv: MismatchedInvoice) => (
                <tr key={inv.id} className="border-b hover:bg-gray-50">
                  <td className="py-2 pr-4">
                    <Link href={`/review/${inv.id}`} className="text-blue-600 underline">
                      {inv.invoiceNumber}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">
                    {inv.storeName}
                    {inv.storeAddress && <div className="text-xs text-gray-500">{inv.storeAddress}</div>}
                  </td>
                  <td className="py-2 pr-4">{formatInvoiceDate(inv.invoiceDate)}</td>
                  <td className="py-2 pr-4">
                    <StatusBadge status={inv.validationStatus} />
                  </td>
                  <td className="py-2 pr-4 tabular-nums">{formatCents(inv.writtenCents)}</td>
                  <td className="py-2 pr-4 tabular-nums">{formatCents(inv.calculatedCents)}</td>
                  <td
                    className={`py-2 pr-4 tabular-nums font-medium ${
                      inv.impactCents < 0 ? "text-red-700" : "text-green-700"
                    }`}
                  >
                    {inv.impactCents >= 0 ? "+" : ""}
                    {formatCents(inv.impactCents)}
                  </td>
                  <td className="py-2 pr-4">
                    <ClassificationBadge classification={inv.classification} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {filtered.length > 0 && (
          <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
            <span>
              Page {page} of {totalPages} ({filtered.length} invoice{filtered.length === 1 ? "" : "s"})
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
      </div>

      <div>
        <h2 className="mb-2 font-medium">Worst stores by net loss</h2>
        {worstStores.length === 0 ? (
          <p className="text-sm text-gray-500">No data yet.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-2 pr-4">Store</th>
                <th className="py-2 pr-4">Invoices</th>
                <th className="py-2 pr-4">Net</th>
              </tr>
            </thead>
            <tbody>
              {worstStores.map((row) => (
                <tr key={row.storeId} className="border-b">
                  <td className="py-2 pr-4">
                    <Link href={`/stores/${row.storeId}`} className="text-blue-600 underline">
                      {row.name}
                    </Link>
                    {row.address && <div className="text-xs text-gray-500">{row.address}</div>}
                  </td>
                  <td className="py-2 pr-4 tabular-nums">{row.count}</td>
                  <td
                    className={`py-2 pr-4 tabular-nums font-medium ${
                      row.netCents < 0 ? "text-red-700" : "text-green-700"
                    }`}
                  >
                    {row.netCents >= 0 ? "+" : ""}
                    {formatCents(row.netCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
