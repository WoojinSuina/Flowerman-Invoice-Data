import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { findZeroDiffApprovableInvoiceIds, type ReviewFilterParams } from "@/lib/reviewFilters";

export const runtime = "nodejs";

const DEFAULT_ACTOR = "family";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as ReviewFilterParams & { actor?: string }));
  const actor = (body.actor as string | undefined)?.trim() || DEFAULT_ACTOR;

  const ids = await findZeroDiffApprovableInvoiceIds(body as ReviewFilterParams);

  if (ids.length === 0) {
    return NextResponse.json({ approvedCount: 0 });
  }

  await prisma.invoice.updateMany({
    where: { id: { in: ids } },
    data: { validationStatus: "APPROVED", approvedAt: new Date() },
  });

  await prisma.auditLog.createMany({
    data: ids.map((id) => ({
      entityType: "invoice",
      entityId: id,
      action: "approved",
      actor,
      detail: { reason: "bulk approve: $0.00 difference" },
    })),
  });

  return NextResponse.json({ approvedCount: ids.length });
}
