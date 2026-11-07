"use client";

import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { formatBytes } from "./assets-panel";
import { colorValues, contrastRatio, STRATEGY_FIELD_KEYS, type BlockType, type StrategyFieldKey } from "@stella/brand-schema";
import { familyCss, weightsByFamily } from "./brand-system";
import { blockHasChildren, childSections, docToText, sectionBlocks, strategyText, textToDoc, type BlockRow, type Draft, type SectionRow } from "./model";
import { PlusIcon } from "./section-tree";

export const STRATEGY_LABELS: Record<StrategyFieldKey, string> = {
  overview: "Brand overview",
  story: "Brand story",
  mission: "Mission",
  vision: "Vision",
  purpose: "Brand purpose",
  values: "Brand values",
  positioning: "Brand positioning",
  audience: "Target audience",
  personality: "Brand personality",
  archetype: "Brand archetype",
  promise: "Brand promise",
  messaging: "Brand messaging",
  tone: "Tone of voice",
};

const LATER_STAGE: Partial<Record<BlockType, string>> = {
  grid: "Grid",
};

/** Short-lived URLs for the brand's private files, keyed by asset id. */
export const AssetUrls = createContext<Record<string, string>>({});

export type CanvasActions = {
  selectBlock: (id: string | null) => void;
  selectSection: (id: string) => void;
  setBlockProps: (id: string, props: Record<string, unknown>) => void;
  setStrategy: (key: StrategyFieldKey, value: string) => void;
  addBlock: (sectionId: string, type: BlockType, afterId: string | null, props?: Record<string, unknown>) => void;
  moveBlock: (id: string, dir: -1 | 1) => void;
  /** Drag and drop: move a top-level block to `index` among the blocks of `sectionId`. */
  moveBlockTo: (id: string, sectionId: string, index: number) => void;
  duplicateBlock: (id: string) => void;
  removeBlock: (id: string) => void;
};

