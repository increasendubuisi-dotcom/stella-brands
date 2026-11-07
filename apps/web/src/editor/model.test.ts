import { describe, expect, it } from "vitest";
import {
  addBlock,
  addSection,
  childSections,
  deleteBlock,
  deleteSection,
  docToText,
  duplicateBlock,
  duplicateSection,
  moveBlock,
  moveBlockTo,
  moveSection,
  sectionBlocks,
  setStrategy,
  textToDoc,
  updateBlockProps,
  updateSection,
  type Draft,
} from "./model";
import { SaveQueue } from "./save-queue";

const ids = () => {
  let n = 0;
  return () => `00000000-0000-4000-8000-${(++n).toString().padStart(12, "0")}`;
};

const empty = (): Draft => ({ sections: {}, blocks: {}, strategy: {}, colors: {}, families: {}, styles: {}, assets: {}, fontFiles: {} });

function build() {
  const newId = ids();
  let d = empty();
  const a = addSection(d, null, "Logo", newId);
  d = a.draft;
  const b = addSection(d, null, "Colour", newId);
  d = b.draft;
  const c = addSection(d, null, "Type", newId);
  d = c.draft;
  return { d, newId, logo: a.created!, colour: b.created!, type: c.created! };
}

describe("sections", () => {
  it("adds sections in order, each with a starter text block", () => {
    const { d, logo } = build();
    expect(childSections(d, null).map((s) => s.title)).toEqual(["Logo", "Colour", "Type"]);
    expect(sectionBlocks(d, logo).map((b) => b.type)).toEqual(["text"]);
  });

  it("gives duplicate titles unique slugs", () => {
    const { d, newId } = build();
    const r = addSection(d, null, "Logo", newId);
    expect(r.draft.sections[r.created!]!.slug).toBe("logo-2");
  });

  it("reorders with a single position change", () => {
    const { d, type } = build();
    const r = moveSection(d, type, 0);
    expect(childSections(r.draft, null).map((s) => s.title)).toEqual(["Type", "Logo", "Colour"]);
    expect(r.ops).toEqual([{ op: "upsert", table: "sections", row: { id: type, position: expect.any(Number) } }]);
  });

  it("renumbers siblings when repeated moves exhaust the gap", () => {
    let { d } = build();
    const { logo, colour, type } = build();
    // Repeatedly move the last item between the first two.
    let renumbered = false;
    for (let i = 0; i < 80; i++) {
      const last = childSections(d, null).at(-1)!.id;
      const r = moveSection(d, last, 1);
      if (r.ops.length > 1) renumbered = true;
      d = r.draft;
      const positions = childSections(d, null).map((s) => s.position);
      expect(new Set(positions).size).toBe(positions.length);
    }
    expect(renumbered).toBe(true);
    void logo, colour, type;
  });

  it("renames and hides with patch-only ops", () => {
    const { d, logo } = build();
    const r = updateSection(d, logo, { title: "Logo system", hidden: true });
    expect(r.draft.sections[logo]).toMatchObject({ title: "Logo system", hidden: true });
    expect(r.ops[0]!.row).toEqual({ id: logo, title: "Logo system", hidden: true });
  });

  it("deletes a section with its subsections and blocks, dropping their queued changes", () => {
    const { d, newId, colour } = build();
    const sub = addSection(d, colour, "Primary colours", newId);
    const r = deleteSection(sub.draft, colour);
    expect(r.draft.sections[colour]).toBeUndefined();
    expect(r.draft.sections[sub.created!]).toBeUndefined();
    expect(Object.values(r.draft.blocks).some((b) => b.section_id === colour || b.section_id === sub.created)).toBe(false);
    expect(r.ops).toEqual([{ op: "delete", table: "sections", row: { id: colour } }]);
    expect(r.drop).toContain(`sections:${sub.created}`);
  });

  it("duplicates a section with blocks and subsections, right after the original", () => {
    const { d, newId, colour } = build();
    const sub = addSection(d, colour, "Primary colours", newId);
    const r = duplicateSection(sub.draft, colour, newId);
    expect(childSections(r.draft, null).map((s) => s.title)).toEqual(["Logo", "Colour", "Colour copy", "Type"]);
    expect(childSections(r.draft, r.created!).map((s) => s.title)).toEqual(["Primary colours"]);
    expect(sectionBlocks(r.draft, r.created!)).toHaveLength(1);
    // Parents are created before their children.
    const sectionOps = r.ops.filter((o) => o.table === "sections").map((o) => o.row.id);
    expect(sectionOps[0]).toBe(r.created);
  });
});

