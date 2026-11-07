/**
 * Finds the main colours in an image's pixels (RGBA, as from canvas getImageData).
 * Pixels are grouped into coarse colour buckets, buckets are ranked by how much
 * of the image they cover, and near-duplicates are merged, so a logo's few flat
 * colours come out cleanly and photos give their dominant tones.
 */
import { rgbToHex } from "@stella/brand-schema";

export type ExtractedColor = { hex: string; share: number };

export function extractColors(pixels: Uint8ClampedArray, maxColors = 6, minDistance = 48): ExtractedColor[] {
  const buckets = new Map<number, { r: number; g: number; b: number; n: number }>();
  let total = 0;
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3]! < 128) continue; // skip transparent pixels (logo backgrounds)
    const r = pixels[i]!;
    const g = pixels[i + 1]!;
    const b = pixels[i + 2]!;
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      bucket.n++;
    } else {
      buckets.set(key, { r, g, b, n: 1 });
    }
    total++;
  }
  if (!total) return [];

  const ranked = [...buckets.values()]
    .map((x) => ({ r: x.r / x.n, g: x.g / x.n, b: x.b / x.n, n: x.n }))
    .sort((a, b) => b.n - a.n);

  const picked: Array<{ r: number; g: number; b: number; n: number }> = [];
  for (const c of ranked) {
    const near = picked.find((p) => Math.hypot(p.r - c.r, p.g - c.g, p.b - c.b) < minDistance);
    if (near) {
      near.n += c.n; // fold small variations (anti-aliasing, noise) into the main colour
      continue;
    }
    if (picked.length < maxColors && c.n / total >= 0.005) picked.push({ ...c });
  }

  return picked
    .sort((a, b) => b.n - a.n)
    .map((c) => ({
      hex: rgbToHex({ r: Math.round(c.r), g: Math.round(c.g), b: Math.round(c.b) }),
      share: c.n / total,
    }));
}

/** Reads an image file in the browser (never uploaded) and returns its main colours. */
export async function extractFromFile(file: File, maxColors = 6): Promise<ExtractedColor[]> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    const scale = Math.min(1, 240 / Math.max(img.naturalWidth || 240, img.naturalHeight || 240));
    const w = Math.max(1, Math.round((img.naturalWidth || 240) * scale));
    const h = Math.max(1, Math.round((img.naturalHeight || 240) * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("This browser can't read image pixels");
    ctx.drawImage(img, 0, 0, w, h);
    return extractColors(ctx.getImageData(0, 0, w, h).data, maxColors);
  } finally {
    URL.revokeObjectURL(url);
  }
}
