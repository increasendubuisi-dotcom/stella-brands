/**
 * Editor model. Pure functions only: every command takes the current draft and
 * returns the next draft plus the database changes (draft ops) that produce it.
 * The UI applies the new draft immediately and hands the ops to the SaveQueue.
 *
 * Rows mirror the database (snake_case) so ops can be sent without mapping.
 */
import {
  byPosition,
  defaultBlockProps,
  needsRebalance,
  POSITION_STEP,
  positionBetween,
  slugify,
  type BlockType,
  type DraftOp,
  type DraftTable,
  type StrategyFieldKey,
} from "@stella/brand-schema";

export type SectionRow = {
  id: string;
  parent_id: string | null;
  title: string;
  slug: string;
  position: number;
  hidden: boolean;
  template_key: string | null;
};

export type BlockLayoutRow = { width: "full" | "wide" | "narrow"; span: number };

export type BlockRow = {
  id: string;
  section_id: string;
  parent_block_id: string | null;
  type: BlockType;
  position: number;
  props: Record<string, unknown>;
  layout: BlockLayoutRow;
};

export type StrategyRow = {
  key: StrategyFieldKey;
  value: string | Array<{ title: string; body: string }>;
  status: "draft" | "approved";
  source: "manual" | "ai";
};

export type ColorRow = {
  id: string;
  name: string;
  hex: string;
  cmyk_override: { c: number; m: number; y: number; k: number } | null;
  pantone: string | null;
  color_group: "primary" | "secondary" | "supporting";
  position: number;
};

export type FamilyRow = {
  id: string;
  name: string;
  source: "upload" | "google" | "system";
  role: "primary" | "secondary" | "other";
  fallback: string;
  licence_note: string | null;
  downloadable: boolean;
};

export type StyleRow = {
  id: string;
  name: string;
  family_id: string;
  weight: number;
  size: number;
  line_height: number;
  tracking: number;
  text_transform: "none" | "uppercase";
  position: number;
};

export type AssetCategory = "logo" | "font" | "illustration" | "pattern" | "icon" | "photography" | "video" | "mockup" | "other";

export type AssetRow = {
  id: string;
  category: AssetCategory;
  name: string;
  storage_path: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  client_visible: boolean;
};

export type FontFileRow = {
  id: string;
  family_id: string;
  weight: number;
  style: "normal" | "italic";
  asset_id: string;
};

export type Draft = {
  sections: Record<string, SectionRow>;
  blocks: Record<string, BlockRow>;
  strategy: Partial<Record<StrategyFieldKey, StrategyRow>>;
  colors: Record<string, ColorRow>;
  families: Record<string, FamilyRow>;
  styles: Record<string, StyleRow>;
  assets: Record<string, AssetRow>;
  fontFiles: Record<string, FontFileRow>;
};

export type Result = {
  draft: Draft;
  ops: DraftOp[];
  /** Queue keys whose pending ops are obsolete (e.g. rows inside a deleted section). */
  drop?: string[];
  /** Id of a newly created row, for focusing it in the UI. */
  created?: string;
  /** Set when the command was refused; nothing changed. */
  error?: string;
};

export type NewId = () => string;
const defaultNewId: NewId = () => crypto.randomUUID();

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function childSections(draft: Draft, parentId: string | null): SectionRow[] {
  return Object.values(draft.sections)
    .filter((s) => s.parent_id === parentId)
    .sort(byPosition);
}

export function sectionBlocks(draft: Draft, sectionId: string): BlockRow[] {
  return Object.values(draft.blocks)
    .filter((b) => b.section_id === sectionId && b.parent_block_id === null)
    .sort(byPosition);
}

/** The section and every section nested under it. */
export function descendantSectionIds(draft: Draft, id: string): string[] {
  const out = [id];
  for (let i = 0; i < out.length; i++) {
    for (const child of childSections(draft, out[i]!)) out.push(child.id);
  }
  return out;
}

export function topLevelAncestor(draft: Draft, id: string): string {
  let current = draft.sections[id];
  while (current?.parent_id) current = draft.sections[current.parent_id];
  return current?.id ?? id;
}

export function queueKey(table: DraftTable, row: Record<string, unknown>): string {
  return table === "strategy_fields" ? `${table}:${String(row.key)}` : `${table}:${String(row.id)}`;
}

function uniqueSlug(draft: Draft, title: string, exceptId?: string): string {
  const used = new Set(Object.values(draft.sections).filter((s) => s.id !== exceptId).map((s) => s.slug));
  const base = slugify(title);
  let slug = base;
  for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}

/**
 * Position for an item moved to `index` among `siblings` (which exclude the item).
 * Returns ops that also renumber the siblings when the gap has become too small.
 */
