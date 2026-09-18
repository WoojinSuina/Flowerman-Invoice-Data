import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const job = await prisma.processingJob.findUnique({
    where: { id: params.id },
    include: {
      invoices: { include: { store: true }, orderBy: { sourcePage: "asc" } },
      extractionAttempts: { where: { succeeded: false }, orderBy: { sourcePage: "asc" } },
    },
  });

  if (!job) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ job });
}
