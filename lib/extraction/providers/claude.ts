import Anthropic from "@anthropic-ai/sdk";
import {
  ExtractedInvoiceSchema,
  ExtractionValidationError,
  type ExtractedInvoice,
  type InvoiceExtractor,
} from "../types.ts";

const EXTRACTION_PROMPT = `You are extracting structured data from a scanned flower-delivery invoice.

Some fields are printed; RETURNED quantities and some totals may be handwritten
and harder to read. For every field you are uncertain about (especially
handwritten numbers), reflect that in a lower confidence score.

IMPORTANT — do not confuse the vendor with the destination store:
The letterhead at the very top of the invoice (a business name, phone
number, and address on the first one or two lines) belongs to the flower
delivery VENDOR who printed this invoice pad. It is the SAME on every
invoice and is NEVER the storeName or storeAddress.
The actual destination store is identified further down on the line
starting with "NAME" (e.g. "NAME VALERO 829 W MILLER RD GARLAND TX75041").
Extract storeName and storeAddress from that NAME line only — storeName is
the store/chain name at the start of that line (e.g. "VALERO"), and
storeAddress is the address that follows it on the same line (e.g.
"829 W MILLER RD GARLAND TX75041"). storeNumber comes from the separate
"NO:" line above it.

IMPORTANT — date format: the printed date (top right, near "INV NO:") is
always MM/DD/YY — month first, then day, then a 2-digit year. For example
"08/11/26" means August 11, 2026, NOT the year 2008. Never read the first
number as a year. Convert the 2-digit year by prefixing "20" (so "26"
becomes 2026) and output it as invoiceDate in "YYYY-MM-DD" format (e.g.
"08/11/26" -> "2026-08-11").

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
  "totalAmountDue": number,
  "rotationDegrees": 0 | 90 | 180 | 270
}

If a returned-quantity field is blank/illegible, use 0 and set confidence <= 0.3
for that field rather than guessing a nonzero value.

IMPORTANT — page orientation: the scanner occasionally feeds a page in
upside-down or sideways. Read the page in whatever orientation the text
actually reads correctly in (do not let a wrong orientation make you
guess at fields), and separately report how many degrees CLOCKWISE the
page image itself would need to be rotated to appear upright: 0 if it's
already upright, 90, 180, or 270 otherwise.`;

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

    // This SDK version (0.32.x) predates both the `document` content block
    // and the `thinking` param in its bundled types, though the API itself
    // accepts them fine (PDF input and thinking control, no beta header
    // needed). Build the request loosely typed and cast once at the call
    // site rather than bumping the SDK's major version for a type-only gap.
    const requestBody = {
      model: "claude-sonnet-5",
      max_tokens: 2000,
      // Sonnet 5 runs adaptive thinking by default (unlike sonnet-4-6, where
      // thinking was off unless enabled). This is a plain structured-JSON
      // extraction task with no need for reasoning, so disable it explicitly
      // to keep cost/latency equivalent to before.
      thinking: { type: "disabled" },
      messages: [
        {
          role: "user",
          content: [documentOrImageBlock, { type: "text", text: EXTRACTION_PROMPT }],
        },
      ],
    };

    const response = await this.client.messages.create(
      requestBody as unknown as Anthropic.MessageCreateParamsNonStreaming
    );

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