/** Renders a top-level section and everything nested under it, as one page of the guide. */
export function Canvas({ draft, rootId, selectedBlockId, focusSectionId, actions }: {
  draft: Draft;
  rootId: string;
  selectedBlockId: string | null;
  focusSectionId: string | null;
  actions: CanvasActions;
}) {
  const root = draft.sections[rootId];
  const index = childSections(draft, null).findIndex((s) => s.id === rootId);

  // A stable id keeps dnd-kit's accessibility ids the same on server and client (no hydration mismatch).
  const dndId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const moving = draft.blocks[String(active.id)];
    const target = over.data.current as DropData | undefined;
    if (!moving || !target) return;
    if (target.kind === "section") {
      // Dropped on a section's empty area: put it at the end.
      actions.moveBlockTo(moving.id, target.sectionId, sectionBlocks(draft, target.sectionId).length);
      return;
    }
    const overIndex = sectionBlocks(draft, target.sectionId).findIndex((b) => b.id === String(over.id));
    if (overIndex >= 0) actions.moveBlockTo(moving.id, target.sectionId, overIndex);
  };

  useEffect(() => {
    if (!focusSectionId) return;
    document.getElementById(`section-${focusSectionId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focusSectionId]);

  if (!root) return null;
  return (
    <article
      className="mx-auto flex w-full max-w-[780px] flex-col gap-2 rounded bg-white px-6 py-10 shadow-[0_0_0_1px_var(--color-line)] md:px-14 md:py-14"
      onClick={(e) => {
        if (e.target === e.currentTarget) actions.selectBlock(null);
      }}
    >
      {root.hidden ? <HiddenNote /> : null}
      <span className="text-xs uppercase tracking-[0.14em] text-subtle">{String(index + 1).padStart(2, "0")}</span>
      <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SectionBody draft={draft} section={root} depth={0} selectedBlockId={selectedBlockId} actions={actions} />
      </DndContext>
    </article>
  );
}

function SectionBody({ draft, section, depth, selectedBlockId, actions }: {
  draft: Draft;
  section: SectionRow;
  depth: number;
  selectedBlockId: string | null;
  actions: CanvasActions;
}) {
  const blocks = sectionBlocks(draft, section.id);
  const HeadingTag = depth === 0 ? "h1" : depth === 1 ? "h2" : "h3";
  const headingSize = depth === 0 ? "text-5xl" : depth === 1 ? "text-[28px]" : "text-xl";
  return (
    <section id={`section-${section.id}`} className={`scroll-mt-6 ${depth ? "mt-10 border-t border-line pt-8" : ""} ${section.hidden ? "opacity-60" : ""}`}>
      <HeadingTag
        className={`mb-4 cursor-pointer font-[family-name:var(--font-display)] leading-tight ${headingSize}`}
        onClick={() => actions.selectSection(section.id)}
      >
        {section.title}
        {depth > 0 && section.hidden ? <span className="ml-2 align-middle font-sans text-xs text-subtle">Hidden</span> : null}
      </HeadingTag>
      <AddBlockMenu sectionId={section.id} afterId={null} actions={actions} compact={blocks.length > 0} />
      <SectionDropZone sectionId={section.id} empty={blocks.length === 0}>
        <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
          {blocks.map((b, i) => (
            <SortableBlock key={b.id} block={b} sectionId={section.id} lockedToSection={blockHasChildren(draft, b.id)}>
              {(drag) => (
                <>
                  <BlockFrame
                    block={b}
                    selected={b.id === selectedBlockId}
                    isFirst={i === 0}
                    isLast={i === blocks.length - 1}
                    actions={actions}
                    drag={drag}
                  >
                    <BlockView draft={draft} block={b} actions={actions} />
                  </BlockFrame>
                  <AddBlockMenu sectionId={section.id} afterId={b.id} actions={actions} compact />
                </>
              )}
            </SortableBlock>
          ))}
        </SortableContext>
      </SectionDropZone>
      {childSections(draft, section.id).map((child) => (
        <SectionBody key={child.id} draft={draft} section={child} depth={depth + 1} selectedBlockId={selectedBlockId} actions={actions} />
      ))}
    </section>
  );
}

type DropData = { kind: "block" | "section"; sectionId: string };

type DragHandle = {
  setActivatorNodeRef: (el: HTMLElement | null) => void;
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
};

/** Drop target for a section, so blocks can be dragged into a section that has none yet. */
function SectionDropZone({ sectionId, empty, children }: { sectionId: string; empty: boolean; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `drop-${sectionId}`, data: { kind: "section", sectionId } satisfies DropData });
  return (
    <div ref={setNodeRef} className={`${empty ? "min-h-6" : ""} rounded-md ${isOver ? "bg-accent/5 outline outline-1 outline-dashed outline-accent" : ""}`}>
      {children}
    </div>
  );
}

function SortableBlock({ block, sectionId, lockedToSection, children }: {
  block: BlockRow;
  sectionId: string;
  lockedToSection: boolean;
  children: (drag: DragHandle) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
    data: { kind: "block", sectionId, lockedToSection } as DropData & { lockedToSection: boolean },
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={isDragging ? "relative z-20 opacity-70" : undefined}
    >
      {children({ setActivatorNodeRef, attributes, listeners })}
    </div>
  );
}

function BlockFrame({ block, selected, isFirst, isLast, actions, drag, children }: {
  block: BlockRow;
  selected: boolean;
  isFirst: boolean;
  isLast: boolean;
  actions: CanvasActions;
  drag: DragHandle;
  children: ReactNode;
}) {
  const width = block.layout.width === "narrow" ? "max-w-[520px]" : "";
  return (
    <div
      className={`group relative -mx-3 rounded-md px-3 py-2 ${selected ? "outline outline-2 outline-accent" : "hover:outline hover:outline-1 hover:outline-line-strong"}`}
      onFocusCapture={() => actions.selectBlock(block.id)}
      onMouseDown={() => actions.selectBlock(block.id)}
    >
      <div
        role="toolbar"
        aria-label="Block actions"
        className={`absolute -top-4 right-2 z-10 flex items-center gap-0.5 rounded-md border border-line bg-surface p-0.5 text-xs shadow-sm ${selected ? "flex" : "hidden group-hover:flex"}`}
      >
        <button
          type="button"
          ref={drag.setActivatorNodeRef}
          {...drag.attributes}
          {...drag.listeners}
          aria-label="Drag to move block"
          title="Drag to move block (or press Space, then arrow keys)"
          onMouseDown={(e) => e.stopPropagation()}
          className="cursor-grab touch-none rounded px-1.5 py-1 hover:bg-paper active:cursor-grabbing"
        >
          <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden="true">
            <circle cx="3" cy="3" r="1.2" /><circle cx="7" cy="3" r="1.2" /><circle cx="3" cy="7" r="1.2" />
            <circle cx="7" cy="7" r="1.2" /><circle cx="3" cy="11" r="1.2" /><circle cx="7" cy="11" r="1.2" />
          </svg>
        </button>
        <ToolButton label="Move block up" disabled={isFirst} onClick={() => actions.moveBlock(block.id, -1)}>↑</ToolButton>
        <ToolButton label="Move block down" disabled={isLast} onClick={() => actions.moveBlock(block.id, 1)}>↓</ToolButton>
        <ToolButton label="Duplicate block" onClick={() => actions.duplicateBlock(block.id)}>Duplicate</ToolButton>
        <ToolButton label="Delete block" onClick={() => actions.removeBlock(block.id)} danger>Delete</ToolButton>
      </div>
      <div className={width}>{children}</div>
    </div>
  );
}

function ToolButton({ label, onClick, disabled, danger, children }: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={onClick}
      className={`rounded px-2 py-1 hover:bg-paper disabled:opacity-30 ${danger ? "text-danger" : ""}`}
    >
      {children}
    </button>
  );
}

function BlockView({ draft, block, actions }: { draft: Draft; block: BlockRow; actions: CanvasActions }) {
  switch (block.type) {
    case "text":
      return (
        <AutoTextarea
          ariaLabel="Text"
          placeholder="Write something…"
          value={docToText(block.props.doc)}
          onChange={(v) => actions.setBlockProps(block.id, { ...block.props, doc: textToDoc(v) })}
          className="text-[17px] leading-relaxed"
        />
      );
    case "heading": {
      const level = (block.props.level as number) ?? 2;
      return (
        <input
          aria-label="Heading"
          value={String(block.props.text ?? "")}
          maxLength={200}
          placeholder="Heading"
          onChange={(e) => actions.setBlockProps(block.id, { ...block.props, text: e.target.value })}
          className={`w-full bg-transparent font-[family-name:var(--font-display)] outline-none placeholder:text-subtle ${level === 1 ? "text-4xl" : level === 2 ? "text-[28px]" : "text-xl"}`}
        />
      );
    }
    case "strategy_field": {
      const key = block.props.fieldKey as StrategyFieldKey;
      const display = block.props.display as string;
      return (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs uppercase tracking-[0.1em] text-subtle">
            {STRATEGY_LABELS[key]} <span className="normal-case tracking-normal">· shared brand strategy</span>
          </span>
          <AutoTextarea
            ariaLabel={STRATEGY_LABELS[key]}
            placeholder={display === "list" ? "One item per line" : `Write the ${STRATEGY_LABELS[key].toLowerCase()}…`}
            value={strategyText(draft.strategy[key])}
            onChange={(v) => actions.setStrategy(key, v)}
            className={display === "statement" ? "font-[family-name:var(--font-display)] text-[28px] leading-snug" : "text-[17px] leading-relaxed"}
          />
        </div>
      );
    }
    case "divider":
      return <hr className="my-3 border-line-strong" />;
    case "palette":
      return <PaletteView draft={draft} block={block} />;
    case "color_combinations":
      return <CombinationsView draft={draft} block={block} />;
    case "type_specimen":
      return <SpecimenView draft={draft} block={block} />;
    case "type_family":
      return <FamilyView draft={draft} block={block} />;
    case "image":
      return <ImageView draft={draft} block={block} />;
    case "video":
      return <VideoView draft={draft} block={block} />;
    case "gallery":
      return <GalleryView draft={draft} block={block} />;
    case "file_download":
      return <DownloadView draft={draft} block={block} />;
    case "dos_donts":
      return <DosDontsView draft={draft} block={block} />;
    default:
      return (
        <div className="rounded-md border border-dashed border-line-strong bg-paper px-4 py-5 text-sm text-muted">
          <strong className="text-ink">{LATER_STAGE[block.type] ?? block.type}</strong> · editing for this block arrives in the next
          editor stage. It is saved and will keep its place.
        </div>
      );
  }
}

/** A textarea that grows with its content and keeps the cursor stable while saving. */
function AutoTextarea({ value, onChange, placeholder, className, ariaLabel }: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [local, setLocal] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setLocal(value);
  }, [value]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [local]);
  return (
    <textarea
      ref={ref}
      aria-label={ariaLabel}
      rows={1}
      value={local}
      placeholder={placeholder}
      onFocus={() => (focused.current = true)}
      onBlur={() => (focused.current = false)}
      onChange={(e) => {
        setLocal(e.target.value);
        onChange(e.target.value);
      }}
      className={`block w-full resize-none overflow-hidden bg-transparent outline-none placeholder:text-subtle ${className ?? ""}`}
    />
  );
}

function AddBlockMenu({ sectionId, afterId, actions, compact }: {
  sectionId: string;
  afterId: string | null;
  actions: CanvasActions;
  compact: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [askStrategy, setAskStrategy] = useState(false);
  const add = (type: BlockType, props?: Record<string, unknown>) => {
    actions.addBlock(sectionId, type, afterId, props);
    setOpen(false);
    setAskStrategy(false);
  };
  return (
    <div className={`relative flex items-center justify-center ${compact ? "h-6 opacity-0 hover:opacity-100 focus-within:opacity-100" : "my-2"} ${open ? "opacity-100" : ""}`}>
      <span className="h-px flex-1 bg-line" />
      <button
        type="button"
        aria-expanded={open}
        aria-label="Add a block here"
        onClick={() => setOpen((o) => !o)}
        className="mx-2 flex h-6 items-center gap-1 rounded-full border border-line-strong bg-surface px-2 text-xs text-muted hover:border-ink hover:text-ink"
      >
        <PlusIcon /> Add block
      </button>
      <span className="h-px flex-1 bg-line" />
      {open ? (
        <div className="absolute top-7 z-20 flex w-64 flex-col rounded-[var(--radius-card)] border border-line bg-surface p-1 text-sm shadow-lg">
          {askStrategy ? (
            <>
              <span className="px-2.5 py-1.5 text-xs text-muted">Which strategy field?</span>
              <div className="max-h-64 overflow-auto">
                {STRATEGY_FIELD_KEYS.map((k) => (
                  <button key={k} type="button" onClick={() => add("strategy_field", { fieldKey: k })} className="w-full rounded-md px-2.5 py-2 text-left hover:bg-paper">
                    {STRATEGY_LABELS[k]}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <MenuChoice title="Text" hint="Paragraphs of copy" onClick={() => add("text")} />
              <MenuChoice title="Heading" hint="A title inside the section" onClick={() => add("heading")} />
              <MenuChoice title="Strategy field" hint="Mission, values, tone… shared across the guide" onClick={() => setAskStrategy(true)} />
              <MenuChoice title="Divider" hint="A horizontal rule" onClick={() => add("divider")} />
              <MenuChoice title="Colour palette" hint="Swatches with HEX, RGB and CMYK" onClick={() => add("palette")} />
              <MenuChoice title="Colour combinations" hint="Approved pairings with contrast checks" onClick={() => add("color_combinations")} />
              <MenuChoice title="Type specimen" hint="Your type hierarchy, rendered" onClick={() => add("type_specimen")} />
              <MenuChoice title="Typeface" hint="One typeface with its weights and characters" onClick={() => add("type_family")} />
              <MenuChoice title="Image" hint="A logo, illustration or photo" onClick={() => add("image")} />
              <MenuChoice title="Gallery" hint="Several images in a grid" onClick={() => add("gallery")} />
              <MenuChoice title="Video" hint="Logo animation, motion examples" onClick={() => add("video")} />
              <MenuChoice title="Do's and don'ts" hint="Correct and incorrect usage, side by side" onClick={() => add("dos_donts")} />
              <MenuChoice title="File download" hint="Files clients can download" onClick={() => add("file_download")} />
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function MenuChoice({ title, hint, onClick }: { title: string; hint: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex flex-col rounded-md px-2.5 py-2 text-left hover:bg-paper">
      <span>{title}</span>
      <span className="text-xs text-muted">{hint}</span>
    </button>
  );
}

function HiddenNote() {
  return (
    <p className="mb-4 rounded-md bg-paper px-3 py-2 text-sm text-muted">
      This section is hidden. It stays in your draft but won't appear in the published guide.
    </p>
  );
}

// ---------------------------------------------------------------------------
// Brand system blocks
// ---------------------------------------------------------------------------

function EmptyBlockHint({ children }: { children: ReactNode }) {
  return <div className="rounded-md border border-dashed border-line-strong px-4 py-5 text-sm text-muted">{children}</div>;
}

function CopyValue({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          // Clipboard blocked by the browser; the value stays visible to copy by hand.
        }
      }}
      className="flex w-full justify-between gap-2 rounded px-0.5 text-left hover:bg-paper"
      title={`Copy ${label}`}
    >
      <span>{value}</span>
      <span className="text-subtle">{copied ? "Copied" : ""}</span>
    </button>
  );
}

function PaletteView({ draft, block }: { draft: Draft; block: BlockRow }) {
  const ids = (block.props.tokenIds as string[] | undefined) ?? [];
  const show = (block.props.show as { hex: boolean; rgb: boolean; cmyk: boolean; pantone: boolean }) ?? { hex: true, rgb: true, cmyk: true, pantone: false };
  const layout = (block.props.layout as string) ?? "columns";
  const colors = ids.map((id) => draft.colors[id]).filter((c): c is NonNullable<typeof c> => Boolean(c));
  if (!colors.length) {
    return (
      <EmptyBlockHint>
        <strong className="text-ink">Colour palette.</strong>{" "}
        {Object.keys(draft.colors).length ? "Choose which colours to show in the settings panel." : "Add colours in Brand system first, then choose them here."}
      </EmptyBlockHint>
    );
  }
  const columns = layout === "stacked" ? 1 : layout === "grid" ? 3 : Math.min(colors.length, 5);
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {colors.map((c) => {
        const v = colorValues(c.hex, c.cmyk_override);
        return (
          <div key={c.id} className={layout === "stacked" ? "flex items-center gap-4" : "flex flex-col gap-2"}>
            <div
              className={`${layout === "stacked" ? "h-16 w-24 shrink-0" : "aspect-[3/4] w-full"} rounded border border-black/5`}
              style={{ background: c.hex }}
            />
            <div className="flex flex-col gap-0.5 text-xs leading-relaxed text-muted">
              <strong className="text-sm text-ink">{c.name}</strong>
              {show.hex ? <CopyValue label="HEX" value={v.hex} /> : null}
              {show.rgb ? <CopyValue label="RGB" value={`RGB ${v.rgb.r} ${v.rgb.g} ${v.rgb.b}`} /> : null}
              {show.cmyk ? <CopyValue label="CMYK" value={`CMYK ${v.cmyk.c} ${v.cmyk.m} ${v.cmyk.y} ${v.cmyk.k}`} /> : null}
              {show.pantone && c.pantone ? <CopyValue label="Pantone" value={`PMS ${c.pantone}`} /> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function contrastGrade(ratio: number): { label: string; good: boolean } {
  if (ratio >= 7) return { label: "AAA", good: true };
  if (ratio >= 4.5) return { label: "AA", good: true };
  if (ratio >= 3) return { label: "AA large text only", good: true };
  return { label: "Fails contrast", good: false };
}

function CombinationsView({ draft, block }: { draft: Draft; block: BlockRow }) {
  const pairs = ((block.props.pairs as Array<{ foregroundId: string; backgroundId: string }>) ?? [])
    .map((p) => ({ fg: draft.colors[p.foregroundId], bg: draft.colors[p.backgroundId] }))
    .filter((p): p is { fg: NonNullable<typeof p.fg>; bg: NonNullable<typeof p.bg> } => Boolean(p.fg && p.bg));
  if (!pairs.length) {
    return (
      <EmptyBlockHint>
        <strong className="text-ink">Colour combinations.</strong> Add pairings in the settings panel; each one shows its contrast rating.
      </EmptyBlockHint>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {pairs.map(({ fg, bg }) => {
        const ratio = contrastRatio(fg.hex, bg.hex);
        const grade = contrastGrade(ratio);
        return (
          <div key={`${fg.id}-${bg.id}`} className="flex flex-col gap-6 rounded border border-black/5 p-5" style={{ background: bg.hex, color: fg.hex }}>
            <span className="font-[family-name:var(--font-display)] text-3xl">Aa</span>
            <span className="text-xs">
              {fg.name} on {bg.name}
              <br />
              {ratio.toFixed(1)}:1 · {grade.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SpecimenView({ draft, block }: { draft: Draft; block: BlockRow }) {
  const ids = (block.props.styleIds as string[] | undefined) ?? [];
  const sample = String(block.props.sampleText ?? "");
  const showDetails = block.props.showDetails !== false;
  const styles = ids.map((id) => draft.styles[id]).filter((s): s is NonNullable<typeof s> => Boolean(s));
  if (!styles.length) {
    return (
      <EmptyBlockHint>
        <strong className="text-ink">Type specimen.</strong>{" "}
        {Object.keys(draft.styles).length ? "Choose which type styles to show in the settings panel." : "Create type styles in Brand system first."}
      </EmptyBlockHint>
    );
  }
  return (
    <div className="flex flex-col divide-y divide-line">
      {styles.map((s) => {
        const family = draft.families[s.family_id];
        return (
          <div key={s.id} className="flex flex-col gap-2 py-4 first:pt-0">
            {showDetails ? (
              <span className="text-xs text-muted">
                {s.name} · {family?.name} {s.weight} · {s.size}px / {s.line_height}
                {s.tracking ? ` · ${s.tracking}em` : ""}
              </span>
            ) : null}
            <span
              className="break-words"
              style={{
                fontFamily: familyCss(family),
                fontWeight: s.weight,
                fontSize: `min(${s.size}px, 12vw)`,
                lineHeight: s.line_height,
                letterSpacing: `${s.tracking}em`,
                textTransform: s.text_transform,
              }}
            >
              {sample || s.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function FamilyView({ draft, block }: { draft: Draft; block: BlockRow }) {
  const family = block.props.familyId ? draft.families[block.props.familyId as string] : undefined;
  if (!family) {
    return (
      <EmptyBlockHint>
        <strong className="text-ink">Typeface.</strong>{" "}
        {Object.keys(draft.families).length ? "Choose a typeface in the settings panel." : "Add a typeface in Brand system first."}
      </EmptyBlockHint>
    );
  }
  const weights = weightsByFamily(draft).get(family.id) ?? [400];
  const css = familyCss(family);
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-[auto_1fr]">
      <span className="text-[120px] leading-none" style={{ fontFamily: css }}>
        Aa
      </span>
      <div className="flex flex-col gap-3">
        <span className="text-2xl" style={{ fontFamily: css }}>
          {family.name}
        </span>
        <span className="text-xs uppercase tracking-[0.1em] text-muted">
          {family.role === "primary" ? "Primary typeface" : family.role === "secondary" ? "Secondary typeface" : "Typeface"}
        </span>
        {block.props.showWeights !== false ? (
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {weights.map((w) => (
              <span key={w} style={{ fontFamily: css, fontWeight: w }}>
                {w}
              </span>
            ))}
          </div>
        ) : null}
        {block.props.showCharacters !== false ? (
          <p className="break-all text-lg leading-relaxed" style={{ fontFamily: css }}>
            ABCDEFGHIJKLMNOPQRSTUVWXYZ
            <br />
            abcdefghijklmnopqrstuvwxyz
            <br />
            0123456789 &amp;?!@₦$%
          </p>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Asset blocks
// ---------------------------------------------------------------------------

function MissingFile() {
  return <span className="flex h-full min-h-24 items-center justify-center rounded bg-paper text-xs text-muted">File unavailable</span>;
}

function ImageView({ draft, block }: { draft: Draft; block: BlockRow }) {
  const urls = useContext(AssetUrls);
  const asset = block.props.assetId ? draft.assets[block.props.assetId as string] : undefined;
  const bg = block.props.background ? draft.colors[block.props.background as string]?.hex : undefined;
  const caption = block.props.caption as string | null;
  if (!asset) {
    return (
      <EmptyBlockHint>
        <strong className="text-ink">Image.</strong> Choose an image in the settings panel.
      </EmptyBlockHint>
    );
  }
  const url = urls[asset.id];
  return (
    <figure className="flex flex-col gap-2">
      <div className="flex items-center justify-center overflow-hidden rounded border border-black/5 p-0" style={{ background: bg ?? "#F6F4EF" }}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={String(block.props.alt ?? "")}
            className={`max-h-[520px] w-full ${block.props.fit === "cover" ? "object-cover" : "object-contain p-8"}`}
          />
        ) : (
          <MissingFile />
        )}
      </div>
      {caption ? <figcaption className="text-sm text-muted">{caption}</figcaption> : null}
    </figure>
  );
}

function VideoView({ draft, block }: { draft: Draft; block: BlockRow }) {
  const urls = useContext(AssetUrls);
  const asset = block.props.assetId ? draft.assets[block.props.assetId as string] : undefined;
  if (!asset) {
    return (
      <EmptyBlockHint>
        <strong className="text-ink">Video.</strong> Choose a video in the settings panel.
      </EmptyBlockHint>
    );
  }
  const url = urls[asset.id];
  return (
    <figure className="flex flex-col gap-2">
      {url ? (
        <video
          src={url}
          controls
          muted={Boolean(block.props.autoplay)}
          autoPlay={Boolean(block.props.autoplay)}
          loop={Boolean(block.props.loop)}
          playsInline
          className="w-full rounded bg-black"
        />
      ) : (
        <MissingFile />
      )}
      {block.props.caption ? <figcaption className="text-sm text-muted">{String(block.props.caption)}</figcaption> : null}
    </figure>
  );
}

function GalleryView({ draft, block }: { draft: Draft; block: BlockRow }) {
  const urls = useContext(AssetUrls);
  const assets = ((block.props.assetIds as string[]) ?? []).map((id) => draft.assets[id]).filter((a): a is NonNullable<typeof a> => Boolean(a));
  if (!assets.length) {
    return (
      <EmptyBlockHint>
        <strong className="text-ink">Gallery.</strong> Choose images in the settings panel.
      </EmptyBlockHint>
    );
  }
  const columns = Math.max(1, Math.min(6, Number(block.props.columns ?? 3)));
  return (
    <figure className="flex flex-col gap-2">
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {assets.map((a) =>
          urls[a.id] && a.mime.startsWith("image/") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={a.id} src={urls[a.id]} alt={a.name} className="aspect-square w-full rounded border border-black/5 bg-[#F6F4EF] object-contain p-3" />
          ) : (
            <MissingFile key={a.id} />
          ),
        )}
      </div>
      {block.props.caption ? <figcaption className="text-sm text-muted">{String(block.props.caption)}</figcaption> : null}
    </figure>
  );
}

function DownloadView({ draft, block }: { draft: Draft; block: BlockRow }) {
  const assets = ((block.props.assetIds as string[]) ?? []).map((id) => draft.assets[id]).filter((a): a is NonNullable<typeof a> => Boolean(a));
  if (!assets.length) {
    return (
      <EmptyBlockHint>
        <strong className="text-ink">File download.</strong> Choose files in the settings panel.
      </EmptyBlockHint>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">{String(block.props.label ?? "Download")}</span>
      {assets.map((a) => (
        <div key={a.id} className="flex items-center gap-3 rounded border border-line p-3 text-sm">
          <span className="min-w-0 flex-1 truncate">{a.name}</span>
          <span className="text-xs text-muted">{formatBytes(a.size)}</span>
          {!a.client_visible ? <span className="text-xs text-[#8a5a00]">Not downloadable: tick it in Assets</span> : null}
        </div>
      ))}
    </div>
  );
}

type DosItem = { assetId: string | null; kind: "do" | "dont"; note: string };

function DosDontsView({ draft, block }: { draft: Draft; block: BlockRow }) {
  const urls = useContext(AssetUrls);
  const items = (block.props.items as DosItem[]) ?? [];
  if (!items.length) {
    return (
      <EmptyBlockHint>
        <strong className="text-ink">Do&apos;s and don&apos;ts.</strong> Add examples in the settings panel.
      </EmptyBlockHint>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {items.map((item, i) => {
        const asset = item.assetId ? draft.assets[item.assetId] : undefined;
        const url = asset ? urls[asset.id] : undefined;
        return (
          <figure key={i} className="flex flex-col gap-2">
            <div className={`relative overflow-hidden rounded border-2 bg-[#F6F4EF] ${item.kind === "do" ? "border-[#2F7A4F]" : "border-[#A3361F]"}`}>
              {url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt="" className="aspect-[4/3] w-full object-contain p-6" />
              ) : (
                <span className="flex aspect-[4/3] items-center justify-center text-xs text-muted">No image</span>
              )}
            </div>
            <figcaption className="flex gap-2 text-sm">
              <strong className={item.kind === "do" ? "text-[#2F7A4F]" : "text-[#A3361F]"}>{item.kind === "do" ? "Do" : "Don't"}</strong>
              <span>{item.note}</span>
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}
