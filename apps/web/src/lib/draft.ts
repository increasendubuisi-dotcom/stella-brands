import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SnapshotInput } from "@stella/brand-schema";
import type { AssetRow, BlockRow, ColorRow, Draft, FamilyRow, FontFileRow, SectionRow, StrategyRow, StyleRow } from "@/editor/model";

export const ASSET_BUCKET = "brand-assets";

export type DraftBrand = {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  description: string | null;
  website_url: string | null;
  status: string;
  draft_rev: number;
  theme_key: string;
};

const byId = <T extends { id: string }>(rows: T[]) => Object.fromEntries(rows.map((r) => [r.id, r]));

/** Loads a brand's whole draft as the signed-in user (row-level security applies). */
export async function loadDraft(supabase: SupabaseClient, brandId: string): Promise<{ brand: DraftBrand; draft: Draft } | null> {
  const { data: brand } = await supabase
    .from("brands")
    .select("id, workspace_id, name, slug, description, website_url, status, draft_rev, theme_key")
    .eq("id", brandId)
    .maybeSingle();
  if (!brand) return null;

  const q = (table: string, cols: string) => supabase.from(table).select(cols).eq("brand_id", brandId);
  const results = await Promise.all([
    q("sections", "id, parent_id, title, slug, position, hidden, template_key"),
    q("blocks", "id, section_id, parent_block_id, type, position, props, layout"),
    q("strategy_fields", "key, value, status, source"),
    q("color_tokens", "id, name, hex, cmyk_override, pantone, color_group, position"),
    q("type_families", "id, name, source, role, fallback, licence_note, downloadable"),
    q("type_styles", "id, name, family_id, weight, size, line_height, tracking, text_transform, position"),
    q("assets", "id, category, name, storage_path, mime, size, width, height, client_visible"),
    q("font_files", "id, family_id, weight, style, asset_id"),
  ]);
  const failed = results.find((r) => r.error)?.error;
  if (failed) throw new Error(`Could not load this guide: ${failed.message}`);
  const [sections, blocks, strategy, colors, families, styles, assets, fontFiles] = results.map((r) => r.data ?? []);

  const draft: Draft = {
    sections: byId(sections as unknown as SectionRow[]),
    blocks: byId(blocks as unknown as BlockRow[]),
    strategy: Object.fromEntries((strategy as unknown as StrategyRow[]).map((s) => [s.key, s])),
    colors: byId(colors as unknown as ColorRow[]),
    families: byId(families as unknown as FamilyRow[]),
    // Postgres numeric and bigint columns can arrive as strings; the editor works in numbers.
    styles: byId(
      (styles as unknown as StyleRow[]).map((s) => ({ ...s, size: Number(s.size), line_height: Number(s.line_height), tracking: Number(s.tracking) })),
    ),
    assets: byId((assets as unknown as AssetRow[]).map((a) => ({ ...a, size: Number(a.size) }))),
    fontFiles: byId(fontFiles as unknown as FontFileRow[]),
  };
  return { brand: { ...brand, draft_rev: Number(brand.draft_rev) } as DraftBrand, draft };
}

/** Maps the editor's draft (database rows) to the snapshot builder's input. */
export function snapshotInput(brand: DraftBrand, draft: Draft): SnapshotInput {
  return {
    brand: { id: brand.id, name: brand.name, slug: brand.slug, description: brand.description },
    theme: { key: brand.theme_key },
    sections: Object.values(draft.sections).map((s) => ({
      id: s.id,
      brandId: brand.id,
      parentId: s.parent_id,
      title: s.title,
      slug: s.slug,
      position: s.position,
      hidden: s.hidden,
      templateKey: s.template_key,
    })),
    blocks: Object.values(draft.blocks).map((b) => ({
      id: b.id,
      sectionId: b.section_id,
      parentBlockId: b.parent_block_id,
      type: b.type,
      position: b.position,
      props: b.props,
      layout: { width: b.layout?.width ?? "wide", span: b.layout?.span ?? 1 },
      origin: "manual",
      schemaVersion: 1,
    })),
    colors: Object.values(draft.colors).map((c) => ({
      id: c.id,
      brandId: brand.id,
      name: c.name,
      hex: c.hex,
      cmykOverride: c.cmyk_override,
      pantone: c.pantone,
      group: c.color_group,
      position: c.position,
    })),
    typeFamilies: Object.values(draft.families).map((f) => ({
      id: f.id,
      brandId: brand.id,
      name: f.name,
      source: f.source,
      role: f.role,
      fallback: f.fallback,
      licenceNote: f.licence_note,
      downloadable: f.downloadable,
    })),
    fontFiles: Object.values(draft.fontFiles).map((f) => ({ id: f.id, familyId: f.family_id, weight: f.weight, style: f.style, assetId: f.asset_id })),
    typeStyles: Object.values(draft.styles).map((s) => ({
      id: s.id,
      brandId: brand.id,
      name: s.name,
      familyId: s.family_id,
      weight: s.weight,
      size: s.size,
      lineHeight: s.line_height,
      tracking: s.tracking,
      textTransform: s.text_transform,
      position: s.position,
    })),
    strategy: Object.values(draft.strategy)
      .filter((s): s is StrategyRow => Boolean(s))
      .map((s) => ({ brandId: brand.id, key: s.key, value: s.value, status: s.status, source: s.source })),
    assets: Object.values(draft.assets).map((a) => ({
      id: a.id,
      brandId: brand.id,
      category: a.category,
      name: a.name,
      storagePath: a.storage_path,
      mime: a.mime,
      size: a.size,
      width: a.width,
      height: a.height,
      clientVisible: a.client_visible,
    })),
  };
}

/**
 * Short-lived URLs for private files, keyed by storage path. With the user's
 * client, storage policies decide what they may see; with the admin client the
 * caller must already have checked access.
 */
export async function signPaths(client: SupabaseClient, paths: string[], expiresIn = 60 * 60 * 6, download = false): Promise<Record<string, string>> {
  const unique = [...new Set(paths)].filter(Boolean);
  if (!unique.length) return {};
  const out: Record<string, string> = {};
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    const { data, error } = await client.storage.from(ASSET_BUCKET).createSignedUrls(chunk, expiresIn, download ? { download: true } : undefined);
    if (error) throw new Error(`Could not prepare files: ${error.message}`);
    for (const item of data ?? []) if (item.path && item.signedUrl) out[item.path] = item.signedUrl;
  }
  return out;
}
