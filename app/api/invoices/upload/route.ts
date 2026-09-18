import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { ClaudeInvoiceExtractor } from "@/lib/extraction/providers/claude";
import { validateInvoice } from "@/lib/validation/engine";
import { toValidationInput } from "@/lib/validation/fromExtraction";
import { prisma } from "@/lib/db/client";
import { dollarsToCents } from "@/lib/money";
import { uploadInvoiceImage } from "@/lib/storage/supabase";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15MB
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

/**
 * PHASE 1 endpoint: a single invoice IMAGE in, one Invoice record out.
 * Multi-page PDF splitting and batch job orchestration is Phase 3 — see
 * README "Development Phases".
 */
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: `Unsupported file type: ${file.type}` },
      { status: 400 }
    );
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "File too large (max 15MB)" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const extractor = new ClaudeInvoiceExtractor();

  let extracted;
  try {
    extracted = await extractor.extractInvoice(buffer, file.type);
  } catch (err) {
    // Record the failed attempt for auditability even though there's no
    // invoice row yet to attach it to.
    await prisma.extractionAttempt.create({
      data: {
        provider: extractor.providerName,
        rawResponse: { error: (err as Error).message },
        succeeded: false,
        errorMessage: (err as Error).message,
      },
    });
    return NextResponse.json(
      { error: "Extraction failed", detail: (err as Error).message },
      { status: 422 }
    );
  }

  let uploadedImage;
  try {
    uploadedImage = await uploadInvoiceImage(buffer, file.type);
  } catch (err) {
    return NextResponse.json(
      { error: "Image storage upload failed", detail: (err as Error).message },
      { status: 502 }
    );
  }

  const validationInput = toValidationInput(extracted);
  const result = validateInvoice(validationInput);

  const store = await prisma.store.upsert({
    where: { storeNumber: extracted.storeNumber },
    update: { name: extracted.storeName, address: extracted.storeAddress },
    create: {
      storeNumber: extracted.storeNumber,
      name: extracted.storeName,
      address: extracted.storeAddress,
    },
  });

  const invoice = await prisma.invoice.create({
    data: {
      invoiceNumber: extracted.invoiceNumber,
      invoiceDate: new Date(extracted.invoiceDate),
      storeId: store.id,
      totalChargesCents: dollarsToCents(extracted.totalCharges),
      totalCreditCents: dollarsToCents(extracted.totalCredit),
      totalAmountDueCents: dollarsToCents(extracted.totalAmountDue),
      calculatedTotalChargesCents: result.calculatedTotalChargesCents,
      calculatedTotalCreditCents: result.calculatedTotalCreditCents,
      calculatedAmountDueCents: result.calculatedAmountDueCents,
      validationDifferenceCents: result.differenceCents,
      validationStatus: result.status,
      validationSuggestions: result.suggestions as unknown as Prisma.InputJsonValue,
      rawExtraction: extracted,
      sourceFile: file.name,
      sourcePage: 1,
      sourceImageUrl: uploadedImage.url,
      items: {
        create: result.items.map((item, index) => ({
          productName: item.productName,
          lineNumber: index,
          retailPriceCents: dollarsToCents(
            extracted.products.find((p) => p.productName === item.productName)?.retailPrice ?? 0
          ),
          unitCostCents: item.unitCostCents,
          deliveredQuantity: item.deliveredQuantity,
          returnedQuantity: item.returnedQuantity,
          soldQuantity: item.soldQuantity,
          deliveredAmountCents: item.deliveredAmountCents,
          returnCreditCents: item.returnCreditCents,
          netSoldAmountCents: item.netSoldAmountCents,
          confidence:
            extracted.products.find((p) => p.productName === item.productName)?.confidence ?? null,
        })),
      },
      extractionAttempts: {
        create: {
          provider: extractor.providerName,
          rawResponse: extracted,
          succeeded: true,
        },
      },
    },
    include: { items: true },
  });

  return NextResponse.json({ invoice, validation: result });
}