describe("blocks", () => {
  it("inserts after a given block, at the top, or appends", () => {
    const { d, newId, logo } = build();
    const first = sectionBlocks(d, logo)[0]!.id;
    let r = addBlock(d, logo, "heading", first, { text: "After" }, newId);
    r = addBlock(r.draft, logo, "divider", null, {}, newId);
    expect(sectionBlocks(r.draft, logo).map((b) => b.type)).toEqual(["divider", "text", "heading"]);
  });

  it("validates props and fills defaults on creation", () => {
    const { d, newId, logo } = build();
    expect(() => addBlock(d, logo, "strategy_field", null, {}, newId)).toThrow();
    const r = addBlock(d, logo, "strategy_field", null, { fieldKey: "mission" }, newId);
    expect(r.draft.blocks[r.created!]!.props).toEqual({ fieldKey: "mission", display: "body" });
  });

  it("moves up and down, and ignores moves past the ends", () => {
    const { d, newId, logo } = build();
    const first = sectionBlocks(d, logo)[0]!.id;
    const added = addBlock(d, logo, "heading", first, {}, newId);
    const up = moveBlock(added.draft, added.created!, -1);
    expect(sectionBlocks(up.draft, logo)[0]!.id).toBe(added.created);
    expect(moveBlock(up.draft, added.created!, -1).ops).toEqual([]);
  });

  it("drags a block to any index within its section", () => {
    const { d, newId, logo } = build();
    let draft = d;
    for (const t of ["heading", "divider", "image"] as const) {
      const last = sectionBlocks(draft, logo).at(-1)!.id;
      draft = addBlock(draft, logo, t, last, {}, newId).draft;
    }
    const order = () => sectionBlocks(draft, logo).map((b) => b.type);
    expect(order()).toEqual(["text", "heading", "divider", "image"]);
    const text = sectionBlocks(draft, logo)[0]!.id;
    let r = moveBlockTo(draft, text, logo, 3);
    draft = r.draft;
    expect(order()).toEqual(["heading", "divider", "image", "text"]);
    expect(r.ops).toEqual([{ op: "upsert", table: "blocks", row: { id: text, position: expect.any(Number) } }]);
    r = moveBlockTo(draft, text, logo, 1);
    draft = r.draft;
    expect(order()).toEqual(["heading", "text", "divider", "image"]);
    expect(moveBlockTo(draft, text, logo, 1).ops).toEqual([]);
  });

  it("drags a block into another section and saves its new section", () => {
    const { d, logo, colour } = build();
    const block = sectionBlocks(d, logo)[0]!.id;
    const r = moveBlockTo(d, block, colour, 0);
    expect(sectionBlocks(r.draft, logo)).toEqual([]);
    expect(sectionBlocks(r.draft, colour).map((b) => b.id)[0]).toBe(block);
    expect(r.ops).toEqual([{ op: "upsert", table: "blocks", row: { id: block, section_id: colour, position: expect.any(Number) } }]);
  });

  it("keeps a filled grid in its own section", () => {
    const { d, newId, logo, colour } = build();
    const grid = addBlock(d, logo, "grid", null, {}, newId);
    const gid = grid.created!;
    const child = { ...sectionBlocks(grid.draft, logo).find((b) => b.type === "text")!, parent_block_id: gid };
    const withChild = { ...grid.draft, blocks: { ...grid.draft.blocks, [child.id]: child } };
    expect(moveBlockTo(withChild, gid, colour, 0).ops).toEqual([]);
    expect(moveBlockTo(withChild, gid, logo, 0).ops).toEqual([]); // already first
    expect(moveBlockTo(grid.draft, gid, colour, 0).ops).toHaveLength(1); // an empty grid can move
  });

  it("sends type with props so the server can validate them", () => {
    const { d, logo } = build();
    const block = sectionBlocks(d, logo)[0]!;
    const r = updateBlockProps(d, block.id, { doc: textToDoc("Hello") });
    expect(r.ops[0]!.row).toEqual({ id: block.id, type: "text", props: { doc: textToDoc("Hello") } });
  });

  it("duplicates and deletes", () => {
    const { d, newId, logo } = build();
    const block = sectionBlocks(d, logo)[0]!;
    const dup = duplicateBlock(d, block.id, newId);
    expect(sectionBlocks(dup.draft, logo)).toHaveLength(2);
    const del = deleteBlock(dup.draft, block.id);
    expect(sectionBlocks(del.draft, logo).map((b) => b.id)).toEqual([dup.created]);
  });
});

