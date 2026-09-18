import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const runtime = "nodejs";

interface MergeRequestBody {
  sourceStoreId: string;
  targetStoreId: string;
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as MergeRequestBody;
  const { sourceStoreId, targetStoreId } = body;

  if (!sourceStoreId || !targetStoreId) {
    return NextResponse.json(
      { error: "sourceStoreId and targetStoreId are required" },
      { status: 400 }
    );
  }
  if (sourceStoreId === targetStoreId) {
    return NextResponse.json({ error: "Cannot merge a store into itself" }, { status: 400 });
  }

  const [source, target] = await Promise.all([
    prisma.store.findUnique({ where: { id: sourceStoreId } }),
    prisma.store.findUnique({ where: { id: targetStoreId } }),
  ]);
  if (!source || !target) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.invoice.updateMany({
      where: { storeId: sourceStoreId },
      data: { storeId: targetStoreId },
    }),
    prisma.store.delete({ where: { id: sourceStoreId } }),
  ]);

  return NextResponse.json({ merged: { from: source.name, into: target.name } });
}
