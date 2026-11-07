/**
 * Builds the brand context the assistant sees: the brief, the strategy so far,
 * the guide's structure (with section ids it may target), the colour and type
 * system, and the project memory. Pure and length-capped.
 */
import { STRATEGY_FIELD_KEYS } from "@stella/brand-schema";
import { childSections, docToText, sectionBlocks, strategyText, type Draft, type SectionRow } from "../editor/model";

export type BrandBrief = { name: string; description: string | null; website: string | null };

export const MAX_CONTEXT_CHARS = 24_000;

function clip(text: string, max: number): string {
  const t = text.replace(/\s+\n/g, "\n").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export function buildBrandContext(brief: BrandBrief, draft: Draft, memory: string | null): string {
  const parts: string[] = [];
  parts.push(`# Brand: ${clip(brief.name, 120)}`);
  if (brief.description) parts.push(`Description: ${clip(brief.description, 1500)}`);
  if (brief.website) parts.push(`Website: ${clip(brief.website, 200)}`);

  if (memory?.trim()) parts.push(`## Project memory (earlier conversations)\n${clip(memory, 6000)}`);

  const strategy = STRATEGY_FIELD_KEYS.map((key) => {
    const text = strategyText(draft.strategy[key]).trim();
    return text ? `- ${key}: ${clip(text, 800)}` : `- ${key}: (empty)`;
  });
  parts.push(`## Brand strategy fields\n${strategy.join("\n")}`);

  const lines: string[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const s of childSections(draft, parentId)) {
      lines.push(`${"  ".repeat(depth)}- [${s.id}] ${s.title}${s.hidden ? " (hidden)" : ""}${sectionSummary(draft, s)}`);
      if (depth < 3) walk(s.id, depth + 1);
    }
  };
  walk(null, 0);
  if (lines.length) parts.push(`## Guide sections (id in brackets)\n${lines.join("\n")}`);

  const colors = Object.values(draft.colors).sort((a, b) => a.position - b.position);
  if (colors.length) parts.push(`## Colours\n${colors.map((c) => `- ${c.name} ${c.hex} (${c.color_group})`).join("\n")}`);
  const families = Object.values(draft.families);
  if (families.length) parts.push(`## Typefaces\n${families.map((f) => `- ${f.name} (${f.role})`).join("\n")}`);

  const out = parts.join("\n\n");
  return out.length > MAX_CONTEXT_CHARS ? `${out.slice(0, MAX_CONTEXT_CHARS - 1)}…` : out;
}

function sectionSummary(draft: Draft, section: SectionRow): string {
  const text = sectionBlocks(draft, section.id)
    .filter((b) => b.type === "text")
    .map((b) => docToText(b.props.doc))
    .join(" ")
    .trim();
  return text ? ` — has text: "${clip(text, 160)}"` : "";
}
