/**
 * Brand system commands: colour tokens, typefaces and type styles.
 *
 * These are the brand's single source of truth. Blocks reference them by id,
 * so editing a colour or style changes it everywhere at once. Deleting one also
 * removes its references from blocks in the same save, so nothing dangles.
 */
import { byPosition, isValidHex, normalizeHex, positionBetween, type DraftOp } from "@stella/brand-schema";
import type { BlockRow, ColorRow, Draft, FamilyRow, NewId, Result, StyleRow } from "./model";

const defaultNewId: NewId = () => crypto.randomUUID();

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------

export const COLOR_GROUPS: Array<{ key: ColorRow["color_group"]; label: string }> = [
  { key: "primary", label: "Primary" },
  { key: "secondary", label: "Secondary" },
  { key: "supporting", label: "Supporting" },
];

export function colorsInGroup(draft: Draft, group: ColorRow["color_group"]): ColorRow[] {
  return Object.values(draft.colors).filter((c) => c.color_group === group).sort(byPosition);
}

export function allColors(draft: Draft): ColorRow[] {
  return COLOR_GROUPS.flatMap((g) => colorsInGroup(draft, g.key));
}

function uniqueName<T extends { id: string; name: string }>(rows: T[], wanted: string, exceptId?: string, max = 60): string {
  const base = (wanted.trim() || "Untitled").slice(0, max);
  const used = new Set(rows.filter((r) => r.id !== exceptId).map((r) => r.name.toLowerCase()));
  let name = base;
  for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base.slice(0, max - 4)} ${n}`;
  return name;
}

export function addColor(
  draft: Draft,
  input: { name: string; hex: string; group?: ColorRow["color_group"] },
  newId: NewId = defaultNewId,
): Result {
  if (!isValidHex(input.hex)) return { draft, ops: [], error: `"${input.hex}" isn't a valid hex colour` };
  const group = input.group ?? "primary";
  const id = newId();
  const row: ColorRow = {
    id,
    name: uniqueName(Object.values(draft.colors), input.name),
    hex: normalizeHex(input.hex),
    cmyk_override: null,
    pantone: null,
    color_group: group,
    position: positionBetween(colorsInGroup(draft, group).at(-1)?.position ?? null, null),
  };
  return {
    draft: { ...draft, colors: { ...draft.colors, [id]: row } },
    ops: [{ op: "upsert", table: "color_tokens", row: { ...row } }],
    created: id,
  };
}

export function updateColor(
  draft: Draft,
  id: string,
  patch: Partial<Pick<ColorRow, "name" | "hex" | "pantone" | "cmyk_override" | "color_group">>,
): Result {
  const current = draft.colors[id];
  if (!current) return { draft, ops: [] };
  const next: ColorRow = { ...current };
  const opRow: Record<string, unknown> = { id };
  if (patch.hex !== undefined) {
    if (!isValidHex(patch.hex)) return { draft, ops: [], error: `"${patch.hex}" isn't a valid hex colour` };
    next.hex = opRow.hex = normalizeHex(patch.hex);
  }
  if (patch.name !== undefined) next.name = opRow.name = uniqueName(Object.values(draft.colors), patch.name, id);
  if (patch.pantone !== undefined) next.pantone = opRow.pantone = patch.pantone?.trim().slice(0, 40) || null;
  if (patch.cmyk_override !== undefined) {
    const v = patch.cmyk_override;
    const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
    next.cmyk_override = opRow.cmyk_override = v ? { c: clamp(v.c), m: clamp(v.m), y: clamp(v.y), k: clamp(v.k) } : null;
  }
  if (patch.color_group !== undefined && patch.color_group !== current.color_group) {
    next.color_group = opRow.color_group = patch.color_group;
    next.position = opRow.position = positionBetween(colorsInGroup(draft, patch.color_group).at(-1)?.position ?? null, null);
  }
  return { draft: { ...draft, colors: { ...draft.colors, [id]: next } }, ops: [{ op: "upsert", table: "color_tokens", row: opRow }] };
}

export function moveColor(draft: Draft, id: string, direction: -1 | 1): Result {
  const current = draft.colors[id];
  if (!current) return { draft, ops: [] };
  const siblings = colorsInGroup(draft, current.color_group);
  const from = siblings.findIndex((c) => c.id === id);
  const to = from + direction;
  if (to < 0 || to >= siblings.length) return { draft, ops: [] };
  const others = siblings.filter((c) => c.id !== id);
  const position = positionBetween(others[to - 1]?.position ?? null, others[to]?.position ?? null);
  return {
    draft: { ...draft, colors: { ...draft.colors, [id]: { ...current, position } } },
    ops: [{ op: "upsert", table: "color_tokens", row: { id, position } }],
  };
}

