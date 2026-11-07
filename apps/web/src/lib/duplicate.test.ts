import { describe, expect, it } from "vitest";
import type { Draft } from "../editor/model";
import { chunkOps, planDuplicate } from "./duplicate";

const OLD_BRAND = "00000000-0000-4000-8000-0000000000b1";
const NEW_BRAND = "00000000-0000-4000-8000-0000000000b2";
const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
const fresh = () => {
  let n = 9000;
  return () => id(++n);
};

function draft(): Draft {
  return {
    sections: {
      // Child listed before parent on purpose: the plan must still order parents first.
      [id(11)]: { id: id(11), parent_id: id(10), title: "Clear space", slug: "clear-space", position: 1024, hidden: false, template_key: null },
      [id(10)]: { id: id(10), parent_id: null, title: "Logo", slug: "logo", position: 1024, hidden: false, template_key: "logo" },
    },
    blocks: {
      [id(21)]: { id: id(21), section_id: id(10), parent_block_id: id(20), type: "palette", position: 1024, props: { tokenIds: [id(30)] }, layout: { width: "wide", span: 1 } },
      [id(20)]: { id: id(20), section_id: id(10), parent_block_id: null, type: "grid", position: 1024, props: { columns: 2 }, layout: { width: "wide", span: 1 } },
      [id(22)]: {
        id: id(22),
        section_id: id(11),
        parent_block_id: null,
        type: "image",
        position: 2048,
        props: { assetId: id(40), alt: `Mentions ${id(10)} inside text, which is not a reference`, background: id(30) },
        layout: { width: "full", span: 1 },
      },
    },
    strategy: { mission: { key: "mission", value: "Feed Lagos well.", status: "approved", source: "manual" } },
    colors: { [id(30)]: { id: id(30), name: "Ember", hex: "#D2491E", cmyk_override: null, pantone: null, color_group: "primary", position: 1024 } },
    families: { [id(50)]: { id: id(50), name: "Fraunces", source: "upload", role: "primary", fallback: "serif", licence_note: null, downloadable: false } },
    styles: { [id(60)]: { id: id(60), name: "Display", family_id: id(50), weight: 600, size: 64, line_height: 1, tracking: 0, text_transform: "none", position: 1024 } },
    assets: {
      [id(40)]: { id: id(40), category: "logo", name: "logo.svg", storage_path: `${OLD_BRAND}/${id(40)}/logo.svg`, mime: "image/svg+xml", size: 10, width: null, height: null, client_visible: true },
      [id(41)]: { id: id(41), category: "font", name: "Fraunces-600.woff2", storage_path: `${OLD_BRAND}/${id(41)}/Fraunces-600.woff2`, mime: "font/woff2", size: 10, width: null, height: null, client_visible: false },
    },
    fontFiles: { [id(70)]: { id: id(70), family_id: id(50), weight: 600, style: "normal", asset_id: id(41) } },
  };
}

describe("planDuplicate", () => {
  const plan = planDuplicate(draft(), NEW_BRAND, fresh());
  const rows = (table: string) => plan.ops.filter((o) => o.table === table).map((o) => o.row);
  const serialized = JSON.stringify(plan.ops);

  it("gives every row a new id and leaves no old id behind as a reference", () => {
    for (const n of [10, 11, 20, 21, 22, 30, 40, 41, 50, 60, 70]) {
      expect(serialized).not.toContain(`"${id(n)}"`);
    }
  });

  it("does not rewrite ids that merely appear inside text", () => {
    const image = rows("blocks").find((r) => r.type === "image")!;
    expect((image.props as { alt: string }).alt).toContain(id(10));
  });

  it("remaps references inside block props", () => {
    const newColor = rows("color_tokens")[0]!.id;
    const newAsset = rows("assets").find((r) => r.name === "logo.svg")!.id;
    const palette = rows("blocks").find((r) => r.type === "palette")!;
    const image = rows("blocks").find((r) => r.type === "image")!;
    expect(palette.props).toEqual({ tokenIds: [newColor] });
    expect(image.props).toMatchObject({ assetId: newAsset, background: newColor });
  });

  it("copies files into the new brand's folder", () => {
    expect(plan.copies).toHaveLength(2);
    for (const c of plan.copies) {
      expect(c.from.startsWith(`${OLD_BRAND}/`)).toBe(true);
      expect(c.to.startsWith(`${NEW_BRAND}/`)).toBe(true);
    }
    const assetPaths = rows("assets").map((r) => r.storage_path);
    expect(assetPaths.sort()).toEqual(plan.copies.map((c) => c.to).sort());
  });

  it("orders ops so every foreign key already exists", () => {
    const seen = new Set<string>();
    for (const op of plan.ops) {
      const r = op.row as Record<string, string | null>;
      for (const fk of ["parent_id", "section_id", "parent_block_id", "family_id", "asset_id"]) {
        if (r[fk]) expect(seen.has(r[fk]!), `${op.table}.${fk}`).toBe(true);
      }
      if (r.id) seen.add(r.id);
    }
  });

  it("keeps strategy, structure and settings", () => {
    expect(rows("strategy_fields")).toEqual([{ key: "mission", value: "Feed Lagos well.", status: "approved", source: "manual" }]);
    expect(rows("sections").map((s) => s.title)).toEqual(["Logo", "Clear space"]);
    expect(rows("type_styles")[0]).toMatchObject({ name: "Display", size: 64 });
    expect(rows("font_files")[0]).toMatchObject({ weight: 600, style: "normal" });
  });
});

describe("chunkOps", () => {
  it("splits in order", () => {
    const ops = Array.from({ length: 1201 }, (_, i) => ({ op: "delete" as const, table: "blocks" as const, row: { id: String(i) } }));
    const chunks = chunkOps(ops);
    expect(chunks.map((c) => c.length)).toEqual([500, 500, 201]);
    expect(chunks.flat()).toEqual(ops);
  });
});
