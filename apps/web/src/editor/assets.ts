/**
 * Asset commands. Uploading happens first (in the browser, straight to private
 * storage); the asset row is then saved like any other draft change.
 *
 * Deleting an asset removes it from the library and from every block that used
 * it. The stored file is kept: a published version may still show it, and
 * removing it would break a live guide.
 */
import { byPosition, type DraftOp } from "@stella/brand-schema";
import type { AssetCategory, AssetRow, Draft, FontFileRow, NewId, Result } from "./model";

const defaultNewId: NewId = () => crypto.randomUUID();

export const ASSET_CATEGORIES: Array<{ key: AssetCategory; label: string }> = [
  { key: "logo", label: "Logos" },
  { key: "illustration", label: "Illustrations" },
  { key: "pattern", label: "Patterns" },
  { key: "icon", label: "Icons" },
  { key: "photography", label: "Photography" },
  { key: "video", label: "Video" },
  { key: "mockup", label: "Mockups" },
  { key: "font", label: "Fonts" },
  { key: "other", label: "Other files" },
];

export const MAX_UPLOAD_MB = 50; // Supabase per-file limit on the free plan; plans may set a lower limit.

export function isImage(a: Pick<AssetRow, "mime">): boolean {
  return a.mime.startsWith("image/");
}
export function isVideo(a: Pick<AssetRow, "mime">): boolean {
  return a.mime.startsWith("video/");
}
export function isFont(a: Pick<AssetRow, "mime" | "name">): boolean {
  return /font|woff|ttf|otf/i.test(a.mime) || /\.(woff2?|ttf|otf)$/i.test(a.name);
}

export function guessCategory(file: { type: string; name: string }): AssetCategory {
  if (/\.(woff2?|ttf|otf)$/i.test(file.name) || /font/.test(file.type)) return "font";
  if (file.type.startsWith("video/")) return "video";
  if (/logo|wordmark|lockup|brandmark/i.test(file.name)) return "logo";
  if (/pattern/i.test(file.name)) return "pattern";
  if (/icon/i.test(file.name)) return "icon";
  if (/mockup/i.test(file.name)) return "mockup";
  if (file.type === "image/svg+xml") return "illustration";
  if (file.type.startsWith("image/")) return "photography";
  return "other";
}

/** Storage-safe filename that keeps the extension and stays readable. */
export function safeFileName(input: string): string {
  // Drop any path parts and leading dots before anything else.
  const name = (input.split(/[\\/]/).pop() ?? "").replace(/^\.+/, "");
  const dot = name.lastIndexOf(".");
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "file";
  const ext = dot > 0 ? name.slice(dot + 1).replace(/[^a-zA-Z0-9]/g, "").slice(0, 10).toLowerCase() : "";
  return ext ? `${base}.${ext}` : base;
}

export function storagePathFor(brandId: string, assetId: string, fileName: string): string {
  return `${brandId}/${assetId}/${safeFileName(fileName)}`;
}