describe("strategy and text", () => {
  it("stores strategy as an approved manual field", () => {
    const r = setStrategy(empty(), "mission", "Feed people well.");
    expect(r.ops[0]).toEqual({
      op: "upsert",
      table: "strategy_fields",
      row: { key: "mission", value: "Feed people well.", status: "approved", source: "manual" },
    });
  });

  it("round-trips paragraphs through the document format", () => {
    const text = "First paragraph.\n\nSecond one.";
    expect(docToText(textToDoc(text))).toBe(text);
    expect(docToText({ type: "doc", content: [] })).toBe("");
  });
});

describe("SaveQueue", () => {
  it("merges repeated edits to one row into one op", () => {
    const q = new SaveQueue();
    q.push([{ op: "upsert", table: "blocks", row: { id: "b1", type: "text", props: { doc: "a" } } }]);
    q.push([{ op: "upsert", table: "blocks", row: { id: "b1", type: "text", props: { doc: "ab" } } }]);
    q.push([{ op: "upsert", table: "blocks", row: { id: "b1", position: 5 } }]);
    expect(q.take()).toEqual([{ op: "upsert", table: "blocks", row: { id: "b1", type: "text", props: { doc: "ab" }, position: 5 } }]);
  });

  it("keeps parents before children and moves deletes last", () => {
    const q = new SaveQueue();
    q.push([
      { op: "upsert", table: "sections", row: { id: "s1" } },
      { op: "upsert", table: "blocks", row: { id: "b1", section_id: "s1" } },
      { op: "upsert", table: "sections", row: { id: "s0" } },
    ]);
    q.push([{ op: "delete", table: "sections", row: { id: "s0" } }]);
    expect(q.take().map((o) => `${o.op}:${o.row.id}`)).toEqual(["upsert:s1", "upsert:b1", "delete:s0"]);
  });

  it("drops changes to rows inside a deleted section", () => {
    const q = new SaveQueue();
    const { d, newId, colour } = build();
    const sub = addSection(d, colour, "Primary", newId);
    q.push(sub.ops);
    const del = deleteSection(sub.draft, colour);
    q.drop(del.drop ?? []);
    q.push(del.ops);
    expect(q.take().map((o) => `${o.op}:${o.table}`)).toEqual(["delete:sections"]);
  });

  it("restores a failed batch underneath newer edits", () => {
    const q = new SaveQueue();
    q.push([{ op: "upsert", table: "sections", row: { id: "s1", title: "Old", position: 1 } }]);
    const batch = q.take();
    q.push([{ op: "upsert", table: "sections", row: { id: "s1", title: "New" } }]);
    q.restore(batch);
    expect(q.take()).toEqual([{ op: "upsert", table: "sections", row: { id: "s1", title: "New", position: 1 } }]);
  });

  it("splits large batches", () => {
    const q = new SaveQueue();
    q.push(Array.from({ length: 7 }, (_, i) => ({ op: "upsert" as const, table: "blocks" as const, row: { id: `b${i}` } })));
    expect(q.take(5)).toHaveLength(5);
    expect(q.size).toBe(2);
  });
});