function placeAt<T extends { id: string; position: number }>(
  siblings: T[],
  index: number,
): { position: number; renumber: Map<string, number> | null } {
  const before = siblings[index - 1]?.position ?? null;
  const after = siblings[index]?.position ?? null;
  if (before !== null && after !== null && needsRebalance(before, after)) {
    // Renumber everyone evenly, leaving the slot at `index` free for the moved item.
    const next = new Map<string, number>();
    siblings.forEach((s, i) => next.set(s.id, (i < index ? i + 1 : i + 2) * POSITION_STEP));
    return { position: (index + 1) * POSITION_STEP, renumber: next };
  }
  return { position: positionBetween(before, after), renumber: null };
}

// ---------------------------------------------------------------------------
// Section commands
// ---------------------------------------------------------------------------

export function addSection(draft: Draft, parentId: string | null, title: string, newId: NewId = defaultNewId): Result {
  const siblings = childSections(draft, parentId);
  const id = newId();
  const row: SectionRow = {
    id,
    parent_id: parentId,
    title: title.trim() || "Untitled section",
    slug: uniqueSlug(draft, title || "untitled-section"),
    position: positionBetween(siblings.at(-1)?.position ?? null, null),
    hidden: false,
    template_key: null,
  };
  // New sections start with one empty text block so there is something to write in.
  const blockId = newId();
  const block: BlockRow = {
    id: blockId,
    section_id: id,
    parent_block_id: null,
    type: "text",
    position: POSITION_STEP,
    props: defaultBlockProps("text"),
    layout: { width: "wide", span: 1 },
  };
  return {
    draft: { ...draft, sections: { ...draft.sections, [id]: row }, blocks: { ...draft.blocks, [blockId]: block } },
    ops: [
      { op: "upsert", table: "sections", row: { ...row } },
      { op: "upsert", table: "blocks", row: { ...block } },
    ],
    created: id,
  };
}

export function updateSection(draft: Draft, id: string, patch: Partial<Pick<SectionRow, "title" | "hidden">>): Result {
  const current = draft.sections[id];
  if (!current) return { draft, ops: [] };
  const next: SectionRow = { ...current, ...patch };
  const opRow: Record<string, unknown> = { id };
  if (patch.title !== undefined) {
    next.title = patch.title.slice(0, 120);
    opRow.title = next.title.trim() || "Untitled section";
  }
  if (patch.hidden !== undefined) opRow.hidden = patch.hidden;
  return {
    draft: { ...draft, sections: { ...draft.sections, [id]: next } },
    ops: [{ op: "upsert", table: "sections", row: opRow }],
  };
}

/** Move a section to `index` among its siblings (same parent). */
export function moveSection(draft: Draft, id: string, index: number): Result {
  const current = draft.sections[id];
  if (!current) return { draft, ops: [] };
  const siblings = childSections(draft, current.parent_id).filter((s) => s.id !== id);
  const clamped = Math.max(0, Math.min(index, siblings.length));
  const { position, renumber } = placeAt(siblings, clamped);
  const sections = { ...draft.sections, [id]: { ...current, position } };
  const ops: DraftOp[] = [];
  if (renumber) {
    for (const [sid, pos] of renumber) {
      sections[sid] = { ...sections[sid]!, position: pos };
      ops.push({ op: "upsert", table: "sections", row: { id: sid, position: pos } });
    }
  }
  ops.push({ op: "upsert", table: "sections", row: { id, position } });
  return { draft: { ...draft, sections }, ops };
}

export function deleteSection(draft: Draft, id: string): Result {
  if (!draft.sections[id]) return { draft, ops: [] };
  const sectionIds = new Set(descendantSectionIds(draft, id));
  const sections = Object.fromEntries(Object.entries(draft.sections).filter(([sid]) => !sectionIds.has(sid)));
  const removedBlocks = Object.values(draft.blocks).filter((b) => sectionIds.has(b.section_id));
  const blocks = Object.fromEntries(Object.entries(draft.blocks).filter(([, b]) => !sectionIds.has(b.section_id)));
  return {
    draft: { ...draft, sections, blocks },
    // The database cascades to subsections and blocks; queued changes to them are obsolete.
    ops: [{ op: "delete", table: "sections", row: { id } }],
    drop: [
      ...[...sectionIds].filter((sid) => sid !== id).map((sid) => `sections:${sid}`),
      ...removedBlocks.map((b) => `blocks:${b.id}`),
    ],
  };
}

