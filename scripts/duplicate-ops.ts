// Prints {"seed": ops, "copy": ops} for the database duplicate test: "seed" builds a
// source brand's draft, "copy" is planDuplicate() of that draft into a second brand.
// Proves duplicated ops apply through apply_draft_ops with foreign keys and RLS.
import type { DraftOp } from "../packages/brand-schema/src/index";
import type { Draft } from "../apps/web/src/editor/model";
import { planDuplicate } from "../apps/web/src/lib/duplicate";

const SOURCE = "bd000000-0000-4000-8000-000000000001";
const TARGET = "bd000000-0000-4000-8000-000000000002";
const id = (n: number) => `c8000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;

const fixture: Draft = {
  sections: {
    [id(10)]: { id: id(10), parent_id: null, title: "Logo", slug: "logo", position: 1024, hidden: false, template_key: null },
    [id(11)]: { id: id(11), parent_id: id(10), title: "Clear space", slug: "clear-space", position: 1024, hidden: true, template_key: null },
    [id(12)]: { id: id(12), parent_id: null, title: "Colour", slug: "colour", position: 2048, hidden: false, template_key: null },
  },
  blocks: {
    [id(20)]: { id: id(20), section_id: id(12), parent_block_id: null, type: "grid", position: 1024, props: { columns: 2, gap: "medium" }, layout: { width: "wide", span: 1 } },
    [id(21)]: { id: id(21), section_id: id(12), parent_block_id: id(20), type: "palette", position: 1024, props: { tokenIds: [id(30), id(31)] }, layout: { width: "wide", span: 1 } },
    [id(22)]: { id: id(22), section_id: id(10), parent_block_id: null, type: "image", position: 1024, props: { assetId: id(40), alt: "Logo", background: id(31) }, layout: { width: "wide", span: 1 } },
    [id(23)]: { id: id(23), section_id: id(11), parent_block_id: null, type: "type_specimen", position: 1024, props: { styleIds: [id(60)] }, layout: { width: "wide", span: 1 } },
  },
  strategy: { mission: { key: "mission", value: "Feed Lagos well.", status: "approved", source: "manual" } },
  colors: {
    [id(30)]: { id: id(30), name: "Ember", hex: "#D2491E", cmyk_override: { c: 0, m: 72, y: 90, k: 10 }, pantone: null, color_group: "primary", position: 1024 },
    [id(31)]: { id: id(31), name: "Yam", hex: "#F2D49B", cmyk_override: null, pantone: null, color_group: "secondary", position: 2048 },
  },
  families: { [id(50)]: { id: id(50), name: "Fraunces", source: "upload", role: "primary", fallback: "serif", licence_note: null, downloadable: false } },
  styles: { [id(60)]: { id: id(60), name: "Display", family_id: id(50), weight: 600, size: 64, line_height: 1, tracking: 0, text_transform: "none", position: 1024 } },
  assets: {
    [id(40)]: { id: id(40), category: "logo", name: "logo.svg", storage_path: `x/${id(40)}/logo.svg`, mime: "image/svg+xml", size: 10, width: null, height: null, client_visible: true },
    [id(41)]: { id: id(41), category: "font", name: "f.woff2", storage_path: `x/${id(41)}/f.woff2`, mime: "font/woff2", size: 10, width: null, height: null, client_visible: false },
  },
  fontFiles: { [id(70)]: { id: id(70), family_id: id(50), weight: 600, style: "normal", asset_id: id(41) } },
};

// Seed the source brand, then rebuild the draft exactly as the database now holds it.
let n = 0;
const seq = (prefix: string) => () => `${prefix}-0000-4000-8000-${(++n).toString().padStart(12, "0")}`;
const seed = planDuplicate(fixture, SOURCE, seq("d8000000")).ops;

function opsToDraft(ops: DraftOp[]): Draft {
  const d: Draft = { sections: {}, blocks: {}, strategy: {}, colors: {}, families: {}, styles: {}, assets: {}, fontFiles: {} };
  const key = { sections: "sections", blocks: "blocks", color_tokens: "colors", type_families: "families", type_styles: "styles", assets: "assets", font_files: "fontFiles" } as const;
  for (const op of ops) {
    const row = op.row as any;
    if (op.table === "strategy_fields") d.strategy[row.key as "mission"] = row;
    else (d as any)[key[op.table as keyof typeof key]][row.id] = { parent_id: null, parent_block_id: null, ...row };
  }
  return d;
}

const copy = planDuplicate(opsToDraft(seed), TARGET, seq("e8000000")).ops;
process.stdout.write(JSON.stringify({ seed, copy }));
