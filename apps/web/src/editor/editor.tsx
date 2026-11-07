"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { BlockType, StrategyFieldKey } from "@stella/brand-schema";
import { BrandPanel, type BrandActions } from "./brand-panel";
import {
  addColor,
  addFamily,
  addStandardScale,
  addStyle,
  allColors,
  colorUsage,
  COLOR_GROUPS,
  colorsInGroup,
  deleteColor,
  deleteFamily,
  deleteStyle,
  moveColor,
  orderedStyles,
  updateColor,
  updateFamily,
  updateStyle,
} from "./brand-system";
import { Canvas, contrastGrade, STRATEGY_LABELS, type CanvasActions } from "./canvas";
import { FontLoader } from "./font-loader";
import { AssetPicker, AssetsPanel, type AssetActions, type UploadState } from "./assets-panel";
import { addAsset, addFontFile, assetUsage, deleteAsset, deleteFontFile, guessFontWeight, updateAsset } from "./assets";
import { AssetUrls } from "./canvas";
import { PublishPanel, type PublishedInfo } from "./publish-panel";
import { AssistantPanel, ImproveTool } from "./assistant-panel";
import { uploadAsset } from "./upload";
import { contrastRatio } from "@stella/brand-schema";
import {
  addBlock,
  addSection,
  childSections,
  deleteBlock,
  deleteSection,
  duplicateBlock,
  duplicateSection,
  moveBlock,
  moveSection,
  setStrategy,
  strategyText,
  docToText,
  textToDoc,
  topLevelAncestor,
  updateBlockLayout,
  updateBlockProps,
  updateSection,
  type BlockRow,
  type Draft,
  type SectionRow,
} from "./model";
import { SectionTree, type TreeActions } from "./section-tree";
import { useDraft, type SaveStatus } from "./use-draft";

export type EditorBrand = { id: string; name: string; slug: string; status: string };