/** Copy a section, its blocks and its subsections, placed right after the original. */
export function duplicateSection(draft: Draft, id: string, newId: NewId = defaultNewId): Result {
  const original = draft.sections[id];
  if (!original) return { draft, ops: [] };
  const siblings = childSections(draft, original.parent_id);
  const index = siblings.findIndex((s) => s.id === id);
  const next = siblings[index + 1];
  let working: Draft = { ...draft, sections: { ...draft.sections }, blocks: { ...draft.blocks } };
  const ops: DraftOp[] = [];

  const copy = (source: SectionRow, parentId: string | null, position: number, title: string): string => {
    const sid = newId();
    const row: SectionRow = {
      ...source,
      id: sid,
      parent_id: parentId,
      title,
      slug: uniqueSlug(working, title),
      position,
      template_key: source.template_key,
    };
    working.sections[sid] = row;
    ops.push({ op: "upsert", table: "sections", row: { ...row } });
    for (const b of sectionBlocks(draft, source.id)) {
      const bid = newId();
      const block: BlockRow = { ...b, id: bid, section_id: sid, props: structuredClone(b.props), layout: { ...b.layout } };
      working.blocks[bid] = block;
      ops.push({ op: "upsert", table: "blocks", row: { ...block } });
    }
    for (const child of childSections(draft, source.id)) copy(child, sid, child.position, child.title);
    return sid;
  };

  const position = positionBetween(original.position, next?.position ?? null);
  const created = copy(original, original.parent_id, position, `${original.title} copy`.slice(0, 120));
  working = { ...working };
  return { draft: working, ops, created };
}

// ---------------------------------------------------------------------------
// Block commands
// ---------------------------------------------------------------------------

export function addBlock(
  draft: Draft,
  sectionId: string,
  type: BlockType,
  afterBlockId: string | null,
  props: Record<string, unknown> = {},
  newId: NewId = defaultNewId,
): Result {
  if (!draft.sections[sectionId]) return { draft, ops: [] };
  const siblings = sectionBlocks(draft, sectionId);
  const index = afterBlockId === null ? 0 : siblings.findIndex((b) => b.id === afterBlockId) + 1;
  const insertAt = index <= 0 && afterBlockId !== null ? siblings.length : index;
  const { position, renumber } = placeAt(siblings, insertAt);
  const id = newId();
  const block: BlockRow = {
    id,
    section_id: sectionId,
    parent_block_id: null,
    type,
    position,
    props: defaultBlockProps(type, props as never) as Record<string, unknown>,
    layout: { width: "wide", span: 1 },
  };
  const blocks = { ...draft.blocks, [id]: block };
  const ops: DraftOp[] = [];
  if (renumber) {
    for (const [bid, pos] of renumber) {
      blocks[bid] = { ...blocks[bid]!, position: pos };
      ops.push({ op: "upsert", table: "blocks", row: { id: bid, position: pos } });
    }
  }
  ops.push({ op: "upsert", table: "blocks", row: { ...block } });
  return { draft: { ...draft, blocks }, ops, created: id };
}

/** Replace a block's props. `type` travels with props so the server can validate them. */
export function updateBlockProps(draft: Draft, id: string, props: Record<string, unknown>): Result {
  const current = draft.blocks[id];
  if (!current) return { draft, ops: [] };
  return {
    draft: { ...draft, blocks: { ...draft.blocks, [id]: { ...current, props } } },
    ops: [{ op: "upsert", table: "blocks", row: { id, type: current.type, props } }],
  };
}

export function updateBlockLayout(draft: Draft, id: string, layout: Partial<BlockLayoutRow>): Result {
  const current = draft.blocks[id];
  if (!current) return { draft, ops: [] };
  const next = { ...current.layout, ...layout };
  return {
    draft: { ...draft, blocks: { ...draft.blocks, [id]: { ...current, layout: next } } },
    ops: [{ op: "upsert", table: "blocks", row: { id, layout: next } }],
  };
}

/** Move a block one step up (-1) or down (+1) within its section. */
export function moveBlock(draft: Draft, id: string, direction: -1 | 1): Result {
  const current = draft.blocks[id];
  if (!current) return { draft, ops: [] };
  const siblings = sectionBlocks(draft, current.section_id);
  const from = siblings.findIndex((b) => b.id === id);
  const to = from + direction;
  if (to < 0 || to >= siblings.length) return { draft, ops: [] };
  const others = siblings.filter((b) => b.id !== id);
  const { position, renumber } = placeAt(others, to);
  const blocks = { ...draft.blocks, [id]: { ...current, position } };
  const ops: DraftOp[] = [];
  if (renumber) {
    for (const [bid, pos] of renumber) {
      blocks[bid] = { ...blocks[bid]!, position: pos };
      ops.push({ op: "upsert", table: "blocks", row: { id: bid, position: pos } });
    }
  }
  ops.push({ op: "upsert", table: "blocks", row: { id, position } });
  return { draft: { ...draft, blocks }, ops };
}

