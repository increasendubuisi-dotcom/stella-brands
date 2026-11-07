import { contrastRatio } from "./color";
import type { StrategyField, StrategyFieldKey } from "./entities";
import type { GuideSnapshot, SnapshotBlock, SnapshotSection } from "./snapshot";

/**
 * The agent-facing face of a published guide: brand.md and brand.json.
 *
 * Both are built only from a published snapshot (never the draft), so an AI
 * tool sees exactly what the client sees. Storage paths and internal ids of
 * files are never exposed; files are referenced by name and, when the
 * designer allowed downloads, by a guide-relative download path.
 */

export type AgentExportMeta = {
  version: number;
  publishedAt: string;
  /** Absolute URL of the human guide, e.g. https://stella.app/g/ember-and-yam */
  guideUrl: string;
};

export const STRATEGY_LABELS: Record<StrategyFieldKey, string> = {
  overview: "Brand overview",
  story: "Brand story",
  mission: "Mission",
  vision: "Vision",
  purpose: "Purpose",
  values: "Values",
  positioning: "Positioning",
  audience: "Target audience",
  personality: "Personality",
  archetype: "Archetype",
  promise: "Brand promise",
  messaging: "Messaging",
  tone: "Tone of voice",
};

export function wcagGrade(ratio: number): "AAA" | "AA" | "AA large" | "fail" {
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return "AA large";
  return "fail";
}

// ---------------------------------------------------------------------------
// Rich text → Markdown (ProseMirror-shaped JSON)
// ---------------------------------------------------------------------------

type DocNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{ type?: string; attrs?: Record<string, unknown> }>;
  content?: DocNode[];
};

function inline(nodes: DocNode[] | undefined): string {
  return (nodes ?? [])
    .map((n) => {
      if (n.type === "hardBreak") return "  \n";
      let t = n.text ?? inline(n.content);
      for (const m of n.marks ?? []) {
        if (m.type === "bold" || m.type === "strong") t = `**${t}**`;
        else if (m.type === "italic" || m.type === "em") t = `*${t}*`;
        else if (m.type === "code") t = `\`${t}\``;
        else if (m.type === "link" && typeof m.attrs?.href === "string") t = `[${t}](${m.attrs.href})`;
      }
      return t;
    })
    .join("");
}

