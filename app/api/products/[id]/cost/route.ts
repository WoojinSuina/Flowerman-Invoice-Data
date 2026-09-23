import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { dollarsToCents } from "@/lib/money";

export const runtime = "nodejs";

interface SetCostBody {
  dollars: number | null;
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const body = (await req.json()) as SetCostBody;

  if (body.dollars !== null && (!Number.isFinite(body.dollars) || body.dollars < 0)) {
    return NextResponse.json({ error: "dollars must be a non-negative number or null" }, { status: 400 });
  }

  const product = await prisma.product.findUnique({ where: { id: params.id } });
  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const updated = await prisma.product.update({
    where: { id: params.id },
    data: { costCents: body.dollars === null ? null : dollarsToCents(body.dollars) },
  });

  return NextResponse.json({ product: updated });
}