/** Blocks whose props change when a colour is removed, with the cleaned props. */
function blocksWithoutColor(draft: Draft, colorId: string): BlockRow[] {
  const changed: BlockRow[] = [];
  for (const b of Object.values(draft.blocks)) {
    if (b.type === "palette") {
      const ids = (b.props.tokenIds as string[] | undefined) ?? [];
      if (ids.includes(colorId)) changed.push({ ...b, props: { ...b.props, tokenIds: ids.filter((x) => x !== colorId) } });
    } else if (b.type === "color_combinations") {
      const pairs = (b.props.pairs as Array<{ foregroundId: string; backgroundId: string }> | undefined) ?? [];
      const kept = pairs.filter((p) => p.foregroundId !== colorId && p.backgroundId !== colorId);
      if (kept.length !== pairs.length) changed.push({ ...b, props: { ...b.props, pairs: kept } });
    } else if (b.type === "image" && b.props.background === colorId) {
      changed.push({ ...b, props: { ...b.props, background: null } });
    }
  }
  return changed;
}

export function colorUsage(draft: Draft, colorId: string): number {
  return blocksWithoutColor(draft, colorId).length;
}

export function deleteColor(draft: Draft, id: string): Result {
  if (!draft.colors[id]) return { draft, ops: [] };
  const colors = { ...draft.colors };
  delete colors[id];
  const blocks = { ...draft.blocks };
  const ops: DraftOp[] = [];
  for (const b of blocksWithoutColor(draft, id)) {
    blocks[b.id] = b;
    ops.push({ op: "upsert", table: "blocks", row: { id: b.id, type: b.type, props: b.props } });
  }
  ops.push({ op: "delete", table: "color_tokens", row: { id } });
  return { draft: { ...draft, colors, blocks }, ops };
}

// ---------------------------------------------------------------------------
// Typefaces
// ---------------------------------------------------------------------------

/** A typeface name made safe to place inside CSS (quotes, braces and angle brackets removed). */
export function cssFamilyName(name: string): string {
  return name.replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "Brand font";
}

function cssFallback(fallback: string): string {
  return fallback.replace(/[^\p{L}\p{N} ,_-]/gu, "").trim() || "sans-serif";
}

export function familyCss(family: Pick<FamilyRow, "name" | "fallback"> | undefined): string {
  if (!family) return "inherit";
  return `"${cssFamilyName(family.name)}", ${cssFallback(family.fallback)}`;
}

export function addFamily(
  draft: Draft,
  input: { name: string; source?: FamilyRow["source"]; role?: FamilyRow["role"]; fallback?: string },
  newId: NewId = defaultNewId,
): Result {
  const name = input.name.trim().replace(/\s+/g, " ").slice(0, 80);
  if (!name) return { draft, ops: [], error: "Enter the typeface's name" };
  if (Object.values(draft.families).some((f) => f.name.toLowerCase() === name.toLowerCase())) {
    return { draft, ops: [], error: `${name} is already in this brand` };
  }
  const id = newId();
  const row: FamilyRow = {
    id,
    name,
    source: input.source ?? "google",
    role: input.role ?? (Object.values(draft.families).some((f) => f.role === "primary") ? "secondary" : "primary"),
    fallback: input.fallback ?? (/serif|garamond|baskerville|caslon|playfair|fraunces|lora|merriweather/i.test(name) && !/sans/i.test(name) ? "Georgia, serif" : "system-ui, sans-serif"),
    licence_note: null,
    downloadable: false,
  };
  return {
    draft: { ...draft, families: { ...draft.families, [id]: row } },
    ops: [{ op: "upsert", table: "type_families", row: { ...row } }],
    created: id,
  };
}

export function updateFamily(draft: Draft, id: string, patch: Partial<Pick<FamilyRow, "role" | "fallback" | "licence_note" | "downloadable">>): Result {
  const current = draft.families[id];
  if (!current) return { draft, ops: [] };
  const next = { ...current, ...patch };
  return {
    draft: { ...draft, families: { ...draft.families, [id]: next } },
    ops: [{ op: "upsert", table: "type_families", row: { id, ...patch } }],
  };
}

export function deleteFamily(draft: Draft, id: string): Result {
  if (!draft.families[id]) return { draft, ops: [] };
  const using = Object.values(draft.styles).filter((s) => s.family_id === id);
  if (using.length) {
    return {
      draft,
      ops: [],
      error: `${draft.families[id]!.name} is used by ${using.map((s) => s.name).join(", ")}. Change or delete those type styles first.`,
    };
  }
  const families = { ...draft.families };
  delete families[id];
  const blocks = { ...draft.blocks };
  const ops: DraftOp[] = [];
  for (const b of Object.values(draft.blocks)) {
    if (b.type === "type_family" && b.props.familyId === id) {
      const props = { ...b.props, familyId: null };
      blocks[b.id] = { ...b, props };
      ops.push({ op: "upsert", table: "blocks", row: { id: b.id, type: b.type, props } });
    }
  }
  ops.push({ op: "delete", table: "type_families", row: { id } });
  return { draft: { ...draft, families, blocks }, ops };
}

// ---------------------------------------------------------------------------
// Type styles
// ---------------------------------------------------------------------------

