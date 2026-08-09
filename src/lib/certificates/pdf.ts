import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import {
  PDFDocument,
  PDFPage,
  PDFFont,
  PageSizes,
  StandardFonts,
  rgb,
} from "pdf-lib";

interface CertificatePdfInput {
  certificateNo: string;
  certificateTitle: string | null;
  courseTitle: string;
  learnerName: string;
  scorePercentage: number;
  passPercentage: number;
  issuedAt: Date;
}

interface FontRun {
  text: string;
  font: PDFFont;
}

function splitFontRuns(text: string, latinFont: PDFFont, thaiFont: PDFFont): FontRun[] {
  const runs: FontRun[] = [];
  for (const character of text) {
    const font = /[\u0E00-\u0E7F]/.test(character) ? thaiFont : latinFont;
    const previous = runs.at(-1);
    if (previous?.font === font) previous.text += character;
    else runs.push({ text: character, font });
  }
  return runs;
}

function drawCenteredText(
  page: PDFPage,
  text: string,
  y: number,
  size: number,
  latinFont: PDFFont,
  thaiFont: PDFFont,
  color = rgb(0.06, 0.11, 0.24)
): void {
  const runs = splitFontRuns(text, latinFont, thaiFont);
  const width = runs.reduce((sum, run) => sum + run.font.widthOfTextAtSize(run.text, size), 0);
  let x = (page.getWidth() - width) / 2;
  for (const run of runs) {
    page.drawText(run.text, { x, y, size, font: run.font, color });
    x += run.font.widthOfTextAtSize(run.text, size);
  }
}

function mixedTextWidth(text: string, size: number, latinFont: PDFFont, thaiFont: PDFFont): number {
  return splitFontRuns(text, latinFont, thaiFont).reduce(
    (sum, run) => sum + run.font.widthOfTextAtSize(run.text, size),
    0
  );
}

function fitSize(
  text: string,
  latinFont: PDFFont,
  thaiFont: PDFFont,
  maxWidth: number,
  preferred: number,
  minimum: number
): number {
  let size = preferred;
  while (size > minimum && mixedTextWidth(text, size, latinFont, thaiFont) > maxWidth) size -= 1;
  return size;
}

export async function generateCertificatePdf(input: CertificatePdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);

  const thaiFontPath = join(
    process.cwd(),
    "node_modules",
    "@fontsource",
    "noto-sans-thai",
    "files",
    "noto-sans-thai-thai-400-normal.woff"
  );
  const thaiFontBytes = await readFile(thaiFontPath);
  const [regular, bold, thai] = await Promise.all([
    pdf.embedFont(StandardFonts.Helvetica),
    pdf.embedFont(StandardFonts.HelveticaBold),
    pdf.embedFont(thaiFontBytes, { subset: true }),
  ]);

  const page = pdf.addPage([PageSizes.A4[1], PageSizes.A4[0]]);
  const width = page.getWidth();
  const height = page.getHeight();
  const navy = rgb(0.06, 0.11, 0.24);
  const orange = rgb(1, 0.35, 0.24);
  const muted = rgb(0.36, 0.4, 0.5);

  page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(0.985, 0.98, 0.95) });
  page.drawRectangle({ x: 24, y: 24, width: width - 48, height: height - 48, borderColor: navy, borderWidth: 3 });
  page.drawRectangle({ x: 34, y: 34, width: width - 68, height: height - 68, borderColor: orange, borderWidth: 1 });
  page.drawCircle({ x: 72, y: height - 72, size: 24, color: navy });
  page.drawCircle({ x: width - 72, y: 72, size: 24, color: orange });

  drawCenteredText(page, "INTERACT EDU", height - 82, 14, bold, thai, orange);
  drawCenteredText(
    page,
    input.certificateTitle?.trim() || "Certificate of Completion",
    height - 142,
    30,
    bold,
    thai,
    navy
  );
  drawCenteredText(page, "This certificate is proudly presented to", height - 190, 12, regular, thai, muted);

  const learnerSize = fitSize(input.learnerName, bold, thai, width - 160, 28, 18);
  drawCenteredText(page, input.learnerName, height - 238, learnerSize, bold, thai, navy);
  page.drawLine({ start: { x: 160, y: height - 250 }, end: { x: width - 160, y: height - 250 }, thickness: 1, color: orange });

  drawCenteredText(page, "for successfully completing the course and its post-assessments", height - 286, 12, regular, thai, muted);
  const courseSize = fitSize(input.courseTitle, bold, thai, width - 160, 21, 14);
  drawCenteredText(page, input.courseTitle, height - 326, courseSize, bold, thai, navy);

  drawCenteredText(
    page,
    `Final score ${input.scorePercentage.toFixed(2)}%  |  Passing score ${input.passPercentage.toFixed(2)}%`,
    height - 370,
    11,
    regular,
    thai,
    muted
  );

  const issuedDate = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(input.issuedAt);

  page.drawText("ISSUED", { x: 86, y: 116, size: 8, font: bold, color: muted });
  page.drawText(issuedDate, { x: 86, y: 97, size: 11, font: regular, color: navy });
  page.drawText("CERTIFICATE NO.", { x: width - 285, y: 116, size: 8, font: bold, color: muted });
  page.drawText(input.certificateNo, { x: width - 285, y: 97, size: 10, font: regular, color: navy });

  drawCenteredText(page, "Interact Edu", 88, 13, bold, thai, navy);
  drawCenteredText(page, "Authorized learning platform", 70, 8, regular, thai, muted);
  drawCenteredText(
    page,
    "This document certifies course completion only and is not a government driving licence.",
    46,
    7.5,
    regular,
    thai,
    muted
  );

  pdf.setTitle(`${input.certificateNo} - ${input.courseTitle}`);
  pdf.setAuthor("Interact Edu");
  pdf.setSubject("Certificate of Completion");
  pdf.setCreationDate(input.issuedAt);

  return pdf.save();
}
