import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { StatusBadge } from "@/components/review/StatusBadge";
import { NavBar } from "@/components/NavBar";
import { UploadForm } from "@/components/UploadForm";
import { QueueKeepAlive } from "@/components/jobs/QueueKeepAlive";

// Reads live from Prisma on every request — without this, Next prerenders
// the page as static HTML at build time and it never reflects new data.
export const dynamic = "force-dynamic";

export default async function JobsListPage() {
  const jobs = await prisma.processingJob.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { invoices: true } } },
  });

  return (
    <main className="mx-auto max-w-5xl p-6">
      <QueueKeepAlive active={jobs.some((job) => job.status === "PROCESSING")} />
      <NavBar />
      <h1 className="mb-4 text-2xl font-semibold">Upload &amp; Jobs</h1>
      <p className="mb-6 text-sm text-gray-500">
        Select one or more invoice images or multi-page PDFs (one invoice per page)
        — each is split and processed automatically. Files upload one at a time;
        add as many as you like and they&apos;ll queue up.
      </p>

      <UploadForm />

      <h2 className="mb-4 mt-8 text-lg font-medium">Batch jobs</h2>

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
