/**
 * What the assistant may suggest, and how a reviewed suggestion becomes editor
 * changes. Nothing here writes on its own: the designer ticks items, and only
 * ticked items are turned into draft ops through the normal editor commands.
 * Safe for the browser (no server imports).
 */
import { z } from "zod";
import { STRATEGY_FIELD_KEYS, type StrategyFieldKey } from "@stella/brand-schema";
import type { DraftOp } from "@stella/brand-schema";
import { addBlock, sectionBlocks, setStrategy, strategyText, textToDoc, type Draft } from "../editor/model";

export type DraftOpsResult = { draft: Draft; ops: DraftOp[]; applied: number };

export const ProposalSchema = z.object({
  summary: z.string().max(600).describe("One or two sentences on what these suggestions do."),
  strategy: z
    .array(
      z.object({
        key: z.enum(STRATEGY_FIELD_KEYS).describe("Which brand strategy field this fills."),
        value: z.string().min(1).max(4000).describe("The proposed text, written as it should appear in the guide."),
        why: z.string().max(300).describe("Short reason, tied to what the designer said."),
      }),
    )
    .max(13),
  sectionText: z
    .array(
      z.object({
        sectionId: z.string().describe("Id of an existing section from the brand context."),
        text: z.string().min(1).max(4000).describe("Paragraphs for that section, separated by blank lines."),
        why: z.string().max(300),
      }),
    )
    .max(10),
});
export type Proposal = z.infer<typeof ProposalSchema>;

export type ProposalItem =
  | {
      id: string;
      kind: "strategy";
      key: StrategyFieldKey;
      value: string;
      why: string;
      /** Existing text this would replace; such items start unticked. */
      current: string | null;
    }
  | {
      id: string;
      kind: "section_text";
      sectionId: string;
      sectionTitle: string;
      value: string;
      why: string;
      current: null;
    };

/** Turn a model proposal into reviewable items, dropping anything that points nowhere. */
export function proposalToItems(proposal: Proposal, draft: Draft): ProposalItem[] {
  const items: ProposalItem[] = [];
  const seen = new Set<string>();
  for (const s of proposal.strategy) {
    if (seen.has(s.key)) continue;
    seen.add(s.key);
    const existing = strategyText(draft.strategy[s.key]).trim();
    if (existing === s.value.trim()) continue;
    items.push({ id: `strategy:${s.key}`, kind: "strategy", key: s.key, value: s.value.trim(), why: s.why, current: existing || null });
  }
  for (const [i, t] of proposal.sectionText.entries()) {
    const section = draft.sections[t.sectionId];
    if (!section) continue;
    items.push({
      id: `section:${t.sectionId}:${i}`,
      kind: "section_text",
      sectionId: t.sectionId,
      sectionTitle: section.title,
      value: t.text.trim(),
      why: t.why,
      current: null,
    });
  }
  return items;
}

/** Items that change nothing existing are ticked by default; replacements must be chosen. */
export function defaultSelection(items: ProposalItem[]): Set<string> {
  return new Set(items.filter((i) => i.current === null).map((i) => i.id));
}

/**
 * Apply the chosen items. Strategy fields are set with source "ai"; section text
 * is added as a new text block at the end of its section, never over existing blocks.
 */
export function applyItems(draft: Draft, items: ProposalItem[], chosen: Set<string>, newId?: () => string): DraftOpsResult {
  let next = draft;
  const ops: DraftOp[] = [];
  let applied = 0;
  for (const item of items) {
    if (!chosen.has(item.id)) continue;
    if (item.kind === "strategy") {
      const r = setStrategy(next, item.key, item.value, "ai");
      next = r.draft;
      ops.push(...r.ops);
      applied++;
    } else {
      if (!next.sections[item.sectionId]) continue;
      const last = sectionBlocks(next, item.sectionId).at(-1)?.id ?? null;
      const r = addBlock(next, item.sectionId, "text", last, { doc: textToDoc(item.value) }, newId);
      if (!r.created) continue;
      next = r.draft;
      ops.push(...r.ops);
      applied++;
    }
  }
  return { draft: next, ops, applied };
}
