import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const runtime = "nodejs";

const DEFAULT_ACTOR = "family";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const body = await req.json().catch(() => (({}) as { actor?: string }));
  const actor = body.actor?.trim() || DEFAULT_ACTOR;

  const existing = await prisma.invoice.findUnique({
    where: { id: params.id },
    select: { validationStatus: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const invoice = await prisma.invoice.update({
    where: { id: params.id },
    // A human just opened this invoice and clicked Approve — clears any
    // earlier bulk-tolerance auto-approval flag, since it's now had a real
    // look regardless of how it got to APPROVED before.
    data: { validationStatus: "APPROVED", approvedAt: new Date(), autoApprovedReason: null },
  });

  await prisma.auditLog.create({
    data: {
      entityType: "invoice",
      entityId: invoice.id,
      action: "approved",
      actor,
      detail: { previousStatus: existing.validationStatus },
    },
  });

  return NextResponse.json({ invoice });
}
