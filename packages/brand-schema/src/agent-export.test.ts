import { describe, expect, it } from "vitest";
import { richTextToMarkdown, snapshotToAgentJson, snapshotToMarkdown, wcagGrade } from "./agent-export";
import type { Block } from "./blocks";
import type { Asset, ColorToken, Section } from "./entities";
import { buildSnapshot, type SnapshotInput } from "./snapshot";

const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
const BRAND = uuid(1);
const META = { version: 3, publishedAt: "2026-11-06T10:00:00.000Z", guideUrl: "https://stella.app/g/ember-and-yam" };

const section = (n: number, title: string, position: number, extra: Partial<Section> = {}): Section => ({
  id: uuid(n),
  brandId: BRAND,
  parentId: null,
  title,
  slug: title.toLowerCase().replace(/\s+/g, "-"),
  position,
  hidden: false,
  templateKey: null,
  ...extra,
});

const block = (n: number, sectionN: number, type: Block["type"], props: Record<string, unknown>, position = 1024, parentBlockN?: number): Block => ({
  id: uuid(n),
  sectionId: uuid(sectionN),
  parentBlockId: parentBlockN ? uuid(parentBlockN) : null,
  type,
  position,
  props,
  layout: { width: "wide", span: 1 },
  origin: "manual",
  schemaVersion: 1,
});

const color = (n: number, name: string, hex: string, position: number, extra: Partial<ColorToken> = {}): ColorToken => ({
  id: uuid(n),
  brandId: BRAND,
  name,
  hex,
  cmykOverride: null,
  pantone: null,
  group: "primary",
  position,
  ...extra,
});

const asset = (n: number, name: string, extra: Partial<Asset> = {}): Asset => ({
  id: uuid(n),
  brandId: BRAND,
  category: "logo",
  name,
  storagePath: `${BRAND}/${uuid(n)}/${name}`,
  mime: "image/svg+xml",
  size: 100,
  width: null,
  height: null,
  clientVisible: false,
  ...extra,
});

const doc = (...paragraphs: string[]) => ({ type: "doc", content: paragraphs.map((p) => ({ type: "paragraph", content: [{ type: "text", text: p }] })) });

function input(): SnapshotInput {
  return {
    brand: { id: BRAND, name: "Ember & Yam", slug: "ember-and-yam", description: "Modern West African grill in Lagos." },
    sections: [
      section(10, "Colour", 2048),
      section(11, "Logo", 1024),
      section(12, "Secret", 3072, { hidden: true }),
      section(13, "Clear space", 1024, { parentId: uuid(11) }),
    ],
    blocks: [
      block(20, 10, "palette", { tokenIds: [uuid(30), uuid(31)] }),
      block(21, 10, "color_combinations", { pairs: [{ foregroundId: uuid(31), backgroundId: uuid(32) }] }, 2048),
      block(22, 11, "image", { assetId: uuid(40), alt: "Primary lock-up" }),
      block(23, 11, "file_download", { assetIds: [uuid(41), uuid(40)], label: "Logo pack" }, 2048),
      block(24, 13, "text", { doc: doc("Keep clear space equal to the ampersand.", "Minimum 24 px.") }),
      block(25, 12, "text", { doc: doc("Internal only: launch date") }),
      block(26, 11, "dos_donts", { items: [{ kind: "dont", note: "Never recolour the mark", assetId: null }] }, 3072),
      block(27, 10, "grid", { columns: 2 }, 4096),
      block(28, 10, "heading", { text: "Inside a grid", level: 3 }, 1024, 27),
    ],
    colors: [
      color(30, "Ember", "#D2491E", 1024, { cmykOverride: { c: 0, m: 72, y: 90, k: 10 }, pantone: "PMS 7579 C" }),
      color(31, "Char", "#1E1A17", 2048),
      color(32, "Yam", "#F2D49B", 3072, { group: "secondary" }),
    ],
    typeFamilies: [{ id: uuid(50), brandId: BRAND, name: "Fraunces", source: "google", role: "primary", fallback: "Georgia, serif", licenceNote: null, downloadable: false }],
    fontFiles: [],
    typeStyles: [{ id: uuid(60), brandId: BRAND, name: "Display", familyId: uuid(50), weight: 600, size: 64, lineHeight: 1, tracking: -0.02, textTransform: "none", position: 1024 }],
    strategy: [
      { brandId: BRAND, key: "mission", value: "Feed Lagos well, late.", status: "approved", source: "manual" },
      { brandId: BRAND, key: "values", value: [{ title: "Generous", body: "Not flashy" }], status: "approved", source: "ai" },
      { brandId: BRAND, key: "vision", value: "Unapproved idea", status: "draft", source: "ai" },
    ],
    assets: [
      asset(40, "logo-primary.svg", { clientVisible: true }),
      asset(41, "logo-mono.svg", { clientVisible: false }),
    ],
  } as SnapshotInput;
}

