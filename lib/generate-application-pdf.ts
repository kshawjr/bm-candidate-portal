import "server-only";
import {
  PDFDocument,
  PageSizes,
  StandardFonts,
  rgb,
  type PDFPage,
  type PDFFont,
  type PDFImage,
  type RGB,
} from "pdf-lib";

// Shape of the data the PDF renderer needs.
export interface ApplicationPdfData {
  candidateId: string;
  brandSlug: string;
  brandName: string;
  brandLogoUrl?: string | null;
  zohoLeadId?: string | null;
  submittedAt: Date;

  legalFirstName: string;
  legalLastName: string;
  preferredName?: string | null;
  email: string;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;

  hasBankruptcy?: boolean | null;
  bankruptcyExplanation?: string | null;
  hasFelony?: boolean | null;
  felonyExplanation?: string | null;

  liquidCapital?: string | null;
  netWorth?: string | null;
  creditScore?: string | null;

  openingTimeline?: string | null;
  involvementLevel?: string | null;
  growthPlan?: string | null;
  motivationChips?: string[];
  motivationElaboration?: string | null;

  closingQuestion?: string | null;
}

// Brand-specific colors are hard-coded to match the design brief exactly
// (Hounds Town teal, Cruisin' Tikis navy). Could be sourced from
// bmave-core.brands.colors.primary in a follow-up so a third brand
// works without a code change.
function getBrandColors(brandSlug: string): { primary: RGB } {
  if (brandSlug === "hounds-town-usa") {
    return { primary: rgb(0.149, 0.404, 0.514) }; // #266783
  }
  return { primary: rgb(0.129, 0.224, 0.463) }; // #213976 (CT default)
}

const COLORS = {
  textDark: rgb(0.13, 0.13, 0.13), // #222
  textMuted: rgb(0.4, 0.4, 0.4), // #666
  divider: rgb(0.8, 0.8, 0.8), // #ccc
  cardBg: rgb(0.97, 0.97, 0.97), // #f8f8f8
  statusClean: rgb(0.13, 0.67, 0.13), // #22aa22
  statusFlagged: rgb(0.8, 0.27, 0.27), // #cc4444
};

const MARGIN = 60;
const FOOTER_BASELINE_Y = 30;

// Helvetica (StandardFonts) is WinAnsi-only — non-Latin characters
// crash the encoder. Strip combining diacritics ("María" → "Maria")
// and replace anything still non-ASCII with "?". Trade-off: lossy for
// candidates whose names use scripts outside Latin-1. Embedding a
// Unicode TTF would solve this but adds ~300KB to the function bundle.
function safe(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x00-\xFF]/g, "?");
}

// Magic-byte sniff so we route PNG vs JPEG to the right pdf-lib
// embed call without paying a try/catch round-trip on every logo.
// SVG isn't supported by pdf-lib at all; we surface that as a null
// return so the caller renders text-only.
async function fetchAndEmbedLogo(
  pdfDoc: PDFDocument,
  logoUrl: string | null | undefined,
): Promise<PDFImage | null> {
  if (!logoUrl) return null;
  try {
    const response = await fetch(logoUrl);
    if (!response.ok) return null;
    const buffer = new Uint8Array(await response.arrayBuffer());

    if (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    ) {
      return await pdfDoc.embedPng(buffer);
    }
    if (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    ) {
      return await pdfDoc.embedJpg(buffer);
    }
    return null;
  } catch (err) {
    console.warn("[application-pdf] logo fetch/embed failed:", err);
    return null;
  }
}

