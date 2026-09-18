import Anthropic from "@anthropic-ai/sdk";
import {
  ExtractedInvoiceSchema,
  ExtractionValidationError,
  type ExtractedInvoice,
  type InvoiceExtractor,
} from "../types";

const EXTRACTION_PROMPT = `You are extracting structured data from a scanned flower-delivery invoice.

Some fields are printed; RETURNED quantities and some totals may be handwritten
and harder to read. For every field you are uncertain about (especially
handwritten numbers), reflect that in a lower confidence score.

Return ONLY a JSON object with this exact shape, and nothing else — no markdown
fences, no commentary:

{
  "invoiceDate": "YYYY-MM-DD",
  "invoiceNumber": "string",
  "storeNumber": "string",
  "storeName": "string",
  "storeAddress": "string",
  "products": [
    {
      "productName": "string",
      "retailPrice": number,
      "unitCost": number,
      "deliveredQuantity": integer,
      "returnedQuantity": integer,
      "confidence": number between 0 and 1, lower for handwritten/uncertain reads
    }
  ],
  "totalCharges": number,
  "totalCredit": number,
  "totalAmountDue": number
}

If a returned-quantity field is blank/illegible, use 0 and set confidence <= 0.3
for that field rather than guessing a nonzero value.`;

export class ClaudeInvoiceExtractor implements InvoiceExtractor {
  readonly providerName = "claude-vision";
  private client: Anthropic;

  constructor(apiKey: string = process.env.ANTHROPIC_API_KEY ?? "") {
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set. Add it to your .env file (see .env.example)."
      );
    }
    this.client = new Anthropic({ apiKey });
  }

  async extractInvoice(fileBuffer: Buffer, mimeType: string): Promise<ExtractedInvoice> {
    const isPdf = mimeType === "application/pdf";
    const documentOrImageBlock = isPdf
      ? {
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: fileBuffer.toString("base64"),
          },
        }
      : {
          type: "image",
          source: {
            type: "base64",
            media_type: mimeType as "image/jpeg" | "image/png" | "image/webp",
            data: fileBuffer.toString("base64"),
          },
        };

    const response = await this.client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          // The `document` block above isn't in this SDK version's (0.32.x)
          // bundled types yet, though the API itself accepts it (PDF input,
          // no beta header). Cast narrowly rather than bumping the SDK.
          content: [documentOrImageBlock, { type: "text", text: EXTRACTION_PROMPT }] as unknown as Anthropic.MessageCreateParams["messages"][number]["content"],
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Claude response contained no text block");
    }

    let parsed: unknown;
    try {
      // Strip accidental markdown fences defensively, even though the
      // prompt asks for raw JSON.
      const cleaned = textBlock.text.replace(/^```json\s*|```\s*$/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch (err) {
      throw new Error(`Claude response was not valid JSON: ${(err as Error).message}`);
    }

    const result = ExtractedInvoiceSchema.safeParse(parsed);
    if (!result.success) {
      throw new ExtractionValidationError(
        "Claude's extraction did not match the expected schema",
        parsed,
        result.error
      );
    }

    return result.data;
  }
}
