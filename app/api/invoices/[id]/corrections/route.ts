import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { validateInvoice } from "@/lib/validation/engine";
import {
  diffInvoiceTotals,
  diffInvoiceDate,
  diffLineItems,
  type FieldDiff,
} from "@/lib/validation/diffCorrections";
import { isFutureDate } from "@/lib/dates";

export const runtime = "nodejs";

const DEFAULT_ACTOR = "family";

interface CorrectedItemInput {
  id: string;
  productName: string;
  unitCostCents: number;
  deliveredQuantity: number;
  returnedQuantity: number;
}

interface CorrectionsRequestBody {
  correctedBy?: string;
  invoiceDate: string; // "YYYY-MM-DD"
  invoiceTotalChargesCents: number;
  invoiceTotalCreditCents: number;
  invoiceTotalAmountDueCents: number;
  items: CorrectedItemInput[];
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const body = (await req.json()) as CorrectionsRequestBody;

  const existing = await prisma.invoice.findUnique({
    where: { id: params.id },
    include: { items: { orderBy: { lineNumber: "asc" } } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const itemsById = new Map(existing.items.map((item) => [item.id, item]));
  const correctedItemsByLine = body.items
    .map((submitted) => {
      const dbItem = itemsById.get(submitted.id);
      if (!dbItem) return null;
      return {
        lineNumber: dbItem.lineNumber,
        productName: submitted.productName,
        unitCostCents: submitted.unitCostCents,
        deliveredQuantity: submitted.deliveredQuantity,
        returnedQuantity: submitted.returnedQuantity,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => a.lineNumber - b.lineNumber);

  const originalItemShapes = existing.items.map((item) => ({
    lineNumber: item.lineNumber,
    productName: item.productName,
    unitCostCents: item.unitCostCents,
    deliveredQuantity: item.deliveredQuantity,
    returnedQuantity: item.returnedQuantity,
  }));
  const originalTotals = {
    invoiceTotalChargesCents: existing.totalChargesCents,
    invoiceTotalCreditCents: existing.totalCreditCents,
    invoiceTotalAmountDueCents: existing.totalAmountDueCents,
  };
  const correctedTotals = {
    invoiceTotalChargesCents: body.invoiceTotalChargesCents,
    invoiceTotalCreditCents: body.invoiceTotalCreditCents,
    invoiceTotalAmountDueCents: body.invoiceTotalAmountDueCents,
  };
  const originalInvoiceDateStr = existing.invoiceDate.toISOString().slice(0, 10);
  const correctedInvoiceDate = new Date(body.invoiceDate);

  const diffs: FieldDiff[] = [
    ...diffInvoiceTotals(originalTotals, correctedTotals),
    ...diffLineItems(originalItemShapes, correctedItemsByLine),
    ...(diffInvoiceDate(originalInvoiceDateStr, body.invoiceDate)
      ? [diffInvoiceDate(originalInvoiceDateStr, body.invoiceDate) as FieldDiff]
      : []),
  ];

  const validation = validateInvoice({
    ...correctedTotals,
    items: correctedItemsByLine.map(({ productName, unitCostCents, deliveredQuantity, returnedQuantity }) => ({
      productName,
      unitCostCents,
      deliveredQuantity,
      returnedQuantity,
    })),
  });

  // A possible-duplicate flag or an impossible (future) date both force
  // REVIEW regardless of what the recalculated math says — same rule as at
  // ingestion time, and neither is something a total/line-item correction
  // alone can resolve.
  const finalStatus =
    existing.possibleDuplicateOfId || isFutureDate(correctedInvoiceDate)
      ? "REVIEW"
      : validation.status;

  if (diffs.length > 0) {
    const actor = body.correctedBy?.trim() || DEFAULT_ACTOR;
    const correctedByLine = new Map(correctedItemsByLine.map((item) => [item.lineNumber, item]));
    const submittedById = new Map(body.items.map((item) => [item.id, item]));
    // validation.items is index-aligned with correctedItemsByLine (both built
    // by mapping over the same array in order) — match on that, not on
    // productName, so duplicate product names can't cross-wire results.
    const resultByLine = new Map(
      correctedItemsByLine.map((item, index) => [item.lineNumber, validation.items[index]])
    );

    await prisma.$transaction([
      prisma.invoice.update({
        where: { id: existing.id },
        data: {
          invoiceDate: correctedInvoiceDate,
          totalChargesCents: correctedTotals.invoiceTotalChargesCents,
          totalCreditCents: correctedTotals.invoiceTotalCreditCents,
          totalAmountDueCents: correctedTotals.invoiceTotalAmountDueCents,
          calculatedTotalChargesCents: validation.calculatedTotalChargesCents,
          calculatedTotalCreditCents: validation.calculatedTotalCreditCents,
          calculatedAmountDueCents: validation.calculatedAmountDueCents,
          validationDifferenceCents: validation.differenceCents,
          validationStatus: finalStatus,
          validationSuggestions: validation.suggestions as unknown as Prisma.InputJsonValue,
          // A human just edited this invoice — clears any earlier
          // bulk-tolerance auto-approval flag, since it's now had a real look.
          autoApprovedReason: null,
        },
      }),
      ...existing.items.map((dbItem) => {
        const corrected = correctedByLine.get(dbItem.lineNumber);
        const submitted = corrected ? submittedById.get(dbItem.id) : undefined;
        const result = resultByLine.get(dbItem.lineNumber);
        if (!corrected || !submitted || !result) {
          return prisma.invoiceItem.update({ where: { id: dbItem.id }, data: {} });
        }
        return prisma.invoiceItem.update({
          where: { id: dbItem.id },
          data: {
            productName: corrected.productName,
            unitCostCents: corrected.unitCostCents,
            deliveredQuantity: corrected.deliveredQuantity,
            returnedQuantity: corrected.returnedQuantity,
            soldQuantity: result.soldQuantity,
            deliveredAmountCents: result.deliveredAmountCents,
            returnCreditCents: result.returnCreditCents,
            netSoldAmountCents: result.netSoldAmountCents,
          },
        });
      }),
      prisma.manualCorrection.createMany({
        data: diffs.map((diff) => ({
          invoiceId: existing.id,
          fieldPath: diff.fieldPath,
          originalValue: diff.originalValue,
          correctedValue: diff.correctedValue,
          correctedBy: actor,
        })),
      }),
      prisma.auditLog.create({
        data: {
          entityType: "invoice",
          entityId: existing.id,
          action: "corrected",
          actor,
          detail: { fieldsChanged: diffs.map((d) => d.fieldPath) },
        },
      }),
    ]);
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: existing.id },
    include: { store: true, items: { orderBy: { lineNumber: "asc" } } },
  });

  return NextResponse.json({ invoice, validation });
}