export function orderedStyles(draft: Draft): StyleRow[] {
  return Object.values(draft.styles).sort(byPosition);
}

type StyleInput = Omit<StyleRow, "id" | "position">;

const clampStyle = (s: Partial<StyleInput>): Partial<StyleInput> => {
  const out: Partial<StyleInput> = { ...s };
  if (s.weight !== undefined) out.weight = Math.max(100, Math.min(900, Math.round(s.weight / 100) * 100));
  if (s.size !== undefined) out.size = Math.max(1, Math.min(400, Math.round(s.size * 100) / 100));
  if (s.line_height !== undefined) out.line_height = Math.max(0.5, Math.min(4, Math.round(s.line_height * 100) / 100));
  if (s.tracking !== undefined) out.tracking = Math.max(-0.5, Math.min(1, Math.round(s.tracking * 1000) / 1000));
  if (s.name !== undefined) out.name = s.name.trim().slice(0, 40) || "Style";
  return out;
};

export function addStyle(draft: Draft, input: StyleInput, newId: NewId = defaultNewId): Result {
  if (!draft.families[input.family_id]) return { draft, ops: [], error: "Add a typeface first" };
  const id = newId();
  const clean = clampStyle(input) as StyleInput;
  const row: StyleRow = {
    ...clean,
    id,
    name: uniqueName(Object.values(draft.styles), clean.name, undefined, 40),
    position: positionBetween(orderedStyles(draft).at(-1)?.position ?? null, null),
  };
  return {
    draft: { ...draft, styles: { ...draft.styles, [id]: row } },
    ops: [{ op: "upsert", table: "type_styles", row: { ...row } }],
    created: id,
  };
}

export function updateStyle(draft: Draft, id: string, patch: Partial<StyleInput>): Result {
  const current = draft.styles[id];
  if (!current) return { draft, ops: [] };
  if (patch.family_id !== undefined && !draft.families[patch.family_id]) return { draft, ops: [], error: "Unknown typeface" };
  const clean = clampStyle(patch);
  if (clean.name !== undefined) clean.name = uniqueName(Object.values(draft.styles), clean.name, id, 40);
  return {
    draft: { ...draft, styles: { ...draft.styles, [id]: { ...current, ...clean } } },
    ops: [{ op: "upsert", table: "type_styles", row: { id, ...clean } }],
  };
}

export function deleteStyle(draft: Draft, id: string): Result {
  if (!draft.styles[id]) return { draft, ops: [] };
  const styles = { ...draft.styles };
  delete styles[id];
  const blocks = { ...draft.blocks };
  const ops: DraftOp[] = [];
  for (const b of Object.values(draft.blocks)) {
    const ids = b.type === "type_specimen" ? ((b.props.styleIds as string[] | undefined) ?? []) : [];
    if (ids.includes(id)) {
      const props = { ...b.props, styleIds: ids.filter((x) => x !== id) };
      blocks[b.id] = { ...b, props };
      ops.push({ op: "upsert", table: "blocks", row: { id: b.id, type: b.type, props } });
    }
  }
  ops.push({ op: "delete", table: "type_styles", row: { id } });
  return { draft: { ...draft, styles, blocks }, ops };
}

/** A sensible starting hierarchy: display and headings in the primary face, body in the secondary. */
export function addStandardScale(draft: Draft, headingFamilyId: string, bodyFamilyId: string, newId: NewId = defaultNewId): Result {
  const scale: StyleInput[] = [
    { name: "Display", family_id: headingFamilyId, weight: 600, size: 64, line_height: 1.05, tracking: -0.02, text_transform: "none" },
    { name: "Heading 1", family_id: headingFamilyId, weight: 600, size: 40, line_height: 1.1, tracking: -0.01, text_transform: "none" },
    { name: "Heading 2", family_id: headingFamilyId, weight: 600, size: 28, line_height: 1.2, tracking: 0, text_transform: "none" },
    { name: "Body", family_id: bodyFamilyId, weight: 400, size: 17, line_height: 1.6, tracking: 0, text_transform: "none" },
    { name: "Caption", family_id: bodyFamilyId, weight: 500, size: 12, line_height: 1.4, tracking: 0.08, text_transform: "uppercase" },
  ];
  let current = draft;
  const ops: DraftOp[] = [];
  for (const s of scale) {
    const r = addStyle(current, s, newId);
    if (r.error) return { draft, ops: [], error: r.error };
    current = r.draft;
    ops.push(...r.ops);
  }
  return { draft: current, ops };
}

/** Weights to load for each typeface: every weight its styles use, plus regular. */
export function weightsByFamily(draft: Draft): Map<string, number[]> {
  const map = new Map<string, Set<number>>();
  for (const f of Object.values(draft.families)) map.set(f.id, new Set([400]));
  for (const s of Object.values(draft.styles)) map.get(s.family_id)?.add(s.weight);
  return new Map([...map].map(([id, set]) => [id, [...set].sort((a, b) => a - b)]));
}

