import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const runtime = "nodejs";

interface MergeRequestBody {
  sourceProductId: string;
  targetProductId: string;
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as MergeRequestBody;
  const { sourceProductId, targetProductId } = body;

  if (!sourceProductId || !targetProductId) {
    return NextResponse.json(
      { error: "sourceProductId and targetProductId are required" },
      { status: 400 }
    );
  }
  if (sourceProductId === targetProductId) {
    return NextResponse.json({ error: "Cannot merge a product into itself" }, { status: 400 });
  }

  const [source, target] = await Promise.all([
    prisma.product.findUnique({ where: { id: sourceProductId } }),
    prisma.product.findUnique({ where: { id: targetProductId } }),
  ]);
  if (!source || !target) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.invoiceItem.updateMany({
      where: { productId: sourceProductId },
      data: { productId: targetProductId },
    }),
    prisma.product.delete({ where: { id: sourceProductId } }),
  ]);

  return NextResponse.json({ merged: { from: source.name, into: target.name } });
}
