import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { InvoiceReviewForm } from "@/components/review/InvoiceReviewForm";

export default async function ReviewDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const invoice = await prisma.invoice.findUnique({
    where: { id: params.id },
    include: {
      store: true,
      items: { orderBy: { lineNumber: "asc" } },
    },
  });

  if (!invoice) {
    notFound();
  }

  const duplicateOf = invoice.possibleDuplicateOfId
    ? await prisma.invoice.findUnique({
        where: { id: invoice.possibleDuplicateOfId },
        select: { id: true, invoiceNumber: true },
      })
    : null;

  return (
    <main className="mx-auto max-w-7xl p-6">
      <InvoiceReviewForm
        invoice={{
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          storeName: invoice.store.name,
          sourceImageUrl: invoice.sourceImageUrl,
          validationStatus: invoice.validationStatus,
          duplicateOf,
          totalChargesCents: invoice.totalChargesCents,
          totalCreditCents: invoice.totalCreditCents,
          totalAmountDueCents: invoice.totalAmountDueCents,
          items: invoice.items.map((item) => ({
            id: item.id,
            lineNumber: item.lineNumber,
            productName: item.productName,
            unitCostCents: item.unitCostCents,
            deliveredQuantity: item.deliveredQuantity,
            returnedQuantity: item.returnedQuantity,
          })),
        }}
      />
    </main>
  );
}
