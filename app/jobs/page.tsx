import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { StatusBadge } from "@/components/review/StatusBadge";

export default async function JobsListPage() {
  const jobs = await prisma.processingJob.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { invoices: true } } },
  });

  return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Batch Jobs</h1>
        <Link href="/review" className="text-sm text-blue-600 underline">
          Go to invoice review
        </Link>
      </div>

      {jobs.length === 0 ? (
        <p className="text-gray-500">No uploads yet.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="py-2 pr-4">File</th>
              <th className="py-2 pr-4">Uploaded</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Progress</th>
              <th className="py-2 pr-4">Pass / Review / Failed</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id} className="border-b hover:bg-gray-50">
                <td className="py-2 pr-4">
                  <Link href={`/jobs/${job.id}`} className="text-blue-600 underline">
                    {job.filename}
                  </Link>
                </td>
                <td className="py-2 pr-4">{new Date(job.createdAt).toLocaleString()}</td>
                <td className="py-2 pr-4">
                  <StatusBadge status={job.status} />
                </td>
                <td className="py-2 pr-4">
                  {job.processedPages} / {job.totalPages}
                </td>
                <td className="py-2 pr-4">
                  {job.passedPages} / {job.reviewPages} / {job.failedPages}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
