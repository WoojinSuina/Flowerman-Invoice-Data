import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import {
  findToleranceApprovableInvoiceIds,
  findZeroDiffApprovableInvoiceIds,
  type ReviewFilterParams,
} from "@/lib/reviewFilters";

export const runtime = "nodejs";

const DEFAULT_ACTOR = "family";

export async function POST(req: NextRequest) {
  const body = await req
    .json()
    .catch(() => ({} as ReviewFilterParams & { actor?: string; maxDifferenceDollars?: number }));
  const actor = (body.actor as string | undefined)?.trim() || DEFAULT_ACTOR;
  const maxDifferenceDollars = Number(body.maxDifferenceDollars) || 0;
  const maxDifferenceCents = Math.round(maxDifferenceDollars * 100);

  const ids =
    maxDifferenceCents > 0
      ? await findToleranceApprovableInvoiceIds(body as ReviewFilterParams, maxDifferenceCents)
      : await findZeroDiffApprovableInvoiceIds(body as ReviewFilterParams);

  if (ids.length === 0) {
    return NextResponse.json({ approvedCount: 0 });
  }

  // Only the tolerance case is a judgment call rather than an exact match —
  // flag those so they can be found again later (see the "AUTO_APPROVED"
  // pseudo-filter in lib/reviewFilters.ts's buildReviewWhere).
  const reason =
    maxDifferenceCents > 0
      ? `bulk approve: within $${maxDifferenceDollars.toFixed(2)} tolerance (not individually reviewed)`
      : "bulk approve: $0.00 difference";

  await prisma.invoice.updateMany({
    where: { id: { in: ids } },
    data: {
      validationStatus: "APPROVED",
      approvedAt: new Date(),
      autoApprovedReason: maxDifferenceCents > 0 ? reason : null,
    },
  });

  await prisma.auditLog.createMany({
    data: ids.map((id) => ({
      entityType: "invoice",
      entityId: id,
      action: "approved",
      actor,
      detail: { reason },
    })),
  });

  return NextResponse.json({ approvedCount: ids.length });
}