/**
 * Moves a top-level block to `index` among the top-level blocks of `sectionId`
 * (its own section or another). Used by drag and drop; `index` counts the
 * target list without the moving block. A block that holds child blocks (a
 * filled grid) can only move within its own section: the database ties
 * children to their parent's section, so they cannot change section in one save.
 */
export function moveBlockTo(draft: Draft, id: string, sectionId: string, index: number): Result {
  const current = draft.blocks[id];
  if (!current || current.parent_block_id !== null || !draft.sections[sectionId]) return { draft, ops: [] };
  const changingSection = current.section_id !== sectionId;
  if (changingSection && blockHasChildren(draft, id)) return { draft, ops: [] };

  const others = sectionBlocks(draft, sectionId).filter((b) => b.id !== id);
  const clamped = Math.max(0, Math.min(index, others.length));
  if (!changingSection) {
    const from = sectionBlocks(draft, sectionId).findIndex((b) => b.id === id);
    if (from === clamped) return { draft, ops: [] };
  }
  const { position, renumber } = placeAt(others, clamped);
  const blocks = { ...draft.blocks, [id]: { ...current, section_id: sectionId, position } };
  const ops: DraftOp[] = [];
  if (renumber) {
    for (const [bid, pos] of renumber) {
      blocks[bid] = { ...blocks[bid]!, position: pos };
      ops.push({ op: "upsert", table: "blocks", row: { id: bid, position: pos } });
    }
  }
  ops.push({ op: "upsert", table: "blocks", row: changingSection ? { id, section_id: sectionId, position } : { id, position } });
  return { draft: { ...draft, blocks }, ops };
}

export function blockHasChildren(draft: Draft, id: string): boolean {
  return Object.values(draft.blocks).some((b) => b.parent_block_id === id);
}

export function duplicateBlock(draft: Draft, id: string, newId: NewId = defaultNewId): Result {
  const current = draft.blocks[id];
  if (!current) return { draft, ops: [] };
  const siblings = sectionBlocks(draft, current.section_id);
  const next = siblings[siblings.findIndex((b) => b.id === id) + 1];
  const bid = newId();
  const block: BlockRow = {
    ...current,
    id: bid,
    position: positionBetween(current.position, next?.position ?? null),
    props: structuredClone(current.props),
    layout: { ...current.layout },
  };
  return {
    draft: { ...draft, blocks: { ...draft.blocks, [bid]: block } },
    ops: [{ op: "upsert", table: "blocks", row: { ...block } }],
    created: bid,
  };
}

export function deleteBlock(draft: Draft, id: string): Result {
  if (!draft.blocks[id]) return { draft, ops: [] };
  const blocks = { ...draft.blocks };
  delete blocks[id];
  return { draft: { ...draft, blocks }, ops: [{ op: "delete", table: "blocks", row: { id } }] };
}

// ---------------------------------------------------------------------------
// Strategy
// ---------------------------------------------------------------------------

export function setStrategy(
  draft: Draft,
  key: StrategyFieldKey,
  value: string,
  source: StrategyRow["source"] = "manual",
): Result {
  const row: StrategyRow = { key, value: value.slice(0, 4000), status: "approved", source };
  return {
    draft: { ...draft, strategy: { ...draft.strategy, [key]: row } },
    ops: [{ op: "upsert", table: "strategy_fields", row: { ...row } }],
  };
}

export function strategyText(row: StrategyRow | undefined): string {
  if (!row) return "";
  if (typeof row.value === "string") return row.value;
  return row.value.map((v) => (v.body ? `${v.title}: ${v.body}` : v.title)).join("\n");
}

// ---------------------------------------------------------------------------
// Rich text (plain paragraphs for now; stored as ProseMirror-shaped JSON)
// ---------------------------------------------------------------------------

type DocNode = { type: string; text?: string; content?: DocNode[] };

export function docToText(doc: unknown): string {
  const root = doc as DocNode | undefined;
  if (!root?.content) return "";
  const textOf = (n: DocNode): string => (n.text ?? "") + (n.content ?? []).map(textOf).join("");
  return root.content.map(textOf).join("\n\n");
}

export function textToDoc(text: string): { type: "doc"; content: DocNode[] } {
  const paragraphs = text.split(/\n{2,}/);
  return {
    type: "doc",
    content: paragraphs.map((p) =>
      p.length ? { type: "paragraph", content: [{ type: "text", text: p }] } : { type: "paragraph" },
    ),
  };
}
