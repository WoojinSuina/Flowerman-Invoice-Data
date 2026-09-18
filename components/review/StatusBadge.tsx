const STATUS_STYLES: Record<string, string> = {
  // ValidationStatus
  PROCESSING: "bg-gray-100 text-gray-700",
  PASS: "bg-green-100 text-green-800",
  REVIEW: "bg-amber-100 text-amber-800",
  APPROVED: "bg-blue-100 text-blue-800",
  FAILED: "bg-red-100 text-red-800",
  // JobStatus (PENDING/PROCESSING/FAILED already covered above)
  COMPLETED: "bg-green-100 text-green-800",
  COMPLETED_WITH_ERRORS: "bg-amber-100 text-amber-800",
  PENDING: "bg-gray-100 text-gray-700",
};

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? "bg-gray-100 text-gray-700";
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}>
      {status}
    </span>
  );
}
