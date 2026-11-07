"use client";

import { useId, useState, type ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { childSections, type Draft, type SectionRow } from "./model";

export type TreeActions = {
  select: (id: string) => void;
  rename: (id: string, title: string) => void;
  toggleHidden: (id: string) => void;
  addChild: (parentId: string) => void;
  duplicate: (id: string) => void;
  remove: (id: string) => void;
  move: (id: string, index: number) => void;
  addTop: () => void;
};

const MAX_DEPTH = 4;

export function SectionTree({ draft, selectedId, actions }: { draft: Draft; selectedId: string | null; actions: TreeActions }) {
  // A stable id keeps dnd-kit's accessibility ids the same on server and client (no hydration mismatch).
  const dndId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const moving = draft.sections[String(active.id)];
    const target = draft.sections[String(over.id)];
    // Reorder within the same parent only; moving between levels is a later feature.
    if (!moving || !target || moving.parent_id !== target.parent_id) return;
    const siblings = childSections(draft, moving.parent_id);
    actions.move(moving.id, siblings.findIndex((s) => s.id === target.id));
  };

  return (
    <nav aria-label="Guide sections" className="flex flex-col gap-1">
      <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <Level draft={draft} parentId={null} depth={0} selectedId={selectedId} actions={actions} />
      </DndContext>
      <button
        type="button"
        onClick={actions.addTop}
        className="mt-3 flex items-center justify-center gap-1.5 rounded-[var(--radius-control)] border border-dashed border-line-strong px-3 py-2.5 text-sm hover:border-ink"
      >
        <PlusIcon /> Add section
      </button>
    </nav>
  );
}

function Level({ draft, parentId, depth, selectedId, actions }: {
  draft: Draft;
  parentId: string | null;
  depth: number;
  selectedId: string | null;
  actions: TreeActions;
}) {
  const sections = childSections(draft, parentId);
  if (!sections.length) return null;
  return (
    <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
      <ul className={`flex list-none flex-col gap-0.5 p-0 ${depth ? "ml-5 border-l border-line pl-1.5" : ""}`}>
        {sections.map((s, i) => (
          <SortableItem key={s.id} section={s} index={i} depth={depth} selected={s.id === selectedId} actions={actions}>
            <Level draft={draft} parentId={s.id} depth={depth + 1} selectedId={selectedId} actions={actions} />
          </SortableItem>
        ))}
      </ul>
    </SortableContext>
  );
}

function SortableItem({ section, index, depth, selected, actions, children }: {
  section: SectionRow;
  index: number;
  depth: number;
  selected: boolean;
  actions: TreeActions;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: section.id });
  const [editing, setEditing] = useState(false);

  return (
    <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={isDragging ? "z-10 opacity-80" : ""}>
      <div
        className={`group flex items-center gap-1 rounded-md pr-1 ${selected ? "bg-accent-soft" : "hover:bg-paper"} ${section.hidden ? "opacity-60" : ""}`}
      >
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${section.title}`}
          className="flex h-8 w-6 shrink-0 cursor-grab items-center justify-center text-subtle opacity-0 group-hover:opacity-100 focus:opacity-100 active:cursor-grabbing"
        >
          <GripIcon />
        </button>
        {editing ? (
          <input
            autoFocus
            defaultValue={section.title}
            aria-label="Section name"
            maxLength={120}
            className="h-8 min-w-0 flex-1 rounded border border-accent bg-surface px-1.5 text-sm outline-none"
            onBlur={(e) => {
              actions.rename(section.id, e.currentTarget.value);
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setEditing(false);
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => actions.select(section.id)}
            onDoubleClick={() => setEditing(true)}
            aria-current={selected ? "true" : undefined}
            className={`flex h-8 min-w-0 flex-1 items-center gap-2 text-left text-sm ${selected ? "font-semibold" : ""}`}
          >
            {depth === 0 ? <span className="w-5 shrink-0 text-xs text-subtle">{String(index + 1).padStart(2, "0")}</span> : null}
            <span className="truncate">{section.title}</span>
            {section.hidden ? <span className="ml-auto shrink-0 text-xs text-subtle">Hidden</span> : null}
          </button>
        )}
        <details className="relative shrink-0">
          <summary
            aria-label={`More actions for ${section.title}`}
            className="flex h-7 w-7 cursor-pointer list-none items-center justify-center rounded text-subtle opacity-0 hover:bg-surface group-hover:opacity-100 focus:opacity-100 [[open]>&]:opacity-100"
          >
            <DotsIcon />
          </summary>
          <div
            className="absolute right-0 z-20 mt-1 flex w-48 flex-col rounded-[var(--radius-card)] border border-line bg-surface p-1 text-sm shadow-lg"
            onClick={(e) => (e.currentTarget.parentElement as HTMLDetailsElement).removeAttribute("open")}
          >
            <MenuItem onClick={() => setEditing(true)}>Rename</MenuItem>
            {depth < MAX_DEPTH - 1 ? <MenuItem onClick={() => actions.addChild(section.id)}>Add subsection</MenuItem> : null}
            <MenuItem onClick={() => actions.toggleHidden(section.id)}>{section.hidden ? "Show in guide" : "Hide from guide"}</MenuItem>
            <MenuItem onClick={() => actions.duplicate(section.id)}>Duplicate</MenuItem>
            <MenuItem danger onClick={() => actions.remove(section.id)}>Delete</MenuItem>
          </div>
        </details>
      </div>
      {children}
    </li>
  );
}

function MenuItem({ children, onClick, danger }: { children: ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-md px-2.5 py-2 text-left hover:bg-paper ${danger ? "text-danger" : ""}`}>
      {children}
    </button>
  );
}

export function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function GripIcon() {
  return (
    <svg width="12" height="14" viewBox="0 0 12 16" fill="currentColor" aria-hidden="true">
      <circle cx="3" cy="3" r="1.4" />
      <circle cx="9" cy="3" r="1.4" />
      <circle cx="3" cy="8" r="1.4" />
      <circle cx="9" cy="8" r="1.4" />
      <circle cx="3" cy="13" r="1.4" />
      <circle cx="9" cy="13" r="1.4" />
    </svg>
  );
}

function DotsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}