export function Editor({ brand, initial, rev, assetUrls, uploadLimitMb, published }: {
  brand: EditorBrand;
  initial: Draft;
  rev: number;
  assetUrls: Record<string, string>;
  uploadLimitMb: number;
  published: PublishedInfo | null;
}) {
  const { draft, status, run } = useDraft(brand.id, initial, rev);
  const [urls, setUrls] = useState(assetUrls);
  const [upload, setUpload] = useState<UploadState>({ active: 0, errors: [] });
  const firstTop = childSections(initial, null)[0]?.id ?? null;
  const [sectionId, setSectionId] = useState<string | null>(firstTop);
  const [blockId, setBlockId] = useState<string | null>(null);
  const [focusSection, setFocusSection] = useState<string | null>(null);
  const [tab, setTab] = useState<"guide" | "brand" | "assets">("guide");
  const [notice, setNotice] = useState<string | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);

  const selectedSection = sectionId ? draft.sections[sectionId] : undefined;
  const rootId = selectedSection ? topLevelAncestor(draft, selectedSection.id) : childSections(draft, null)[0]?.id ?? null;
  const selectedBlock = blockId ? draft.blocks[blockId] : undefined;

  const selectSection = (id: string) => {
    setSectionId(id);
    setBlockId(null);
    setFocusSection(id);
  };

  const tree: TreeActions = useMemo(
    () => ({
      select: selectSection,
      rename: (id, title) => run((d) => updateSection(d, id, { title })),
      toggleHidden: (id) => run((d) => updateSection(d, id, { hidden: !d.sections[id]?.hidden })),
      addChild: (parentId) => {
        const r = run((d) => addSection(d, parentId, "New subsection"));
        if (r.created) selectSection(r.created);
      },
      duplicate: (id) => {
        const r = run((d) => duplicateSection(d, id));
        if (r.created) selectSection(r.created);
      },
      remove: (id) => {
        const s = draft.sections[id];
        if (!s || !window.confirm(`Delete "${s.title}" and everything inside it? You can't undo this.`)) return;
        run((d) => deleteSection(d, id));
        const remaining = childSections(draft, null).filter((x) => x.id !== id);
        setSectionId(s.parent_id ?? remaining[0]?.id ?? null);
        setBlockId(null);
      },
      move: (id, index) => run((d) => moveSection(d, id, index)),
      addTop: () => {
        const r = run((d) => addSection(d, null, "New section"));
        if (r.created) selectSection(r.created);
      },
    }),
    [run, draft],
  );

  const canvas: CanvasActions = {
    selectBlock: setBlockId,
    selectSection: (id) => {
      setSectionId(id);
      setBlockId(null);
    },
    setBlockProps: (id, props) => run((d) => updateBlockProps(d, id, props)),
    setStrategy: (key, value) => run((d) => setStrategy(d, key, value)),
    addBlock: (sid, type, afterId, props) => {
      const r = run((d) => addBlock(d, sid, type, afterId, props));
      if (r.created) setBlockId(r.created);
    },
    moveBlock: (id, dir) => run((d) => moveBlock(d, id, dir)),
    duplicateBlock: (id) => {
      const r = run((d) => duplicateBlock(d, id));
      if (r.created) setBlockId(r.created);
    },
    removeBlock: (id) => {
      run((d) => deleteBlock(d, id));
      setBlockId(null);
    },
  };

  const uploadFiles = async (files: File[]): Promise<string[]> => {
    setUpload((u) => ({ active: u.active + files.length, errors: [] }));
    const created: string[] = [];
    for (const file of files) {
      try {
        const { row, url } = await uploadAsset(brand.id, file, uploadLimitMb);
        run((d) => addAsset(d, row));
        created.push(row.id);
        if (url) setUrls((m) => ({ ...m, [row.id]: url }));
      } catch (e) {
        setUpload((u) => ({ ...u, errors: [...u.errors, e instanceof Error ? e.message : `Couldn't upload ${file.name}`] }));
      } finally {
        setUpload((u) => ({ ...u, active: u.active - 1 }));
      }
    }
    return created;
  };

  const assetActions: AssetActions = {
    upload: async (files) => {
      await uploadFiles(files);
    },
    update: (id, patch) => run((d) => updateAsset(d, id, patch)),
    remove: (id) => {
      const a = draft.assets[id];
      if (!a) return;
      const used = assetUsage(draft, id);
      const msg = used
        ? `Remove ${a.name}? It is used in ${used} place${used === 1 ? "" : "s"} and will be taken out of them.`
        : `Remove ${a.name} from the library?`;
      if (window.confirm(msg)) run((d) => deleteAsset(d, id));
    },
  };

  const brandActions: BrandActions = {
    uploadFontFiles: async (familyId, files) => {
      const fonts = files.filter((f) => /\.(woff2?|ttf|otf)$/i.test(f.name));
      if (fonts.length !== files.length) setNotice("Only .woff2, .woff, .ttf and .otf files can be added to a typeface.");
      const ids = await uploadFiles(fonts);
      ids.forEach((assetId, i) => {
        const guess = guessFontWeight(fonts[i]!.name);
        const r = run((d) => addFontFile(d, { family_id: familyId, asset_id: assetId, ...guess }));
        if (r.error) setNotice(r.error);
      });
    },
    deleteFontFile: (id) => run((d) => deleteFontFile(d, id)),
    setFontLicence: (familyId, downloadable, note) => run((d) => updateFamily(d, familyId, { downloadable, licence_note: note })),
    addColor: (input) => run((d) => addColor(d, input)).error,
    updateColor: (id, patch) => run((d) => updateColor(d, id, patch)).error,
    moveColor: (id, dir) => run((d) => moveColor(d, id, dir)),
    deleteColor: (id) => {
      const c = draft.colors[id];
      if (!c) return;
      const used = colorUsage(draft, id);
      const msg = used
        ? `Delete ${c.name}? It is used in ${used} block${used === 1 ? "" : "s"} and will be removed from them.`
        : `Delete ${c.name}?`;
      if (window.confirm(msg)) run((d) => deleteColor(d, id));
    },
    addFamily: (input) => run((d) => addFamily(d, input)).error,
    updateFamily: (id, patch) => run((d) => updateFamily(d, id, patch)),
    deleteFamily: (id) => {
      const r = run((d) => deleteFamily(d, id));
      setNotice(r.error ?? null);
    },
    addStyle: () => {
      const family = Object.values(draft.families).find((f) => f.role === "secondary") ?? Object.values(draft.families)[0];
      if (!family) return;
      run((d) => addStyle(d, { name: "New style", family_id: family.id, weight: 400, size: 16, line_height: 1.5, tracking: 0, text_transform: "none" }));
    },
    updateStyle: (id, patch) => run((d) => updateStyle(d, id, patch)),
    deleteStyle: (id) => {
      const st = draft.styles[id];
      if (st && window.confirm(`Delete the ${st.name} style?`)) run((d) => deleteStyle(d, id));
    },
    addStandardScale: () => {
      const families = Object.values(draft.families);
      const heading = families.find((f) => f.role === "primary") ?? families[0];
      const body = families.find((f) => f.role === "secondary") ?? heading;
      if (heading && body) {
        const r = run((d) => addStandardScale(d, heading.id, body.id));
        setNotice(r.error ?? null);
      }
    },
  };

  return (
    <div className="flex min-h-[calc(100vh-61px)] flex-col">
      <FontLoader draft={draft} urls={urls} />
      <div className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-5 py-2.5">
        <Link href="/dashboard" className="text-sm text-muted no-underline hover:text-ink">
          ← Brands
        </Link>
        <span className="h-5 w-px bg-line" />
        <span className="font-semibold">{brand.name}</span>
        <span className="rounded-full bg-[#f0eee8] px-2 py-0.5 text-xs capitalize text-muted">{brand.status}</span>
        <SaveIndicator status={status} />
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setAssistantOpen((o) => !o)}
          aria-pressed={assistantOpen}
          className={`rounded-md border px-3 py-1.5 text-sm ${assistantOpen ? "border-accent bg-paper text-accent" : "border-line hover:bg-paper"}`}
        >
          Assistant
        </button>
        <PublishPanel brand={brand} status={status} published={published} />
      </div>

      {status.state === "conflict" || status.state === "error" ? <SaveProblem status={status} /> : null}

      <div className="flex flex-1 flex-wrap">
        <aside className="max-h-[calc(100vh-110px)] w-full overflow-auto border-r border-line bg-surface p-3 md:sticky md:top-0 md:w-[300px]">
          <div role="tablist" aria-label="Editor panels" className="mb-3 flex gap-1 rounded-[var(--radius-control)] bg-paper p-1">
            {(
              [
                ["guide", "Guide"],
                ["brand", "Brand system"],
                ["assets", "Assets"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={`flex-1 rounded-md px-2 py-1.5 text-[13px] ${tab === key ? "bg-surface font-semibold shadow-sm" : "text-muted hover:text-ink"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {notice ? (
            <div role="alert" className="mb-3 flex items-start gap-2 rounded-md bg-[#fbf0d9] p-2.5 text-xs text-[#6b4700]">
              <span className="flex-1">{notice}</span>
              <button type="button" aria-label="Dismiss" onClick={() => setNotice(null)}>
                ✕
              </button>
            </div>
          ) : null}
          {tab === "guide" ? (
            <SectionTree draft={draft} selectedId={sectionId} actions={tree} />
          ) : tab === "brand" ? (
            <BrandPanel draft={draft} actions={brandActions} urls={urls} />
          ) : (
            <AssetsPanel draft={draft} urls={urls} upload={upload} actions={assetActions} limitMb={Math.min(uploadLimitMb, 50)} />
          )}
        </aside>

        <main className="min-w-0 flex-[999_1_480px] bg-paper p-4 md:p-8">
          {rootId ? (
            <AssetUrls.Provider value={urls}>
              <Canvas draft={draft} rootId={rootId} selectedBlockId={blockId} focusSectionId={focusSection} actions={canvas} />
            </AssetUrls.Provider>
          ) : (
            <EmptyGuide onAdd={tree.addTop} />
          )}
        </main>

        <aside className={`w-full border-l border-line bg-surface p-5 ${assistantOpen ? "lg:sticky lg:top-0 lg:max-h-[calc(100vh-110px)] lg:w-[380px] lg:overflow-auto" : "lg:w-[300px]"}`} aria-label={assistantOpen ? "Assistant" : "Settings"}>
          {assistantOpen ? (
            <AssistantPanel brandId={brand.id} draft={draft} run={run} onClose={() => setAssistantOpen(false)} />
          ) : selectedBlock ? (
            <BlockSettings brandId={brand.id} onStrategy={(key, value) => run((d) => setStrategy(d, key, value))} draft={draft} urls={urls} block={selectedBlock} openBrand={() => setTab("brand")} openAssets={() => setTab("assets")} onLayout={(layout) => run((d) => updateBlockLayout(d, selectedBlock.id, layout))} onProps={(props) => run((d) => updateBlockProps(d, selectedBlock.id, props))} />
          ) : selectedSection ? (
            <SectionSettings section={selectedSection} tree={tree} />
          ) : (
            <p className="text-sm text-muted">Select a section or block to see its settings.</p>
          )}
        </aside>
      </div>
    </div>
  );
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  const text =
    status.state === "saved" ? "All changes saved"
    : status.state === "pending" ? "Unsaved changes"
    : status.state === "saving" ? "Saving…"
    : status.state === "retrying" ? status.message
    : "Not saved";
  const tone =
    status.state === "saved" ? "text-success"
    : status.state === "retrying" ? "text-[#8a5a00]"
    : status.state === "conflict" || status.state === "error" ? "text-danger"
    : "text-muted";
  return (
    <span role="status" aria-live="polite" className={`text-[13px] ${tone}`}>
      {text}
    </span>
  );
}

function SaveProblem({ status }: { status: Extract<SaveStatus, { state: "conflict" | "error" }> }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 border-b border-[#f0c9c0] bg-[#fbe9e5] px-5 py-3 text-sm text-danger">
      <span>
        {status.message} Your latest edits are kept in this tab but were not saved. Reloading loads the saved version.
      </span>
      <button type="button" onClick={() => window.location.reload()} className="rounded-md border border-danger px-3 py-1.5 hover:bg-white">
        Reload the guide
      </button>
    </div>
  );
}

function SectionSettings({ section, tree }: { section: SectionRow; tree: TreeActions }) {
  return (
    <div className="flex flex-col gap-5 text-sm">
      <div>
        <span className="text-xs uppercase tracking-[0.08em] text-muted">Section</span>
        <h2 className="mt-1 text-base font-semibold">{section.title}</h2>
      </div>
      <label className="flex flex-col gap-1.5 font-medium">
        Name
        <input
          key={section.id}
          defaultValue={section.title}
          maxLength={120}
          onBlur={(e) => e.currentTarget.value !== section.title && tree.rename(section.id, e.currentTarget.value)}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          className="h-10 rounded-[var(--radius-control)] border border-line-strong px-3 font-normal outline-none focus:border-accent"
        />
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={!section.hidden} onChange={() => tree.toggleHidden(section.id)} />
        Show in the published guide
      </label>
      <div className="flex flex-col gap-2 border-t border-line pt-4">
        <button type="button" onClick={() => tree.addChild(section.id)} className="rounded-md border border-line px-3 py-2 text-left hover:bg-paper">
          Add subsection
        </button>
        <button type="button" onClick={() => tree.duplicate(section.id)} className="rounded-md border border-line px-3 py-2 text-left hover:bg-paper">
          Duplicate section
        </button>
        <button type="button" onClick={() => tree.remove(section.id)} className="rounded-md border border-line px-3 py-2 text-left text-danger hover:bg-paper">
          Delete section
        </button>
      </div>
    </div>
  );
}

const BLOCK_NAMES: Partial<Record<BlockType, string>> = {
  text: "Text",
  heading: "Heading",
  strategy_field: "Strategy field",
  divider: "Divider",
  palette: "Colour palette",
  color_combinations: "Colour combinations",
  type_specimen: "Type specimen",
  type_family: "Typeface",
  image: "Image",
  video: "Video",
  gallery: "Gallery",
  file_download: "File download",
  dos_donts: "Do's and don'ts",
};

function BlockSettings({ brandId, onStrategy, draft, urls, block, openBrand, openAssets, onLayout, onProps }: {
  brandId: string;
  onStrategy: (key: StrategyFieldKey, value: string) => void;
  draft: Draft;
  urls: Record<string, string>;
  openAssets: () => void;
  block: BlockRow;
  openBrand: () => void;
  onLayout: (layout: Partial<BlockRow["layout"]>) => void;
  onProps: (props: Record<string, unknown>) => void;
}) {
  return (
    <div className="flex flex-col gap-5 text-sm">
      <div>
        <span className="text-xs uppercase tracking-[0.08em] text-muted">Selected block</span>
        <h2 className="mt-1 text-base font-semibold">
          {block.type === "strategy_field" ? STRATEGY_LABELS[block.props.fieldKey as StrategyFieldKey] : BLOCK_NAMES[block.type] ?? block.type}
        </h2>
      </div>
      <Segmented
        label="Width"
        value={block.layout.width}
        options={[
          ["wide", "Wide"],
          ["narrow", "Narrow"],
        ]}
        onChange={(v) => onLayout({ width: v as BlockRow["layout"]["width"] })}
      />
      {block.type === "heading" ? (
        <Segmented
          label="Size"
          value={String(block.props.level ?? 2)}
          options={[
            ["1", "Large"],
            ["2", "Medium"],
            ["3", "Small"],
          ]}
          onChange={(v) => onProps({ ...block.props, level: Number(v) })}
        />
      ) : null}
      {block.type === "palette" ? <PaletteSettings draft={draft} block={block} onProps={onProps} openBrand={openBrand} /> : null}
      {block.type === "color_combinations" ? <CombinationSettings draft={draft} block={block} onProps={onProps} openBrand={openBrand} /> : null}
      {block.type === "type_specimen" ? <SpecimenSettings draft={draft} block={block} onProps={onProps} openBrand={openBrand} /> : null}
      {block.type === "type_family" ? <FamilySettings draft={draft} block={block} onProps={onProps} openBrand={openBrand} /> : null}
      {["image", "video", "gallery", "file_download", "dos_donts"].includes(block.type) ? (
        <AssetBlockSettings draft={draft} urls={urls} block={block} onProps={onProps} openAssets={openAssets} />
      ) : null}
      {block.type === "strategy_field" ? (
        <>
          <Segmented
            label="Display"
            value={String(block.props.display ?? "body")}
            options={[
              ["statement", "Statement"],
              ["body", "Paragraph"],
              ["list", "List"],
            ]}
            onChange={(v) => onProps({ ...block.props, display: v })}
          />
          <p className="rounded-md bg-paper p-3 text-[13px] leading-relaxed text-muted">
            Strategy fields are shared. Editing this text changes it everywhere this field appears, and the assistant
            reads it.
          </p>
          <ImproveTool
            brandId={brandId}
            text={strategyText(draft.strategy[block.props.fieldKey as StrategyFieldKey])}
            onUse={(text) => onStrategy(block.props.fieldKey as StrategyFieldKey, text)}
          />
        </>
      ) : null}
      {block.type === "text" ? (
        <ImproveTool brandId={brandId} text={docToText(block.props.doc)} onUse={(text) => onProps({ ...block.props, doc: textToDoc(text) })} />
      ) : null}
    </div>
  );
}

function Segmented({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 font-medium">{label}</legend>
      <div className="flex overflow-hidden rounded-[var(--radius-control)] border border-line">
        {options.map(([v, text]) => (
          <button
            key={v}
            type="button"
            aria-pressed={value === v}
            onClick={() => onChange(v)}
            className={`flex-1 px-2 py-2 ${value === v ? "bg-ink text-white" : "bg-surface hover:bg-paper"}`}
          >
            {text}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function EmptyGuide({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-24 text-center">
      <p className="font-[family-name:var(--font-display)] text-3xl">An empty guide</p>
      <p className="text-sm text-muted">Add your first section to start building.</p>
      <button type="button" onClick={onAdd} className="rounded-[var(--radius-control)] bg-ink px-4 py-2.5 text-sm font-medium text-white">
        Add a section
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Brand system block settings
// ---------------------------------------------------------------------------

type SettingsProps = { draft: Draft; block: BlockRow; onProps: (props: Record<string, unknown>) => void; openBrand: () => void };

function NoTokens({ what, openBrand }: { what: string; openBrand: () => void }) {
  return (
    <p className="rounded-md bg-paper p-3 text-[13px] text-muted">
      No {what} yet.{" "}
      <button type="button" onClick={openBrand} className="text-accent hover:underline">
        Open Brand system
      </button>
    </p>
  );
}

function PaletteSettings({ draft, block, onProps, openBrand }: SettingsProps) {
  const ids = (block.props.tokenIds as string[]) ?? [];
  const show = block.props.show as { hex: boolean; rgb: boolean; cmyk: boolean; pantone: boolean };
  if (!Object.keys(draft.colors).length) return <NoTokens what="colours" openBrand={openBrand} />;
  const toggle = (id: string) => {
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    // Keep the brand's colour order regardless of click order.
    const order = allColors(draft).map((c) => c.id);
    onProps({ ...block.props, tokenIds: next.sort((a, b) => order.indexOf(a) - order.indexOf(b)) });
  };
  return (
    <>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1.5 font-medium">Colours shown</legend>
        {COLOR_GROUPS.map((g) => {
          const colors = colorsInGroup(draft, g.key);
          if (!colors.length) return null;
          return (
            <div key={g.key} className="flex flex-col gap-1">
              <div className="flex items-center text-xs text-subtle">
                <span className="flex-1">{g.label}</span>
                <button
                  type="button"
                  className="text-accent hover:underline"
                  onClick={() => {
                    const order = allColors(draft).map((c) => c.id);
                    const merged = [...new Set([...ids, ...colors.map((c) => c.id)])];
                    onProps({ ...block.props, tokenIds: merged.sort((a, b) => order.indexOf(a) - order.indexOf(b)) });
                  }}
                >
                  Add all
                </button>
              </div>
              {colors.map((c) => (
                <label key={c.id} className="flex items-center gap-2 rounded px-1 py-1 hover:bg-paper">
                  <input type="checkbox" checked={ids.includes(c.id)} onChange={() => toggle(c.id)} />
                  <span className="h-4 w-4 rounded border border-black/10" style={{ background: c.hex }} />
                  {c.name}
                </label>
              ))}
            </div>
          );
        })}
      </fieldset>
      <Segmented
        label="Layout"
        value={String(block.props.layout ?? "columns")}
        options={[
          ["columns", "Columns"],
          ["grid", "Grid"],
          ["stacked", "Stacked"],
        ]}
        onChange={(v) => onProps({ ...block.props, layout: v })}
      />
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 font-medium">Values shown</legend>
        {(["hex", "rgb", "cmyk", "pantone"] as const).map((k) => (
          <label key={k} className="flex items-center gap-2">
            <input type="checkbox" checked={Boolean(show?.[k])} onChange={(e) => onProps({ ...block.props, show: { ...show, [k]: e.target.checked } })} />
            {k === "pantone" ? "Pantone" : k.toUpperCase()}
          </label>
        ))}
      </fieldset>
    </>
  );
}

function CombinationSettings({ draft, block, onProps, openBrand }: SettingsProps) {
  const pairs = (block.props.pairs as Array<{ foregroundId: string; backgroundId: string }>) ?? [];
  const colors = allColors(draft);
  const [fg, setFg] = useState(colors[1]?.id ?? colors[0]?.id ?? "");
  const [bg, setBg] = useState(colors[0]?.id ?? "");
  if (colors.length < 2) return <NoTokens what="colour pairs (add at least two colours)" openBrand={openBrand} />;
  const select = "h-9 w-full rounded-[var(--radius-control)] border border-line-strong bg-surface px-2 text-sm";
  const preview = draft.colors[fg] && draft.colors[bg] ? contrastRatio(draft.colors[fg]!.hex, draft.colors[bg]!.hex) : null;
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <span className="font-medium">Pairings</span>
        {pairs.map((p, i) => {
          const f = draft.colors[p.foregroundId];
          const b = draft.colors[p.backgroundId];
          if (!f || !b) return null;
          const ratio = contrastRatio(f.hex, b.hex);
          return (
            <div key={`${p.foregroundId}-${p.backgroundId}`} className="flex items-center gap-2 rounded border border-line p-2">
              <span className="flex h-7 w-7 items-center justify-center rounded text-xs font-semibold" style={{ background: b.hex, color: f.hex }}>
                Aa
              </span>
              <span className="min-w-0 flex-1 text-xs">
                {f.name} on {b.name}
                <br />
                <span className={contrastGrade(ratio).good ? "text-muted" : "text-danger"}>
                  {ratio.toFixed(1)}:1 · {contrastGrade(ratio).label}
                </span>
              </span>
              <button type="button" className="text-xs text-danger" onClick={() => onProps({ ...block.props, pairs: pairs.filter((_, j) => j !== i) })}>
                Remove
              </button>
            </div>
          );
        })}
      </div>
      <div className="flex flex-col gap-2 rounded-md bg-paper p-3">
        <label className="flex flex-col gap-1 text-xs font-medium">
          Text colour
          <select value={fg} onChange={(e) => setFg(e.target.value)} className={select}>
            {colors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          Background colour
          <select value={bg} onChange={(e) => setBg(e.target.value)} className={select}>
            {colors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {preview !== null ? (
          <span className="text-xs text-muted">
            Contrast {preview.toFixed(1)}:1 · {contrastGrade(preview).label}
          </span>
        ) : null}
        <button
          type="button"
          disabled={!fg || !bg || fg === bg || pairs.some((p) => p.foregroundId === fg && p.backgroundId === bg)}
          onClick={() => onProps({ ...block.props, pairs: [...pairs, { foregroundId: fg, backgroundId: bg }] })}
          className="rounded-md bg-ink px-3 py-1.5 text-[13px] text-white disabled:opacity-40"
        >
          Add pairing
        </button>
      </div>
    </>
  );
}

function SpecimenSettings({ draft, block, onProps, openBrand }: SettingsProps) {
  const ids = (block.props.styleIds as string[]) ?? [];
  const styles = orderedStyles(draft);
  if (!styles.length) return <NoTokens what="type styles" openBrand={openBrand} />;
  const order = styles.map((s) => s.id);
  return (
    <>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1.5 font-medium">Styles shown</legend>
        <button type="button" className="mb-1 self-start text-xs text-accent hover:underline" onClick={() => onProps({ ...block.props, styleIds: order })}>
          Show all styles
        </button>
        {styles.map((s) => (
          <label key={s.id} className="flex items-center gap-2 rounded px-1 py-1 hover:bg-paper">
            <input
              type="checkbox"
              checked={ids.includes(s.id)}
              onChange={() => {
                const next = ids.includes(s.id) ? ids.filter((x) => x !== s.id) : [...ids, s.id];
                onProps({ ...block.props, styleIds: next.sort((a, b) => order.indexOf(a) - order.indexOf(b)) });
              }}
            />
            {s.name}
          </label>
        ))}
      </fieldset>
      <label className="flex flex-col gap-1.5 font-medium">
        Sample text
        <textarea
          key={block.id}
          defaultValue={String(block.props.sampleText ?? "")}
          maxLength={300}
          rows={3}
          onBlur={(e) => onProps({ ...block.props, sampleText: e.currentTarget.value })}
          className="rounded-[var(--radius-control)] border border-line-strong p-2 font-normal outline-none focus:border-accent"
        />
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={block.props.showDetails !== false} onChange={(e) => onProps({ ...block.props, showDetails: e.target.checked })} />
        Show size, weight and spacing
      </label>
    </>
  );
}

function FamilySettings({ draft, block, onProps, openBrand }: SettingsProps) {
  const families = Object.values(draft.families);
  if (!families.length) return <NoTokens what="typefaces" openBrand={openBrand} />;
  return (
    <>
      <label className="flex flex-col gap-1.5 font-medium">
        Typeface
        <select
          value={String(block.props.familyId ?? "")}
          onChange={(e) => onProps({ ...block.props, familyId: e.target.value || null })}
          className="h-10 rounded-[var(--radius-control)] border border-line-strong bg-surface px-2 font-normal"
        >
          <option value="">Choose a typeface</option>
          {families.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={block.props.showWeights !== false} onChange={(e) => onProps({ ...block.props, showWeights: e.target.checked })} />
        Show weights
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={block.props.showCharacters !== false} onChange={(e) => onProps({ ...block.props, showCharacters: e.target.checked })} />
        Show character set
      </label>
    </>
  );
}

// ---------------------------------------------------------------------------
// Asset block settings
// ---------------------------------------------------------------------------

function AssetBlockSettings({ draft, urls, block, onProps, openAssets }: {
  draft: Draft;
  urls: Record<string, string>;
  block: BlockRow;
  onProps: (props: Record<string, unknown>) => void;
  openAssets: () => void;
}) {
  const p = block.props;
  const text = (key: string, label: string, max: number) => (
    <label className="flex flex-col gap-1.5 font-medium">
      {label}
      <input
        key={`${block.id}-${key}`}
        defaultValue={String(p[key] ?? "")}
        maxLength={max}
        onBlur={(e) => onProps({ ...p, [key]: e.currentTarget.value || (key === "caption" ? null : "") })}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className="h-10 rounded-[var(--radius-control)] border border-line-strong px-3 font-normal outline-none focus:border-accent"
      />
    </label>
  );

  if (block.type === "image") {
    return (
      <>
        <div className="flex flex-col gap-1.5">
          <span className="font-medium">Image</span>
          <AssetPicker draft={draft} urls={urls} kind="image" multiple={false} selected={p.assetId ? [String(p.assetId)] : []} onChange={(ids) => onProps({ ...p, assetId: ids[0] ?? null })} onUpload={openAssets} />
        </div>
        {text("alt", "Alt text (describes the image for screen readers)", 300)}
        {text("caption", "Caption", 300)}
        <Segmented label="Fit" value={String(p.fit ?? "contain")} options={[["contain", "Whole image"], ["cover", "Fill frame"]]} onChange={(v) => onProps({ ...p, fit: v })} />
        <label className="flex flex-col gap-1.5 font-medium">
          Background
          <select value={String(p.background ?? "")} onChange={(e) => onProps({ ...p, background: e.target.value || null })} className="h-10 rounded-[var(--radius-control)] border border-line-strong bg-surface px-2 font-normal">
            <option value="">Neutral</option>
            {allColors(draft).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </>
    );
  }
  if (block.type === "video") {
    return (
      <>
        <div className="flex flex-col gap-1.5">
          <span className="font-medium">Video</span>
          <AssetPicker draft={draft} urls={urls} kind="video" multiple={false} selected={p.assetId ? [String(p.assetId)] : []} onChange={(ids) => onProps({ ...p, assetId: ids[0] ?? null })} onUpload={openAssets} />
        </div>
        {text("caption", "Caption", 300)}
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={Boolean(p.autoplay)} onChange={(e) => onProps({ ...p, autoplay: e.target.checked })} />
          Play automatically (muted)
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={Boolean(p.loop)} onChange={(e) => onProps({ ...p, loop: e.target.checked })} />
          Loop
        </label>
      </>
    );
  }
  if (block.type === "gallery") {
    return (
      <>
        <div className="flex flex-col gap-1.5">
          <span className="font-medium">Images ({((p.assetIds as string[]) ?? []).length})</span>
          <AssetPicker draft={draft} urls={urls} kind="image" multiple selected={(p.assetIds as string[]) ?? []} onChange={(ids) => onProps({ ...p, assetIds: ids })} onUpload={openAssets} />
        </div>
        <Segmented label="Columns" value={String(p.columns ?? 3)} options={[["2", "2"], ["3", "3"], ["4", "4"]]} onChange={(v) => onProps({ ...p, columns: Number(v) })} />
        {text("caption", "Caption", 300)}
      </>
    );
  }
  if (block.type === "file_download") {
    return (
      <>
        {text("label", "Heading", 80)}
        <div className="flex flex-col gap-1.5">
          <span className="font-medium">Files</span>
          <AssetPicker draft={draft} urls={urls} kind="any" multiple selected={(p.assetIds as string[]) ?? []} onChange={(ids) => onProps({ ...p, assetIds: ids })} onUpload={openAssets} />
        </div>
        <p className="rounded-md bg-paper p-3 text-[13px] text-muted">Clients can only download files marked as downloadable in Assets.</p>
      </>
    );
  }
  // dos_donts
  const items = (p.items as Array<{ assetId: string | null; kind: "do" | "dont"; note: string }>) ?? [];
  const setItems = (next: typeof items) => onProps({ ...p, items: next });
  return (
    <div className="flex flex-col gap-3">
      {items.map((item, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-md border border-line p-2.5">
          <Segmented label={`Example ${i + 1}`} value={item.kind} options={[["do", "Do"], ["dont", "Don't"]]} onChange={(v) => setItems(items.map((x, j) => (j === i ? { ...x, kind: v as "do" | "dont" } : x)))} />
          <AssetPicker draft={draft} urls={urls} kind="image" multiple={false} selected={item.assetId ? [item.assetId] : []} onChange={(ids) => setItems(items.map((x, j) => (j === i ? { ...x, assetId: ids[0] ?? null } : x)))} onUpload={openAssets} />
          <input
            key={`${block.id}-note-${i}-${item.note}`}
            defaultValue={item.note}
            maxLength={300}
            placeholder={item.kind === "do" ? "e.g. Use the full-colour logo on Shell" : "e.g. Don't stretch the logo"}
            onBlur={(e) => setItems(items.map((x, j) => (j === i ? { ...x, note: e.currentTarget.value } : x)))}
            className="h-9 rounded-[var(--radius-control)] border border-line-strong px-2.5 text-sm outline-none focus:border-accent"
          />
          <button type="button" onClick={() => setItems(items.filter((_, j) => j !== i))} className="self-end text-xs text-danger">
            Remove example
          </button>
        </div>
      ))}
      <button
        type="button"
        disabled={items.length >= 24}
        onClick={() => setItems([...items, { assetId: null, kind: items.length % 2 ? "dont" : "do", note: "" }])}
        className="rounded-md border border-dashed border-line-strong px-3 py-2"
      >
        Add example
      </button>
    </div>
  );
}