describe("richTextToMarkdown", () => {
  it("renders paragraphs, marks, lists and headings", () => {
    const md = richTextToMarkdown({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Voice" }] },
        { type: "paragraph", content: [{ type: "text", text: "Warm", marks: [{ type: "bold" }] }, { type: "text", text: " and direct." }] },
        { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Say jollof" }] }] }] },
      ],
    });
    expect(md).toBe("## Voice\n\n**Warm** and direct.\n\n- Say jollof");
  });

  it("returns empty text for missing or malformed documents", () => {
    expect(richTextToMarkdown(null)).toBe("");
    expect(richTextToMarkdown({ type: "doc" })).toBe("");
  });
});

describe("snapshotToMarkdown", () => {
  const { snapshot } = buildSnapshot(input());
  const md = snapshotToMarkdown(snapshot, META);

  it("states provenance and version", () => {
    expect(md).toMatch(/^# Ember & Yam brand guidelines/);
    expect(md).toContain("Version 3, published 2026-11-06");
    expect(md).toContain(META.guideUrl);
  });

  it("includes only approved strategy, lists as bullets", () => {
    expect(md).toContain("### Mission\n\nFeed Lagos well, late.");
    expect(md).toContain("- **Generous**: Not flashy");
    expect(md).not.toContain("Unapproved idea");
  });

  it("lists colours with designer CMYK, Pantone and marks computed CMYK as approximate", () => {
    expect(md).toContain("| Ember | primary | #D2491E | 210 73 30 | C0 M72 Y90 K10 | PMS 7579 C |");
    expect(md).toMatch(/\| Char \| primary \| #1E1A17 \| 30 26 23 \| C\d+ M\d+ Y\d+ K\d+ \(approx\.\) \|/);
  });

  it("resolves token references inside blocks and grades contrast", () => {
    expect(md).toContain("- **Ember** #D2491E");
    expect(md).toMatch(/- Char on Yam: contrast \d+\.\d:1 \(AAA\)/);
  });

  it("renders sections in order, nested, and never hidden content", () => {
    expect(md.indexOf("### Logo")).toBeLessThan(md.indexOf("### Colour"));
    expect(md).toContain("#### Clear space\n\nKeep clear space equal to the ampersand.\n\nMinimum 24 px.");
    expect(md).not.toContain("Internal only");
    expect(md).toContain("Inside a grid");
  });

  it("links only downloadable files and never exposes storage paths", () => {
    expect(md).toContain(`[logo-primary.svg](${META.guideUrl}/download/${uuid(40)})`);
    expect(md).toContain("- logo-mono.svg");
    expect(md).not.toContain(`download/${uuid(41)}`);
    expect(md).not.toContain(`${BRAND}/`);
    expect(md).toContain("- DON'T: Never recolour the mark");
  });

  it("includes typography", () => {
    expect(md).toContain("**Fraunces** (primary typeface, google)");
    expect(md).toContain("| Display | Fraunces | 600 | 64 | 1 | -0.02 | none |");
  });
});

describe("snapshotToAgentJson", () => {
  const { snapshot } = buildSnapshot(input());
  const json = snapshotToAgentJson(snapshot, META);

  it("exposes structured tokens", () => {
    expect(json.colors[0]).toEqual({ name: "Ember", group: "primary", hex: "#D2491E", rgb: [210, 73, 30], cmyk: [0, 72, 90, 10], cmykApproximate: false, pantone: "PMS 7579 C" });
    expect(json.typography.styles[0]).toMatchObject({ name: "Display", typeface: "Fraunces", sizePx: 64 });
    expect(json.strategy.mission).toEqual({ label: "Mission", value: "Feed Lagos well, late." });
    expect(json.strategy.vision).toBeUndefined();
  });

  it("flattens guideline sections with their path", () => {
    expect(json.guidelines.map((g) => g.path.join(" / "))).toEqual(["Logo", "Logo / Clear space", "Colour"]);
  });

  it("lists only downloadable files, without storage paths", () => {
    expect(json.files).toEqual([{ name: "logo-primary.svg", category: "logo", mime: "image/svg+xml", downloadUrl: `${META.guideUrl}/download/${uuid(40)}` }]);
    expect(JSON.stringify(json)).not.toContain(`${BRAND}/`);
  });
});

describe("wcagGrade", () => {
  it("grades thresholds", () => {
    expect(wcagGrade(7)).toBe("AAA");
    expect(wcagGrade(4.5)).toBe("AA");
    expect(wcagGrade(3.1)).toBe("AA large");
    expect(wcagGrade(2)).toBe("fail");
  });
});