export async function generateApplicationPdf(
  data: ApplicationPdfData,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helvItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const logo = await fetchAndEmbedLogo(pdfDoc, data.brandLogoUrl);
  const brand = getBrandColors(data.brandSlug);

  // Total page count is computed once everything is rendered; for now
  // each page records its own number when it's drawn. We append the
  // total via a trailing pass — pdf-lib doesn't support back-patching
  // cleanly, so we just write "Page N" without "of M" for simplicity.
  let pageNumber = 0;

  // ---------- Page 1: Executive Summary ----------

  pageNumber += 1;
  let page = pdfDoc.addPage(PageSizes.Letter);
  let { width, height } = page.getSize();
  let yPos = height - MARGIN;
  const contentWidth = width - MARGIN * 2;

  if (logo) {
    const logoH = 40;
    const naturalRatio = logo.width / logo.height;
    const logoW = Math.min(logoH * naturalRatio, contentWidth * 0.5);
    page.drawImage(logo, {
      x: (width - logoW) / 2,
      y: yPos - logoH,
      width: logoW,
      height: logoH,
    });
    yPos -= logoH + 18;
  } else {
    // No logo: use brand name as a simple wordmark so the top of the
    // page still has a visible brand anchor.
    const wordmark = safe(data.brandName.toUpperCase());
    const wmWidth = helvBold.widthOfTextAtSize(wordmark, 14);
    page.drawText(wordmark, {
      x: (width - wmWidth) / 2,
      y: yPos - 14,
      size: 14,
      font: helvBold,
      color: brand.primary,
    });
    yPos -= 32;
  }

  // Brand-color accent bar.
  page.drawRectangle({
    x: MARGIN,
    y: yPos - 4,
    width: contentWidth,
    height: 3,
    color: brand.primary,
  });
  yPos -= 30;

  // Candidate name (BIG).
  const fullName = safe(
    `${data.legalFirstName ?? ""} ${data.legalLastName ?? ""}`.trim() ||
      "CANDIDATE",
  ).toUpperCase();
  page.drawText(fullName, {
    x: MARGIN,
    y: yPos,
    size: 24,
    font: helvBold,
    color: COLORS.textDark,
  });
  yPos -= 26;

  // Subtitle.
  page.drawText(safe(`${data.brandName} Franchise Application`), {
    x: MARGIN,
    y: yPos,
    size: 11,
    font: helvItalic,
    color: COLORS.textMuted,
  });
  yPos -= 24;

  drawDivider(page, MARGIN, yPos, width - MARGIN);
  yPos -= 22;

  // Two-column header: Contact | Application Info.
  const colWidth = contentWidth / 2;
  drawColumnLabel(page, "CONTACT", MARGIN, yPos, helvBold);
  drawColumnLabel(
    page,
    "APPLICATION INFO",
    MARGIN + colWidth,
    yPos,
    helvBold,
  );
  yPos -= 18;

  // Build the two columns of values so they line up row-by-row even
  // when one column is shorter than the other.
  const leftLines: string[] = [];
  leftLines.push(data.email);
  if (data.phone) leftLines.push(data.phone);
  const locParts = [data.city, data.state, data.zipCode]
    .filter((s): s is string => Boolean(s && s.trim().length > 0))
    .join(", ");
  if (locParts) leftLines.push(locParts);

  const rightLines: string[] = [];
  rightLines.push(`Submitted: ${formatDate(data.submittedAt)}`);
  rightLines.push(`Brand: ${data.brandName}`);
  if (data.zohoLeadId) {
    rightLines.push(`Lead ID: ${truncate(data.zohoLeadId, 18)}`);
  }

  const rowCount = Math.max(leftLines.length, rightLines.length);
  for (let i = 0; i < rowCount; i++) {
    if (leftLines[i]) {
      page.drawText(safe(leftLines[i]), {
        x: MARGIN,
        y: yPos,
        size: 10,
        font: helv,
        color: COLORS.textDark,
      });
    }
    if (rightLines[i]) {
      page.drawText(safe(rightLines[i]), {
        x: MARGIN + colWidth,
        y: yPos,
        size: 10,
        font: helv,
        color: COLORS.textDark,
      });
    }
    yPos -= 14;
  }
  yPos -= 16;

  drawDivider(page, MARGIN, yPos, width - MARGIN);
  yPos -= 30;

  // INVESTMENT SUMMARY — three stat cards.
  drawSectionHeader(page, "INVESTMENT SUMMARY", MARGIN, yPos, helvBold, brand);
  yPos -= 22;

  const cardCount = 3;
  const cardGap = 10;
  const cardWidth = (contentWidth - cardGap * (cardCount - 1)) / cardCount;
  const cardHeight = 70;
  const cardY = yPos - cardHeight;
  const cards: { label: string; value: string }[] = [
    { label: "LIQUID CAPITAL", value: data.liquidCapital ?? "—" },
    { label: "NET WORTH", value: data.netWorth ?? "—" },
    { label: "TIMELINE", value: data.openingTimeline ?? "—" },
  ];
  for (let i = 0; i < cardCount; i++) {
    drawStatCard(
      page,
      MARGIN + i * (cardWidth + cardGap),
      cardY,
      cardWidth,
      cardHeight,
      cards[i].label,
      cards[i].value,
      helv,
      helvBold,
      brand,
    );
  }
  yPos = cardY - 26;

  drawDivider(page, MARGIN, yPos, width - MARGIN);
  yPos -= 28;

  // BACKGROUND CHECK status line (color carries the signal so we
  // don't need unicode glyphs that Helvetica can't encode).
  drawSectionHeader(page, "BACKGROUND CHECK", MARGIN, yPos, helvBold, brand);
  yPos -= 22;

  const flagged: string[] = [];
  if (data.hasBankruptcy) flagged.push("bankruptcy");
  if (data.hasFelony) flagged.push("felony");
  const isClean = flagged.length === 0;
  const statusText = isClean
    ? "Clean — no bankruptcy or felony reported."
    : `Flagged — ${flagged.join(" and ")} reported. See deep dive for details.`;
  const statusColor = isClean ? COLORS.statusClean : COLORS.statusFlagged;

  page.drawText(safe(statusText), {
    x: MARGIN,
    y: yPos,
    size: 11,
    font: helv,
    color: statusColor,
  });
  yPos -= 30;

  // WHAT MOTIVATES <NAME>
  if (data.motivationChips && data.motivationChips.length > 0) {
    drawDivider(page, MARGIN, yPos, width - MARGIN);
    yPos -= 28;

    const firstName = safe((data.legalFirstName ?? "").toUpperCase()) || "THEM";
    drawSectionHeader(
      page,
      `WHAT MOTIVATES ${firstName}`,
      MARGIN,
      yPos,
      helvBold,
      brand,
    );
    yPos -= 24;

    yPos = drawChipRow(
      page,
      data.motivationChips,
      MARGIN,
      yPos,
      contentWidth,
      helv,
      brand,
    );
    yPos -= 12;

    if (data.motivationElaboration) {
      const truncated = truncate(data.motivationElaboration, 240);
      const lines = wrapText(truncated, helvItalic, 10, contentWidth - 20);
      // Quote rendering: a single open quote on the first line, close
      // quote on the last. Avoids the awkward per-line "..." pattern.
      for (let i = 0; i < lines.length; i++) {
        const isFirst = i === 0;
        const isLast = i === lines.length - 1;
        const text =
          (isFirst ? "\u201C" : "") +
          lines[i] +
          (isLast ? "\u201D" : "");
        page.drawText(safe(text), {
          x: MARGIN + 6,
          y: yPos,
          size: 10,
          font: helvItalic,
          color: COLORS.textMuted,
        });
        yPos -= 14;
      }
    }
  }

  drawFooter(page, data.brandName, pageNumber, helv);

  // ---------- Page 2: Deep Dive ----------

  pageNumber += 1;
  page = pdfDoc.addPage(PageSizes.Letter);
  ({ width, height } = page.getSize());
  yPos = height - MARGIN;

  // Top header row: small logo (or brand name) on the left, page
  // number on the right.
  if (logo) {
    const headerH = 22;
    const headerW = Math.min(headerH * (logo.width / logo.height), 140);
    page.drawImage(logo, {
      x: MARGIN,
      y: yPos - headerH,
      width: headerW,
      height: headerH,
    });
  } else {
    page.drawText(safe(data.brandName), {
      x: MARGIN,
      y: yPos - 12,
      size: 11,
      font: helvBold,
      color: brand.primary,
    });
  }
  page.drawText(`Page ${pageNumber}`, {
    x: width - MARGIN - 50,
    y: yPos - 12,
    size: 9,
    font: helv,
    color: COLORS.textMuted,
  });
  yPos -= 36;

  // Thin accent bar (1px) under the header.
  page.drawRectangle({
    x: MARGIN,
    y: yPos,
    width: contentWidth,
    height: 1,
    color: brand.primary,
  });
  yPos -= 26;

  // PERSONAL INFORMATION
  drawSectionHeader(page, "PERSONAL INFORMATION", MARGIN, yPos, helvBold, brand);
  yPos -= 22;

  yPos = drawFieldRow(
    page,
    "Legal Name",
    `${data.legalFirstName ?? ""} ${data.legalLastName ?? ""}`.trim() || "—",
    MARGIN,
    yPos,
    helv,
    helvBold,
  );
  if (data.preferredName) {
    yPos = drawFieldRow(
      page,
      "Preferred Name",
      data.preferredName,
      MARGIN,
      yPos,
      helv,
      helvBold,
    );
  }
  yPos = drawFieldRow(page, "Email", data.email, MARGIN, yPos, helv, helvBold);
  if (data.phone) {
    yPos = drawFieldRow(page, "Phone", data.phone, MARGIN, yPos, helv, helvBold);
  }
  const loc = locParts || null;
  if (loc) {
    yPos = drawFieldRow(page, "Location", loc, MARGIN, yPos, helv, helvBold);
  }
  yPos -= 18;

  // INVESTMENT PLANS
  drawSectionHeader(page, "INVESTMENT PLANS", MARGIN, yPos, helvBold, brand);
  yPos -= 22;

  if (data.openingTimeline) {
    yPos = drawFieldRow(
      page,
      "Timeline",
      data.openingTimeline,
      MARGIN,
      yPos,
      helv,
      helvBold,
    );
  }
  if (data.involvementLevel) {
    yPos = drawFieldRow(
      page,
      "Involvement",
      data.involvementLevel,
      MARGIN,
      yPos,
      helv,
      helvBold,
    );
  }
  if (data.growthPlan) {
    yPos = drawFieldRow(
      page,
      "Growth Plan",
      data.growthPlan,
      MARGIN,
      yPos,
      helv,
      helvBold,
    );
  }
  if (data.creditScore) {
    yPos = drawFieldRow(
      page,
      "Credit Score",
      data.creditScore,
      MARGIN,
      yPos,
      helv,
      helvBold,
    );
  }

  // Motivations on page 2: list form rather than chips so the deep
  // dive reads document-style.
  if (data.motivationChips && data.motivationChips.length > 0) {
    yPos -= 4;
    page.drawText("Motivations", {
      x: MARGIN,
      y: yPos,
      size: 10,
      font: helvBold,
      color: COLORS.textMuted,
    });
    let chipY = yPos;
    for (const chip of data.motivationChips) {
      page.drawText(safe(chip), {
        x: MARGIN + 130,
        y: chipY,
        size: 10,
        font: helv,
        color: COLORS.textDark,
      });
      chipY -= 14;
    }
    yPos = chipY;
  }
  yPos -= 18;

  // BACKGROUND
  drawSectionHeader(page, "BACKGROUND", MARGIN, yPos, helvBold, brand);
  yPos -= 22;
  yPos = drawFieldRow(
    page,
    "Bankruptcy",
    boolToYesNo(data.hasBankruptcy),
    MARGIN,
    yPos,
    helv,
    helvBold,
  );
  yPos = drawFieldRow(
    page,
    "Felony",
    boolToYesNo(data.hasFelony),
    MARGIN,
    yPos,
    helv,
    helvBold,
  );

  drawFooter(page, data.brandName, pageNumber, helv);

  // ---------- Page 3 (conditional): Explanations + Brand-Specific ----------

  const hasBankruptcyExplanation =
    data.hasBankruptcy === true &&
    data.bankruptcyExplanation &&
    data.bankruptcyExplanation.trim().length > 0;
  const hasFelonyExplanation =
    data.hasFelony === true &&
    data.felonyExplanation &&
    data.felonyExplanation.trim().length > 0;
  const hasClosing =
    data.closingQuestion && data.closingQuestion.trim().length > 0;

  if (hasBankruptcyExplanation || hasFelonyExplanation || hasClosing) {
    pageNumber += 1;
    page = pdfDoc.addPage(PageSizes.Letter);
    ({ width, height } = page.getSize());
    yPos = height - MARGIN;

    // Same header shape as page 2.
    if (logo) {
      const headerH = 22;
      const headerW = Math.min(headerH * (logo.width / logo.height), 140);
      page.drawImage(logo, {
        x: MARGIN,
        y: yPos - headerH,
        width: headerW,
        height: headerH,
      });
    } else {
      page.drawText(safe(data.brandName), {
        x: MARGIN,
        y: yPos - 12,
        size: 11,
        font: helvBold,
        color: brand.primary,
      });
    }
    page.drawText(`Page ${pageNumber}`, {
      x: width - MARGIN - 50,
      y: yPos - 12,
      size: 9,
      font: helv,
      color: COLORS.textMuted,
    });
    yPos -= 36;
    page.drawRectangle({
      x: MARGIN,
      y: yPos,
      width: contentWidth,
      height: 1,
      color: brand.primary,
    });
    yPos -= 26;

    if (hasBankruptcyExplanation) {
      drawSectionHeader(
        page,
        "BANKRUPTCY EXPLANATION",
        MARGIN,
        yPos,
        helvBold,
        brand,
      );
      yPos -= 22;
      yPos = drawParagraph(
        page,
        data.bankruptcyExplanation!,
        MARGIN,
        yPos,
        contentWidth,
        helv,
        COLORS.textDark,
      );
      yPos -= 16;
    }

    if (hasFelonyExplanation) {
      drawSectionHeader(
        page,
        "FELONY EXPLANATION",
        MARGIN,
        yPos,
        helvBold,
        brand,
      );
      yPos -= 22;
      yPos = drawParagraph(
        page,
        data.felonyExplanation!,
        MARGIN,
        yPos,
        contentWidth,
        helv,
        COLORS.textDark,
      );
      yPos -= 16;
    }

    if (hasClosing) {
      drawSectionHeader(
        page,
        "BRAND-SPECIFIC RESPONSE",
        MARGIN,
        yPos,
        helvBold,
        brand,
      );
      yPos -= 22;
      yPos = drawParagraph(
        page,
        data.closingQuestion!,
        MARGIN,
        yPos,
        contentWidth,
        helv,
        COLORS.textDark,
      );
    }

    drawFooter(page, data.brandName, pageNumber, helv);
  }

  return pdfDoc.save();
}