export function richTextToMarkdown(doc: unknown): string {
  const root = doc as DocNode | null;
  if (!root || !Array.isArray(root.content)) return "";
  const block = (n: DocNode, depth = 0): string => {
    switch (n.type) {
      case "paragraph":
        return inline(n.content);
      case "heading": {
        const level = Math.min(6, Math.max(1, Number(n.attrs?.level ?? 3)));
        return `${"#".repeat(level)} ${inline(n.content)}`;
      }
      case "bulletList":
      case "orderedList":
        return (n.content ?? [])
          .map((li, i) => {
            const marker = n.type === "orderedList" ? `${i + 1}.` : "-";
            const body = (li.content ?? []).map((c) => block(c, depth + 1)).join("\n");
            return `${"  ".repeat(depth)}${marker} ${body}`;
          })
          .join("\n");
      case "blockquote":
        return (n.content ?? []).map((c) => `> ${block(c, depth)}`).join("\n");
      case "horizontalRule":
        return "---";
      default:
        return n.text ?? inline(n.content);
    }
  };
  return root.content
    .map((n) => block(n))
    .filter((s) => s.trim().length > 0)
    .join("\n\n");
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

function strategyValueToMarkdown(value: StrategyField["value"] | undefined): string {
  if (value === undefined) return "";
  if (typeof value === "string") return value.trim();
  return value.map((v) => `- **${v.title}**${v.body ? `: ${v.body}` : ""}`).join("\n");
}

const cmykText = (c: { c: number; m: number; y: number; k: number }) => `C${c.c} M${c.m} Y${c.y} K${c.k}`;
const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

function blockToMarkdown(b: SnapshotBlock, s: GuideSnapshot, guideUrl: string, headingDepth: number): string {
  const colors = new Map(s.tokens.colors.map((c) => [c.id, c]));
  const styles = new Map(s.tokens.typeStyles.map((t) => [t.id, t]));
  const families = new Map(s.tokens.typeFamilies.map((f) => [f.id, f]));
  const assets = new Map(s.assets.map((a) => [a.id, a]));
  const assetLine = (id: string | null | undefined) => {
    const a = id ? assets.get(id) : undefined;
    if (!a) return null;
    return a.downloadable ? `[${a.name}](${guideUrl}/download/${a.id})` : a.name;
  };
  const p = b.props as Record<string, any>;

  switch (b.type) {
    case "text":
      return richTextToMarkdown(p.doc);
    case "heading": {
      const level = Math.min(6, headingDepth + Number(p.level ?? 2));
      return p.text ? `${"#".repeat(level)} ${p.text}` : "";
    }
    case "strategy_field": {
      const key = p.fieldKey as StrategyFieldKey;
      const body = strategyValueToMarkdown(s.strategy[key]);
      return body ? `**${STRATEGY_LABELS[key]}:**\n\n${body}` : "";
    }
    case "palette": {
      const rows = (p.tokenIds as string[]).map((id) => colors.get(id)).filter(Boolean);
      if (!rows.length) return "";
      return rows
        .map((c) => `- **${c!.name}** ${c!.hex} · RGB ${c!.rgb.r} ${c!.rgb.g} ${c!.rgb.b} · ${cmykText(c!.cmyk)}${c!.cmykIsDerived ? " (approx.)" : ""}${c!.pantone ? ` · ${c!.pantone}` : ""}`)
        .join("\n");
    }
    case "color_combinations": {
      const rows = (p.pairs as Array<{ foregroundId: string; backgroundId: string }>)
        .map(({ foregroundId, backgroundId }) => {
          const fg = colors.get(foregroundId);
          const bg = colors.get(backgroundId);
          if (!fg || !bg) return null;
          const ratio = contrastRatio(fg.hex, bg.hex);
          return `- ${fg.name} on ${bg.name}: contrast ${ratio.toFixed(1)}:1 (${wcagGrade(ratio)})`;
        })
        .filter(Boolean);
      return rows.length ? `Approved colour combinations:\n\n${rows.join("\n")}` : "";
    }
    case "type_specimen": {
      const rows = (p.styleIds as string[]).map((id) => styles.get(id)).filter(Boolean);
      return rows.map((t) => `- ${t!.name}: ${families.get(t!.familyId)?.name ?? "?"} ${t!.weight}, ${t!.size}px / ${t!.lineHeight}`).join("\n");
    }
    case "type_family": {
      const f = p.familyId ? families.get(p.familyId) : undefined;
      return f ? `Typeface: **${f.name}** (${f.role}), fallback ${f.fallback}` : "";
    }
    case "image": {
      const name = assetLine(p.assetId);
      if (!name) return "";
      const alt = p.alt ? ` ${p.alt}.` : "";
      return `Image: ${name}.${alt}${p.caption ? ` ${p.caption}` : ""}`;
    }
    case "video": {
      const name = assetLine(p.assetId);
      return name ? `Video: ${name}.${p.caption ? ` ${p.caption}` : ""}` : "";
    }
    case "gallery": {
      const names = (p.assetIds as string[]).map(assetLine).filter(Boolean);
      return names.length ? `Gallery: ${names.join(", ")}.${p.caption ? ` ${p.caption}` : ""}` : "";
    }
    case "file_download": {
      const names = (p.assetIds as string[]).map(assetLine).filter(Boolean);
      return names.length ? `${p.label || "Downloads"}:\n\n${names.map((n) => `- ${n}`).join("\n")}` : "";
    }
    case "dos_donts": {
      const items = p.items as Array<{ kind: "do" | "dont"; note: string; assetId: string | null }>;
      return items
        .filter((i) => i.note || i.assetId)
        .map((i) => `- ${i.kind === "do" ? "DO" : "DON'T"}: ${i.note}${i.assetId && assets.get(i.assetId) ? ` (example: ${assets.get(i.assetId)!.name})` : ""}`)
        .join("\n");
    }
    case "grid":
      return b.children.map((c) => blockToMarkdown(c, s, guideUrl, headingDepth)).filter(Boolean).join("\n\n");
    case "divider":
      return "";
    default:
      return "";
  }
}

function sectionToMarkdown(sec: SnapshotSection, s: GuideSnapshot, guideUrl: string, depth: number): string {
  const level = Math.min(6, depth + 2);
  const parts = [`${"#".repeat(level)} ${sec.title}`];
  for (const b of sec.blocks) {
    const md = blockToMarkdown(b, s, guideUrl, level);
    if (md.trim()) parts.push(md.trim());
  }
  for (const child of sec.children) parts.push(sectionToMarkdown(child, s, guideUrl, depth + 1));
  return parts.join("\n\n");
}

export function snapshotToMarkdown(s: GuideSnapshot, meta: AgentExportMeta): string {
  const out: string[] = [];
  out.push(`# ${s.brand.name} brand guidelines`);
  out.push(
    [
      `> Machine-readable version of ${meta.guideUrl}`,
      `> Version ${meta.version}, published ${meta.publishedAt.slice(0, 10)}. Generated from the published guide; drafts are never included.`,
      `> When you create anything for ${s.brand.name}, use only the colours, typefaces and language rules below. If something isn't covered, say so rather than inventing a rule.`,
    ].join("\n"),
  );
  if (s.brand.description) out.push(s.brand.description);

  const strategyKeys = (Object.keys(STRATEGY_LABELS) as StrategyFieldKey[]).filter((k) => strategyValueToMarkdown(s.strategy[k]));
  if (strategyKeys.length) {
    out.push("## Brand strategy");
    for (const k of strategyKeys) out.push(`### ${STRATEGY_LABELS[k]}\n\n${strategyValueToMarkdown(s.strategy[k])}`);
  }

  if (s.tokens.colors.length) {
    out.push("## Colours");
    out.push(
      [
        "| Name | Group | HEX | RGB | CMYK | Pantone |",
        "| --- | --- | --- | --- | --- | --- |",
        ...s.tokens.colors.map(
          (c) =>
            `| ${esc(c.name)} | ${c.group} | ${c.hex} | ${c.rgb.r} ${c.rgb.g} ${c.rgb.b} | ${cmykText(c.cmyk)}${c.cmykIsDerived ? " (approx.)" : ""} | ${c.pantone ? esc(c.pantone) : ""} |`,
        ),
      ].join("\n"),
    );
    out.push("CMYK marked (approx.) is computed from HEX and is not print-accurate; ask the brand owner for print values.");
  }

  if (s.tokens.typeFamilies.length) {
    out.push("## Typography");
    out.push(s.tokens.typeFamilies.map((f) => `- **${f.name}** (${f.role} typeface, ${f.source}); fallback: ${f.fallback}`).join("\n"));
    if (s.tokens.typeStyles.length) {
      const fam = new Map(s.tokens.typeFamilies.map((f) => [f.id, f.name]));
      out.push(
        [
          "| Style | Typeface | Weight | Size (px) | Line height | Tracking | Case |",
          "| --- | --- | --- | --- | --- | --- | --- |",
          ...s.tokens.typeStyles.map(
            (t) => `| ${esc(t.name)} | ${esc(fam.get(t.familyId) ?? "?")} | ${t.weight} | ${t.size} | ${t.lineHeight} | ${t.tracking} | ${t.textTransform} |`,
          ),
        ].join("\n"),
      );
    }
  }

  if (s.sections.length) {
    out.push("## Guidelines");
    for (const sec of s.sections) out.push(sectionToMarkdown(sec, s, meta.guideUrl, 1));
  }

  const downloads = s.assets.filter((a) => a.downloadable);
  if (downloads.length) {
    out.push("## Downloadable files");
    out.push(downloads.map((a) => `- [${a.name}](${meta.guideUrl}/download/${a.id}) (${a.category}, ${a.mime})`).join("\n"));
  }

  return out.join("\n\n").replace(/\n{3,}/g, "\n\n") + "\n";
}

// ---------------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------------

export type AgentBrandJson = {
  $schema: "https://stella.app/schemas/brand.v1.json";
  brand: { name: string; description: string | null; guideUrl: string; version: number; publishedAt: string };
  strategy: Partial<Record<StrategyFieldKey, { label: string; value: StrategyField["value"] }>>;
  colors: Array<{
    name: string;
    group: string;
    hex: string;
    rgb: [number, number, number];
    cmyk: [number, number, number, number];
    cmykApproximate: boolean;
    pantone: string | null;
  }>;
  typography: {
    typefaces: Array<{ name: string; role: string; source: string; fallback: string }>;
    styles: Array<{ name: string; typeface: string; weight: number; sizePx: number; lineHeight: number; tracking: number; textTransform: string }>;
  };
  guidelines: Array<{ title: string; path: string[]; markdown: string }>;
  files: Array<{ name: string; category: string; mime: string; downloadUrl: string }>;
};

export function snapshotToAgentJson(s: GuideSnapshot, meta: AgentExportMeta): AgentBrandJson {
  const fam = new Map(s.tokens.typeFamilies.map((f) => [f.id, f.name]));
  const strategy: AgentBrandJson["strategy"] = {};
  for (const k of Object.keys(STRATEGY_LABELS) as StrategyFieldKey[]) {
    const v = s.strategy[k];
    if (v !== undefined && strategyValueToMarkdown(v)) strategy[k] = { label: STRATEGY_LABELS[k], value: v };
  }
  const guidelines: AgentBrandJson["guidelines"] = [];
  const walk = (sec: SnapshotSection, path: string[]) => {
    const here = [...path, sec.title];
    const markdown = sec.blocks
      .map((b) => blockToMarkdown(b, s, meta.guideUrl, 2).trim())
      .filter(Boolean)
      .join("\n\n");
    guidelines.push({ title: sec.title, path: here, markdown });
    sec.children.forEach((c) => walk(c, here));
  };
  s.sections.forEach((sec) => walk(sec, []));

  return {
    $schema: "https://stella.app/schemas/brand.v1.json",
    brand: { name: s.brand.name, description: s.brand.description, guideUrl: meta.guideUrl, version: meta.version, publishedAt: meta.publishedAt },
    strategy,
    colors: s.tokens.colors.map((c) => ({
      name: c.name,
      group: c.group,
      hex: c.hex,
      rgb: [c.rgb.r, c.rgb.g, c.rgb.b],
      cmyk: [c.cmyk.c, c.cmyk.m, c.cmyk.y, c.cmyk.k],
      cmykApproximate: c.cmykIsDerived,
      pantone: c.pantone,
    })),
    typography: {
      typefaces: s.tokens.typeFamilies.map((f) => ({ name: f.name, role: f.role, source: f.source, fallback: f.fallback })),
      styles: s.tokens.typeStyles.map((t) => ({
        name: t.name,
        typeface: fam.get(t.familyId) ?? "",
        weight: t.weight,
        sizePx: Number(t.size),
        lineHeight: Number(t.lineHeight),
        tracking: Number(t.tracking),
        textTransform: t.textTransform,
      })),
    },
    guidelines,
    files: s.assets
      .filter((a) => a.downloadable)
      .map((a) => ({ name: a.name, category: a.category, mime: a.mime, downloadUrl: `${meta.guideUrl}/download/${a.id}` })),
  };
}
