import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { StatusBadge } from "@/components/review/StatusBadge";
import { NavBar } from "@/components/NavBar";
import { UploadForm } from "@/components/UploadForm";
import { QueueKeepAlive } from "@/components/jobs/QueueKeepAlive";
import { T } from "@/components/T";
import { isElderlyMode } from "@/lib/elderlyMode";

// Reads live from Prisma on every request — without this, Next prerenders
// the page as static HTML at build time and it never reflects new data.
export const dynamic = "force-dynamic";

export default async function JobsListPage() {
  const [jobs, elderly] = await Promise.all([
    prisma.processingJob.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { invoices: true } } },
    }),
    isElderlyMode(),
  ]);

  return (
    <main className="mx-auto max-w-5xl p-6">
      <QueueKeepAlive active={jobs.some((job) => job.status === "PROCESSING")} />
      <NavBar />
      <h1 className="mb-4 text-2xl font-semibold">
        <T k="uploadAndJobs" elderly={elderly} />
      </h1>

      <section className="rounded-lg border bg-white p-5 shadow-sm">
        {!elderly && (
          <p className="mb-4 text-sm text-gray-500">
            Select one or more invoice images or multi-page PDFs (one invoice per page)
            — each is split and processed automatically. Files upload one at a time;
            add as many as you like and they&apos;ll queue up.
          </p>
        )}
        <UploadForm />
      </section>

      <section className="mt-6 rounded-lg border bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          <T k="batchJobs" elderly={elderly} />
        </h2>

        {jobs.length === 0 ? (
          <p className="text-gray-500">
            <T k="noUploadsYet" elderly={elderly} />
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2 pr-4">
                    <T k="file" elderly={elderly} />
                  </th>
                  <th className="py-2 pr-4">
                    <T k="uploaded" elderly={elderly} />
                  </th>
                  <th className="py-2 pr-4">
                    <T k="status" elderly={elderly} />
                  </th>
                  <th className="py-2 pr-4">
                    <T k="progress" elderly={elderly} />
                  </th>
                  <th className="py-2 pr-4">
                    <T k="passReviewFailed" elderly={elderly} />
                  </th>
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
          </div>
        )}
      </section>
    </main>
  );
}