// ---------- drawing helpers ----------

function drawDivider(page: PDFPage, x1: number, y: number, x2: number) {
  page.drawLine({
    start: { x: x1, y },
    end: { x: x2, y },
    thickness: 0.5,
    color: COLORS.divider,
  });
}

function drawColumnLabel(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  bold: PDFFont,
) {
  page.drawText(safe(text), {
    x,
    y,
    size: 9,
    font: bold,
    color: COLORS.textMuted,
  });
}

function drawSectionHeader(
  page: PDFPage,
  title: string,
  x: number,
  y: number,
  bold: PDFFont,
  brand: { primary: RGB },
) {
  page.drawText(safe(title), {
    x,
    y,
    size: 14,
    font: bold,
    color: brand.primary,
  });
  // Short underline tying the title to the brand color — about 100px
  // wide regardless of title length so the rule reads as a tag, not
  // an underline of the words.
  page.drawLine({
    start: { x, y: y - 6 },
    end: { x: x + 100, y: y - 6 },
    thickness: 1,
    color: brand.primary,
  });
}

function drawFieldRow(
  page: PDFPage,
  label: string,
  value: string | null | undefined,
  x: number,
  y: number,
  font: PDFFont,
  bold: PDFFont,
): number {
  const v = value && value.trim().length > 0 ? value : "—";
  page.drawText(safe(label), {
    x,
    y,
    size: 10,
    font: bold,
    color: COLORS.textMuted,
  });
  page.drawText(safe(v), {
    x: x + 130,
    y,
    size: 10,
    font,
    color: COLORS.textDark,
  });
  return y - 16;
}

