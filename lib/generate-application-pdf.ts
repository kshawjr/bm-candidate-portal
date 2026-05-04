import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";

// Shape of the data the PDF renderer needs. Optional fields render as
// "—" so the layout stays consistent across submissions that left
// some answers blank.
export interface ApplicationPdfData {
  candidateId: string;
  brandSlug: string;
  brandName: string;
  submittedAt: Date;

  // Identity (legal name comes from bmave-core.candidates; the form
  // itself only collects a single verified_name string).
  legalFirstName: string;
  legalLastName: string;
  preferredName?: string | null;
  email: string;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;

  // Background
  hasBankruptcy?: boolean | null;
  bankruptcyExplanation?: string | null;
  hasFelony?: boolean | null;
  felonyExplanation?: string | null;

  // Financial (range-bucket strings)
  liquidCapital?: string | null;
  netWorth?: string | null;
  creditScore?: string | null;

  // Investment plans (already resolved — "Other: <free text>" if
  // applicable)
  openingTimeline?: string | null;
  involvementLevel?: string | null;
  growthPlan?: string | null;
  motivationChips?: string[];
  motivationElaboration?: string | null;

  // Brand-specific closing question. Already resolved to display text.
  closingQuestion?: string | null;
}

// Standard PDF fonts (Helvetica) only support WinAnsi encoding —
// accented characters or non-Latin scripts crash the encoder. Strip
// combining diacritics ("María" → "Maria") and replace anything still
// non-ASCII with "?" so the PDF generates cleanly even for unusual
// names. Embedding a Unicode TTF would solve this without the lossy
// step but adds ~300KB to the function bundle; the candidate-facing
// flow already auto-fills name/email from Zoho, so non-Latin chars are
// rare here. Revisit if a candidate gets a "?" stamped on their PDF.
function safe(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x00-\xFF]/g, "?");
}

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 50;
const BOTTOM_MARGIN = 80;

interface PdfCursor {
  page: PDFPage;
  yPos: number;
}

export async function generateApplicationPdf(
  data: ApplicationPdfData,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const cursor: PdfCursor = {
    page: pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    yPos: PAGE_HEIGHT - 40,
  };

  // ---------- helpers (close over cursor + pdfDoc) ----------

  const ensureRoom = (rowsNeeded: number, lineHeight = 18) => {
    if (cursor.yPos - rowsNeeded * lineHeight < BOTTOM_MARGIN) {
      cursor.page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      cursor.yPos = PAGE_HEIGHT - 40;
    }
  };

  const drawSection = (title: string) => {
    ensureRoom(2, 22);
    cursor.page.drawText(safe(title), {
      x: MARGIN,
      y: cursor.yPos,
      size: 14,
      font: helvBold,
    });
    cursor.yPos -= 22;
  };

  const drawField = (label: string, value: string | null | undefined) => {
    const v = value && value.trim().length > 0 ? value : "—";
    if (v.length > 60) {
      drawLongField(label, v);
      return;
    }
    ensureRoom(1);
    cursor.page.drawText(safe(label), {
      x: MARGIN,
      y: cursor.yPos,
      size: 11,
      font: helvBold,
    });
    cursor.page.drawText(safe(v), {
      x: MARGIN + 140,
      y: cursor.yPos,
      size: 11,
      font: helv,
    });
    cursor.yPos -= 18;
  };

  const drawLongField = (label: string, value: string) => {
    const lines = wrapText(value, 78, helv, 10);
    ensureRoom(lines.length + 1, 14);
    cursor.page.drawText(safe(label), {
      x: MARGIN,
      y: cursor.yPos,
      size: 11,
      font: helvBold,
    });
    cursor.yPos -= 16;
    for (const line of lines) {
      cursor.page.drawText(safe(line), {
        x: MARGIN + 10,
        y: cursor.yPos,
        size: 10,
        font: helv,
      });
      cursor.yPos -= 14;
    }
    cursor.yPos -= 6;
  };

  // ---------- header ----------

  cursor.page.drawText(safe(`${data.brandName} Franchise Application`), {
    x: MARGIN,
    y: cursor.yPos,
    size: 18,
    font: helvBold,
  });
  cursor.yPos -= 24;
  cursor.page.drawText(safe(`Submitted: ${formatTimestamp(data.submittedAt)}`), {
    x: MARGIN,
    y: cursor.yPos,
    size: 10,
    font: helv,
    color: rgb(0.45, 0.45, 0.45),
  });
  cursor.yPos -= 28;

  // ---------- sections ----------

  drawSection("Personal Information");
  drawField(
    "Legal Name:",
    `${data.legalFirstName ?? ""} ${data.legalLastName ?? ""}`.trim() || null,
  );
  if (data.preferredName) drawField("Preferred Name:", data.preferredName);
  drawField("Email:", data.email);
  drawField("Phone:", data.phone ?? null);
  if (data.city || data.state || data.zipCode) {
    const loc = [data.city, data.state, data.zipCode]
      .filter((s): s is string => Boolean(s && s.trim().length > 0))
      .join(", ");
    drawField("Location:", loc || null);
  }
  cursor.yPos -= 8;

  drawSection("Financial Information");
  drawField("Liquid Capital:", data.liquidCapital ?? null);
  drawField("Net Worth:", data.netWorth ?? null);
  drawField("Credit Score:", data.creditScore ?? null);
  cursor.yPos -= 8;

  drawSection("Investment Plans");
  drawField("Opening Timeline:", data.openingTimeline ?? null);
  drawField("Involvement:", data.involvementLevel ?? null);
  drawField("Growth Plan:", data.growthPlan ?? null);
  if (data.motivationChips && data.motivationChips.length > 0) {
    drawField("Motivations:", data.motivationChips.join(", "));
  }
  if (data.motivationElaboration) {
    drawLongField("Elaboration:", data.motivationElaboration);
  }
  cursor.yPos -= 8;

  drawSection("Background");
  drawField("Bankruptcy:", boolToYesNo(data.hasBankruptcy));
  if (data.bankruptcyExplanation) {
    drawLongField("Bankruptcy Explanation:", data.bankruptcyExplanation);
  }
  drawField("Felony:", boolToYesNo(data.hasFelony));
  if (data.felonyExplanation) {
    drawLongField("Felony Explanation:", data.felonyExplanation);
  }
  cursor.yPos -= 8;

  if (data.closingQuestion) {
    drawSection("Brand-Specific Response");
    drawLongField("Response:", data.closingQuestion);
  }

  return pdfDoc.save();
}

// Word-wrap on width measured by the font. Falls back to char-count
// approximation if the font doesn't support widthOfTextAtSize for some
// glyph (shouldn't happen with Helvetica + WinAnsi).
function wrapText(
  text: string,
  approxCharWidth: number,
  font: PDFFont,
  size: number,
): string[] {
  const maxWidth = (PAGE_WIDTH - MARGIN * 2 - 10) * 0.95;
  void approxCharWidth;
  const words = safe(text).split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    let width: number;
    try {
      width = font.widthOfTextAtSize(candidate, size);
    } catch {
      width = candidate.length * size * 0.5;
    }
    if (width <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function boolToYesNo(v: boolean | null | undefined): string {
  if (v === true) return "Yes";
  if (v === false) return "No";
  return "—";
}

function formatTimestamp(d: Date): string {
  return d.toLocaleString("en-US", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/New_York",
  });
}
