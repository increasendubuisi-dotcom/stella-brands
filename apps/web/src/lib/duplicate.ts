import { MAX_OPS_PER_SAVE, type DraftOp } from "@stella/brand-schema";
import type { Draft } from "@/editor/model";

/**
 * Plans a copy of a brand's whole draft into a new, empty brand.
 *
 * Every row gets a new id, and every reference to an old id (parent sections,
 * parent blocks, colour/type/asset ids inside block props, font files) is
 * rewritten to the new id, so the copy shares nothing with the original.
 * Asset rows point at new storage paths; the caller copies the files first.
 *
 * Ops are ordered so foreign keys always resolve: assets, colours, typefaces,
 * font files, type styles, strategy, then sections and blocks parents-first.
 */
export type DuplicatePlan = {
  ops: DraftOp[];
  /** Storage objects to copy before applying the ops. */
  copies: Array<{ from: string; to: string }>;
};

export function planDuplicate(draft: Draft, newBrandId: string, newId: () => string = () => crypto.randomUUID()): DuplicatePlan {
  const map = new Map<string, string>();
  const remap = (id: string) => {
    let next = map.get(id);
    if (!next) {
      next = newId();
      map.set(id, next);
    }
    return next;
  };
  for (const group of [draft.sections, draft.blocks, draft.colors, draft.families, draft.styles, draft.assets, draft.fontFiles]) {
    for (const id of Object.keys(group)) remap(id);
  }

  // Rewrites any string that is exactly an old id; ids only ever appear as whole strings.
  const rewrite = (value: unknown): unknown => {
    if (typeof value === "string") return map.get(value) ?? value;
    if (Array.isArray(value)) return value.map(rewrite);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewrite(v)]));
    return value;
  };
  const ref = (id: string | null) => (id ? (map.get(id) ?? null) : null);

  const ops: DraftOp[] = [];
  const copies: DuplicatePlan["copies"] = [];
  const upsert = (table: DraftOp["table"], row: Record<string, unknown>) => ops.push({ op: "upsert", table, row });

  for (const a of Object.values(draft.assets)) {
    const id = map.get(a.id)!;
    const filename = a.storage_path.split("/").pop() || "file";
    const to = `${newBrandId}/${id}/${filename}`;
    copies.push({ from: a.storage_path, to });
    upsert("assets", {
      id,
      category: a.category,
      name: a.name,
      storage_path: to,
      mime: a.mime,
      size: a.size,
      width: a.width,
      height: a.height,
      client_visible: a.client_visible,
    });
  }
  for (const c of Object.values(draft.colors)) {
    upsert("color_tokens", { id: map.get(c.id), name: c.name, hex: c.hex, cmyk_override: c.cmyk_override, pantone: c.pantone, color_group: c.color_group, position: c.position });
  }
  for (const f of Object.values(draft.families)) {
    upsert("type_families", { id: map.get(f.id), name: f.name, source: f.source, role: f.role, fallback: f.fallback, licence_note: f.licence_note, downloadable: f.downloadable });
  }
  for (const f of Object.values(draft.fontFiles)) {
    if (!map.has(f.asset_id) || !map.has(f.family_id)) continue;
    upsert("font_files", { id: map.get(f.id), family_id: map.get(f.family_id), weight: f.weight, style: f.style, asset_id: map.get(f.asset_id) });
  }
  for (const s of Object.values(draft.styles)) {
    if (!map.has(s.family_id)) continue;
    upsert("type_styles", {
      id: map.get(s.id),
      name: s.name,
      family_id: map.get(s.family_id),
      weight: s.weight,
      size: s.size,
      line_height: s.line_height,
      tracking: s.tracking,
      text_transform: s.text_transform,
      position: s.position,
    });
  }
  for (const s of Object.values(draft.strategy)) {
    if (s) upsert("strategy_fields", { key: s.key, value: s.value, status: s.status, source: s.source });
  }

  const sectionDepth = depthOf(draft.sections, (s) => s.parent_id);
  for (const s of Object.values(draft.sections).sort((a, b) => sectionDepth(a.id) - sectionDepth(b.id))) {
    upsert("sections", { id: map.get(s.id), parent_id: ref(s.parent_id), title: s.title, slug: s.slug, position: s.position, hidden: s.hidden, template_key: s.template_key });
  }
  const blockDepth = depthOf(draft.blocks, (b) => b.parent_block_id);
  for (const b of Object.values(draft.blocks).sort((a, b2) => blockDepth(a.id) - blockDepth(b2.id))) {
    if (!map.has(b.section_id)) continue;
    upsert("blocks", {
      id: map.get(b.id),
      section_id: map.get(b.section_id),
      parent_block_id: ref(b.parent_block_id),
      type: b.type,
      position: b.position,
      props: rewrite(b.props),
      layout: b.layout,
    });
  }

  return { ops, copies };
}

/** Splits ops into save-sized batches; order is preserved, so parents still precede children. */
export function chunkOps(ops: DraftOp[], size = MAX_OPS_PER_SAVE): DraftOp[][] {
  const out: DraftOp[][] = [];
  for (let i = 0; i < ops.length; i += size) out.push(ops.slice(i, i + size));
  return out;
}

function depthOf<T>(rows: Record<string, T>, parentOf: (row: T) => string | null): (id: string) => number {
  const cache = new Map<string, number>();
  const depth = (id: string, guard = 0): number => {
    if (cache.has(id)) return cache.get(id)!;
    const row = rows[id];
    const parent = row ? parentOf(row) : null;
    const d = parent && rows[parent] && guard < 50 ? depth(parent, guard + 1) + 1 : 0;
    cache.set(id, d);
    return d;
  };
  return (id) => depth(id);
}