function drawStatCard(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  value: string,
  font: PDFFont,
  bold: PDFFont,
  brand: { primary: RGB },
) {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    color: COLORS.cardBg,
    borderColor: COLORS.divider,
    borderWidth: 0.5,
  });
  page.drawText(safe(label), {
    x: x + 12,
    y: y + height - 18,
    size: 8,
    font: bold,
    color: COLORS.textMuted,
  });
  // Auto-shrink the value to fit the card width so a wide bucket
  // string ("$1M - $2M") doesn't blow past the card boundary.
  const innerWidth = width - 24;
  let valueSize = 16;
  while (
    valueSize > 9 &&
    bold.widthOfTextAtSize(safe(value), valueSize) > innerWidth
  ) {
    valueSize -= 1;
  }
  page.drawText(safe(value), {
    x: x + 12,
    y: y + height - 50,
    size: valueSize,
    font: bold,
    color: brand.primary,
  });
}

function drawChipRow(
  page: PDFPage,
  chips: string[],
  x: number,
  y: number,
  contentWidth: number,
  font: PDFFont,
  brand: { primary: RGB },
): number {
  const padX = 8;
  const padY = 4;
  const fontSize = 9;
  const gap = 6;
  const chipHeight = fontSize + padY * 2 + 2;

  let cursorX = x;
  let cursorY = y;
  const right = x + contentWidth;

  for (const chip of chips) {
    const text = safe(chip);
    const textWidth = font.widthOfTextAtSize(text, fontSize);
    const chipWidth = textWidth + padX * 2;

    if (cursorX + chipWidth > right) {
      cursorX = x;
      cursorY -= chipHeight + gap;
    }

    page.drawRectangle({
      x: cursorX,
      y: cursorY - chipHeight + 4,
      width: chipWidth,
      height: chipHeight,
      color: COLORS.cardBg,
      borderColor: brand.primary,
      borderWidth: 0.5,
    });
    page.drawText(text, {
      x: cursorX + padX,
      y: cursorY - chipHeight + padY + 6,
      size: fontSize,
      font,
      color: COLORS.textDark,
    });

    cursorX += chipWidth + gap;
  }

  return cursorY - chipHeight - 6;
}

