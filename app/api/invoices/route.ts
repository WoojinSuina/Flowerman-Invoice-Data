import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import type { ValidationStatus } from "@prisma/client";

export const runtime = "nodejs";

const VALID_STATUSES = new Set(["PROCESSING", "PASS", "REVIEW", "APPROVED", "FAILED"]);

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");
  if (status && !VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: `Invalid status: ${status}` }, { status: 400 });
  }

  const invoices = await prisma.invoice.findMany({
    where: status ? { validationStatus: status as ValidationStatus } : undefined,
    include: { store: true, items: { select: { id: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ invoices });
}
