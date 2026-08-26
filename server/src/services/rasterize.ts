import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

const TARGET_LONG_EDGE = 1600;

function isPdf(mimeType: string, buffer: Buffer): boolean {
  const mime = mimeType.toLowerCase();
  if (mime.includes("pdf")) return true;
  return buffer.subarray(0, 5).toString("latin1") === "%PDF-";
}

async function normalizeImage(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .resize({
      width: TARGET_LONG_EDGE,
      height: TARGET_LONG_EDGE,
      fit: "inside",
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();
}

async function scaleForPdf(buffer: Buffer): Promise<number> {
  try {
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    let maxLongEdge = 0;
    for (const page of doc.getPages()) {
      const { width, height } = page.getSize();
      maxLongEdge = Math.max(maxLongEdge, width, height);
    }
    if (maxLongEdge <= 0) return 2;
    return TARGET_LONG_EDGE / maxLongEdge;
  } catch {
    return 2;
  }
}

async function rasterizePdf(buffer: Buffer): Promise<Buffer[]> {
  const { pdf } = await import("pdf-to-img");
  const scale = await scaleForPdf(buffer);
  const document = await pdf(buffer, { scale });
  try {
    const pages: Buffer[] = [];
    for await (const image of document) {
      pages.push(await normalizeImage(image));
    }
    if (pages.length === 0) {
      throw new Error("PDF produced no pages");
    }
    return pages;
  } finally {
    await document.destroy();
  }
}

export async function rasterizeFile(
  buffer: Buffer,
  mimeType: string
): Promise<Buffer[]> {
  if (buffer.length === 0) {
    throw new Error("Empty file");
  }
  if (isPdf(mimeType, buffer)) {
    return rasterizePdf(buffer);
  }
  try {
    return [await normalizeImage(buffer)];
  } catch {
    throw new Error(`Unsupported file type: ${mimeType || "unknown"}`);
  }
}