function drawParagraph(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  contentWidth: number,
  font: PDFFont,
  color: RGB,
): number {
  const lines = wrapText(text, font, 10, contentWidth);
  let yPos = y;
  for (const line of lines) {
    page.drawText(safe(line), {
      x,
      y: yPos,
      size: 10,
      font,
      color,
    });
    yPos -= 14;
  }
  return yPos;
}

function drawFooter(
  page: PDFPage,
  brandName: string,
  pageNumber: number,
  font: PDFFont,
) {
  const text = safe(`${brandName} Application  |  Page ${pageNumber}`);
  const textWidth = font.widthOfTextAtSize(text, 8);
  const { width } = page.getSize();
  page.drawText(text, {
    x: (width - textWidth) / 2,
    y: FOOTER_BASELINE_Y,
    size: 8,
    font,
    color: COLORS.textMuted,
  });
}

// ---------- text helpers ----------

function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const words = safe(text).split(/\s+/).filter(Boolean);
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

function truncate(s: string, maxChars: number): string {
  const trimmed = s.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return trimmed.slice(0, maxChars - 1).trimEnd() + "\u2026";
}

function boolToYesNo(v: boolean | null | undefined): string {
  if (v === true) return "Yes";
  if (v === false) return "No";
  return "—";
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "America/New_York",
  });
}