export function libraryAssets(draft: Draft, category: AssetCategory | "all" = "all"): AssetRow[] {
  return Object.values(draft.assets)
    .filter((a) => category === "all" || a.category === category)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function addAsset(draft: Draft, row: AssetRow): Result {
  return {
    draft: { ...draft, assets: { ...draft.assets, [row.id]: row } },
    ops: [{ op: "upsert", table: "assets", row: { ...row } }],
    created: row.id,
  };
}

export function updateAsset(draft: Draft, id: string, patch: Partial<Pick<AssetRow, "name" | "category" | "client_visible">>): Result {
  const current = draft.assets[id];
  if (!current) return { draft, ops: [] };
  const clean = { ...patch };
  if (clean.name !== undefined) clean.name = clean.name.trim().slice(0, 200) || current.name;
  return {
    draft: { ...draft, assets: { ...draft.assets, [id]: { ...current, ...clean } } },
    ops: [{ op: "upsert", table: "assets", row: { id, ...clean } }],
  };
}

/** Blocks that reference an asset, with props cleaned of it. */
function blocksWithoutAsset(draft: Draft, assetId: string) {
  const changed: Array<{ id: string; type: string; props: Record<string, unknown> }> = [];
  for (const b of Object.values(draft.blocks)) {
    const p = b.props;
    if ((b.type === "image" || b.type === "video") && p.assetId === assetId) {
      changed.push({ id: b.id, type: b.type, props: { ...p, assetId: null } });
    } else if ((b.type === "gallery" || b.type === "file_download") && ((p.assetIds as string[]) ?? []).includes(assetId)) {
      changed.push({ id: b.id, type: b.type, props: { ...p, assetIds: (p.assetIds as string[]).filter((x) => x !== assetId) } });
    } else if (b.type === "dos_donts") {
      const items = (p.items as Array<{ assetId: string | null }>) ?? [];
      if (items.some((i) => i.assetId === assetId)) {
        changed.push({ id: b.id, type: b.type, props: { ...p, items: items.map((i) => (i.assetId === assetId ? { ...i, assetId: null } : i)) } });
      }
    }
  }
  return changed;
}

export function assetUsage(draft: Draft, assetId: string): number {
  const fonts = Object.values(draft.fontFiles).filter((f) => f.asset_id === assetId).length;
  return blocksWithoutAsset(draft, assetId).length + fonts;
}

export function deleteAsset(draft: Draft, id: string): Result {
  if (!draft.assets[id]) return { draft, ops: [] };
  const assets = { ...draft.assets };
  delete assets[id];
  const blocks = { ...draft.blocks };
  const ops: DraftOp[] = [];
  for (const b of blocksWithoutAsset(draft, id)) {
    blocks[b.id] = { ...blocks[b.id]!, props: b.props };
    ops.push({ op: "upsert", table: "blocks", row: { id: b.id, type: b.type, props: b.props } });
  }
  // Font files that point at this asset are removed by the database (cascade).
  const removedFonts = Object.values(draft.fontFiles).filter((f) => f.asset_id === id);
  const fontFiles = Object.fromEntries(Object.entries(draft.fontFiles).filter(([, f]) => f.asset_id !== id));
  ops.push({ op: "delete", table: "assets", row: { id } });
  return {
    draft: { ...draft, assets, blocks, fontFiles },
    ops,
    drop: removedFonts.map((f) => `font_files:${f.id}`),
  };
}

// ---------------------------------------------------------------------------
// Uploaded font files
// ---------------------------------------------------------------------------

export function familyFontFiles(draft: Draft, familyId: string): FontFileRow[] {
  return Object.values(draft.fontFiles)
    .filter((f) => f.family_id === familyId)
    .sort((a, b) => a.weight - b.weight || a.style.localeCompare(b.style));
}

export function addFontFile(
  draft: Draft,
  input: { family_id: string; asset_id: string; weight: number; style: "normal" | "italic" },
  newId: NewId = defaultNewId,
): Result {
  if (!draft.families[input.family_id]) return { draft, ops: [], error: "Unknown typeface" };
  if (!draft.assets[input.asset_id]) return { draft, ops: [], error: "Upload the font file first" };
  const weight = Math.max(100, Math.min(900, Math.round(input.weight / 100) * 100));
  const clash = familyFontFiles(draft, input.family_id).find((f) => f.weight === weight && f.style === input.style);
  if (clash) return { draft, ops: [], error: `This typeface already has a ${weight} ${input.style} file. Remove it first.` };
  const id = newId();
  const row: FontFileRow = { id, family_id: input.family_id, asset_id: input.asset_id, weight, style: input.style };
  return {
    draft: { ...draft, fontFiles: { ...draft.fontFiles, [id]: row } },
    ops: [{ op: "upsert", table: "font_files", row: { ...row } }],
    created: id,
  };
}

export function deleteFontFile(draft: Draft, id: string): Result {
  if (!draft.fontFiles[id]) return { draft, ops: [] };
  const fontFiles = { ...draft.fontFiles };
  delete fontFiles[id];
  return { draft: { ...draft, fontFiles }, ops: [{ op: "delete", table: "font_files", row: { id } }] };
}

/** Guess weight and style from a font file name like "Fraunces-SemiBoldItalic.woff2". */
export function guessFontWeight(fileName: string): { weight: number; style: "normal" | "italic" } {
  const n = fileName.toLowerCase().replace(/[\s_-]/g, "");
  const style = /italic|oblique/.test(n) ? "italic" : "normal";
  const table: Array<[RegExp, number]> = [
    [/thin|hairline/, 100],
    [/extralight|ultralight/, 200],
    [/light/, 300],
    [/medium/, 500],
    [/semibold|demibold/, 600],
    [/extrabold|ultrabold/, 800],
    [/black|heavy/, 900],
    [/bold/, 700],
  ];
  for (const [re, w] of table) if (re.test(n)) return { weight: w, style };
  return { weight: 400, style };
}

export const sortByPosition = byPosition;
