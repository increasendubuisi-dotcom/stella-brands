"use client";

import { useRef, useState, type ReactNode } from "react";
import { colorValues, isValidHex, normalizeHex } from "@stella/brand-schema";
import { COLOR_GROUPS, colorsInGroup, familyCss, orderedStyles } from "./brand-system";
import { familyFontFiles } from "./assets";
import { extractFromFile, type ExtractedColor } from "./extract-colors";
import type { ColorRow, Draft, FamilyRow, StyleRow } from "./model";
import { PlusIcon } from "./section-tree";

export type BrandActions = {
  addColor: (input: { name: string; hex: string; group: ColorRow["color_group"] }) => string | undefined;
  updateColor: (id: string, patch: Partial<Pick<ColorRow, "name" | "hex" | "pantone" | "cmyk_override" | "color_group">>) => string | undefined;
  moveColor: (id: string, dir: -1 | 1) => void;
  deleteColor: (id: string) => void;
  addFamily: (input: { name: string; source: FamilyRow["source"] }) => string | undefined;
  updateFamily: (id: string, patch: Partial<Pick<FamilyRow, "role" | "fallback">>) => void;
  deleteFamily: (id: string) => void;
  addStyle: () => void;
  updateStyle: (id: string, patch: Partial<Omit<StyleRow, "id" | "position">>) => void;
  deleteStyle: (id: string) => void;
  addStandardScale: () => void;
  uploadFontFiles: (familyId: string, files: File[]) => Promise<void>;
  deleteFontFile: (id: string) => void;
  setFontLicence: (familyId: string, downloadable: boolean, note: string | null) => void;
};

const field =
  "h-9 w-full rounded-[var(--radius-control)] border border-line-strong bg-surface px-2.5 text-sm outline-none focus:border-accent";

export function BrandPanel({ draft, actions }: { draft: Draft; actions: BrandActions; urls?: Record<string, string> }) {
  return (
    <div className="flex flex-col gap-7 text-sm">
      <ColourSection draft={draft} actions={actions} />
      <TypeSection draft={draft} actions={actions} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------

function ColourSection({ draft, actions }: { draft: Draft; actions: BrandActions }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [suggestions, setSuggestions] = useState<Array<ExtractedColor & { keep: boolean }> | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const total = Object.keys(draft.colors).length;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setExtractError(null);
    try {
      const found = await extractFromFile(file);
      if (!found.length) setExtractError("No solid colours found in that image.");
      setSuggestions(found.map((c) => ({ ...c, keep: true })));
    } catch {
      setExtractError("Couldn't read that image. Try a PNG, JPG or SVG.");
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const addSuggestions = () => {
    if (!suggestions) return;
    let n = total;
    for (const s of suggestions.filter((x) => x.keep)) {
      n++;
      actions.addColor({ name: `Colour ${n}`, hex: s.hex, group: "primary" });
    }
    setSuggestions(null);
  };

  return (
    <section aria-labelledby="colours-h" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 id="colours-h" className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">
          Colours
        </h2>
        <span className="flex-1" />
        <button type="button" onClick={() => fileRef.current?.click()} className="text-[13px] text-accent hover:underline">
          Extract from image
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="sr-only" aria-label="Choose an image to extract colours from" onChange={(e) => onFile(e.target.files?.[0])} />
      </div>
      <p className="text-xs leading-relaxed text-muted">
        Colours are brand tokens. Change one here and every palette and combination using it updates.
      </p>

      {extractError ? <p className="text-xs text-danger">{extractError}</p> : null}
      {suggestions?.length ? (
        <div className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-accent/40 bg-accent-soft p-3">
          <span className="text-[13px] font-medium">Found in your image</span>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s, i) => (
              <label key={s.hex} className="flex cursor-pointer flex-col items-center gap-1 text-[11px]">
                <span
                  className={`h-10 w-10 rounded-md border ${s.keep ? "border-ink ring-2 ring-accent" : "border-line opacity-50"}`}
                  style={{ background: s.hex }}
                />
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={s.keep}
                  onChange={() => setSuggestions(suggestions.map((x, j) => (j === i ? { ...x, keep: !x.keep } : x)))}
                />
                {s.hex}
              </label>
            ))}
          </div>
          <span className="text-xs text-muted">Tap a swatch to leave it out. You can rename colours after adding.</span>
          <div className="flex gap-2">
            <button type="button" onClick={addSuggestions} className="rounded-md bg-ink px-3 py-1.5 text-[13px] text-white">
              Add {suggestions.filter((s) => s.keep).length} colours
            </button>
            <button type="button" onClick={() => setSuggestions(null)} className="rounded-md px-3 py-1.5 text-[13px] hover:bg-surface">
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {COLOR_GROUPS.map((g) => {
        const colors = colorsInGroup(draft, g.key);
        if (!colors.length) return null;
        return (
          <div key={g.key} className="flex flex-col gap-1">
            <span className="text-xs text-subtle">{g.label}</span>
            {colors.map((c, i) => (
              <ColourRow
                key={c.id}
                color={c}
                open={openId === c.id}
                onToggle={() => setOpenId(openId === c.id ? null : c.id)}
                isFirst={i === 0}
                isLast={i === colors.length - 1}
                actions={actions}
              />
            ))}
          </div>
        );
      })}

      {adding ? (
        <AddColourForm
          onAdd={(input) => {
            const err = actions.addColor(input);
            if (!err) setAdding(false);
            return err;
          }}
          onCancel={() => setAdding(false)}
          suggestedName={`Colour ${total + 1}`}
        />
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="flex items-center justify-center gap-1.5 rounded-[var(--radius-control)] border border-dashed border-line-strong px-3 py-2 hover:border-ink">
          <PlusIcon /> Add colour
        </button>
      )}
    </section>
  );
}

function ColourRow({ color, open, onToggle, isFirst, isLast, actions }: {
  color: ColorRow;
  open: boolean;
  onToggle: () => void;
  isFirst: boolean;
  isLast: boolean;
  actions: BrandActions;
}) {
  const values = colorValues(color.hex, color.cmyk_override);
  const [error, setError] = useState<string | undefined>();
  return (
    <div className={`rounded-[var(--radius-control)] border ${open ? "border-line-strong bg-paper" : "border-transparent"}`}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-2.5 rounded-[var(--radius-control)] px-1.5 py-1.5 text-left hover:bg-paper">
        <span className="h-7 w-7 shrink-0 rounded-md border border-black/10" style={{ background: color.hex }} />
        <span className="min-w-0 flex-1 truncate">{color.name}</span>
        <span className="font-mono text-xs text-muted">{color.hex}</span>
      </button>
      {open ? (
        <div className="flex flex-col gap-2.5 px-2 pb-3 pt-1">
          <label className="flex flex-col gap-1 text-xs font-medium">
            Name
            <CommitInput value={color.name} maxLength={60} onCommit={(v) => actions.updateColor(color.id, { name: v })} className={field} />
          </label>
          <div className="flex items-end gap-2">
            <label className="flex flex-1 flex-col gap-1 text-xs font-medium">
              HEX
              <CommitInput
                value={color.hex}
                onCommit={(v) => setError(actions.updateColor(color.id, { hex: v }))}
                className={`${field} font-mono`}
              />
            </label>
            <input
              type="color"
              aria-label={`Pick ${color.name}`}
              value={color.hex.toLowerCase()}
              onChange={(e) => setError(actions.updateColor(color.id, { hex: e.target.value }))}
              className="h-9 w-11 cursor-pointer rounded border border-line-strong bg-surface p-0.5"
            />
          </div>
          {error ? <p className="text-xs text-danger">{error}</p> : null}
          <p className="text-xs text-muted">
            RGB {values.rgb.r} {values.rgb.g} {values.rgb.b}
          </p>
          <CmykEditor color={color} derived={colorValues(color.hex).cmyk} actions={actions} />
          <label className="flex flex-col gap-1 text-xs font-medium">
            Pantone <span className="font-normal text-muted">Optional, enter your matched reference</span>
            <CommitInput value={color.pantone ?? ""} maxLength={40} placeholder="e.g. 7621 C" onCommit={(v) => actions.updateColor(color.id, { pantone: v })} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium">
            Group
            <select value={color.color_group} onChange={(e) => actions.updateColor(color.id, { color_group: e.target.value as ColorRow["color_group"] })} className={field}>
              {COLOR_GROUPS.map((g) => (
                <option key={g.key} value={g.key}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-1 pt-1">
            <SmallButton disabled={isFirst} onClick={() => actions.moveColor(color.id, -1)}>Move up</SmallButton>
            <SmallButton disabled={isLast} onClick={() => actions.moveColor(color.id, 1)}>Move down</SmallButton>
            <span className="flex-1" />
            <SmallButton danger onClick={() => actions.deleteColor(color.id)}>Delete</SmallButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CmykEditor({ color, derived, actions }: { color: ColorRow; derived: { c: number; m: number; y: number; k: number }; actions: BrandActions }) {
  const override = color.cmyk_override;
  const shown = override ?? derived;
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1 text-xs font-medium">
        CMYK{" "}
        <span className="font-normal text-muted">{override ? "set by you" : "calculated, check against your print proof"}</span>
      </legend>
      <div className="grid grid-cols-4 gap-1.5">
        {(["c", "m", "y", "k"] as const).map((k) => (
          <label key={k} className="flex flex-col gap-0.5 text-[11px] uppercase text-muted">
            {k}
            <CommitInput
              value={String(shown[k])}
              inputMode="numeric"
              onCommit={(v) => actions.updateColor(color.id, { cmyk_override: { ...shown, [k]: Number(v) } })}
              className="h-8 w-full rounded border border-line-strong bg-surface px-1.5 text-sm text-ink outline-none focus:border-accent"
            />
          </label>
        ))}
      </div>
      {override ? (
        <button type="button" onClick={() => actions.updateColor(color.id, { cmyk_override: null })} className="self-start text-xs text-accent hover:underline">
          Use calculated values
        </button>
      ) : null}
    </fieldset>
  );
}

function AddColourForm({ onAdd, onCancel, suggestedName }: {
  onAdd: (input: { name: string; hex: string; group: ColorRow["color_group"] }) => string | undefined;
  onCancel: () => void;
  suggestedName: string;
}) {
  const [name, setName] = useState(suggestedName);
  const [hex, setHex] = useState("#3A3BD0");
  const [group, setGroup] = useState<ColorRow["color_group"]>("primary");
  const [error, setError] = useState<string | undefined>();
  return (
    <form
      className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-line-strong p-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(onAdd({ name, hex, group }));
      }}
    >
      <label className="flex flex-col gap-1 text-xs font-medium">
        Name
        <input autoFocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} className={field} />
      </label>
      <div className="flex items-end gap-2">
        <label className="flex flex-1 flex-col gap-1 text-xs font-medium">
          HEX
          <input value={hex} onChange={(e) => setHex(e.target.value)} className={`${field} font-mono`} />
        </label>
        <input
          type="color"
          aria-label="Pick colour"
          value={isValidHex(hex) ? normalizeHex(hex).toLowerCase() : "#000000"}
          onChange={(e) => setHex(e.target.value.toUpperCase())}
          className="h-9 w-11 cursor-pointer rounded border border-line-strong bg-surface p-0.5"
        />
      </div>
      <label className="flex flex-col gap-1 text-xs font-medium">
        Group
        <select value={group} onChange={(e) => setGroup(e.target.value as ColorRow["color_group"])} className={field}>
          {COLOR_GROUPS.map((g) => (
            <option key={g.key} value={g.key}>
              {g.label}
            </option>
          ))}
        </select>
      </label>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <div className="flex gap-2">
        <button type="submit" className="rounded-md bg-ink px-3 py-1.5 text-[13px] text-white">Add colour</button>
        <button type="button" onClick={onCancel} className="rounded-md px-3 py-1.5 text-[13px] hover:bg-paper">Cancel</button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------

const WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];

function TypeSection({ draft, actions }: { draft: Draft; actions: BrandActions }) {
  const families = Object.values(draft.families);
  const styles = orderedStyles(draft);
  const [openStyle, setOpenStyle] = useState<string | null>(null);
  const [addingFamily, setAddingFamily] = useState(false);
  return (
    <section aria-labelledby="type-h" className="flex flex-col gap-3">
      <h2 id="type-h" className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">
        Typography
      </h2>

      <span className="text-xs text-subtle">Typefaces</span>
      {families.map((f) => (
        <div key={f.id} className="flex flex-col gap-1.5 rounded-[var(--radius-control)] border border-line p-2.5">
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[17px]" style={{ fontFamily: familyCss(f) }}>
              {f.name}
            </span>
            <SmallButton danger onClick={() => actions.deleteFamily(f.id)}>Remove</SmallButton>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted">
            <select value={f.role} onChange={(e) => actions.updateFamily(f.id, { role: e.target.value as FamilyRow["role"] })} aria-label={`Role of ${f.name}`} className="h-7 rounded border border-line bg-surface px-1.5 text-xs text-ink">
              <option value="primary">Primary</option>
              <option value="secondary">Secondary</option>
              <option value="other">Other</option>
            </select>
            <span>{f.source === "google" ? "Google Fonts" : f.source === "system" ? "System font" : "Uploaded files"}</span>
          </div>
          {f.source === "upload" ? <UploadedFontFiles family={f} draft={draft} actions={actions} /> : null}
        </div>
      ))}
      {addingFamily ? (
        <AddFamilyForm
          onAdd={(input) => {
            const err = actions.addFamily(input);
            if (!err) setAddingFamily(false);
            return err;
          }}
          onCancel={() => setAddingFamily(false)}
        />
      ) : (
        <button type="button" onClick={() => setAddingFamily(true)} className="flex items-center justify-center gap-1.5 rounded-[var(--radius-control)] border border-dashed border-line-strong px-3 py-2 hover:border-ink">
          <PlusIcon /> Add typeface
        </button>
      )}

      <span className="mt-2 text-xs text-subtle">Type styles</span>
      {styles.map((s) => (
        <StyleRowView key={s.id} style={s} draft={draft} open={openStyle === s.id} onToggle={() => setOpenStyle(openStyle === s.id ? null : s.id)} actions={actions} />
      ))}
      {families.length ? (
        <div className="flex flex-col gap-2">
          <button type="button" onClick={actions.addStyle} className="flex items-center justify-center gap-1.5 rounded-[var(--radius-control)] border border-dashed border-line-strong px-3 py-2 hover:border-ink">
            <PlusIcon /> Add type style
          </button>
          {styles.length === 0 ? (
            <button type="button" onClick={actions.addStandardScale} className="rounded-[var(--radius-control)] bg-ink px-3 py-2 text-white">
              Create a standard scale
            </button>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-muted">Add a typeface to start building the type hierarchy.</p>
      )}
    </section>
  );
}

function StyleRowView({ style, draft, open, onToggle, actions }: {
  style: StyleRow;
  draft: Draft;
  open: boolean;
  onToggle: () => void;
  actions: BrandActions;
}) {
  const family = draft.families[style.family_id];
  return (
    <div className={`rounded-[var(--radius-control)] border ${open ? "border-line-strong bg-paper" : "border-line"}`}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full flex-col gap-0.5 px-2.5 py-2 text-left">
        <span
          className="truncate"
          style={{
            fontFamily: familyCss(family),
            fontWeight: style.weight,
            fontSize: Math.min(style.size, 26),
            letterSpacing: `${style.tracking}em`,
            textTransform: style.text_transform,
            lineHeight: 1.2,
          }}
        >
          {style.name}
        </span>
        <span className="text-xs text-muted">
          {family?.name} · {style.weight} · {style.size}px / {style.line_height}
        </span>
      </button>
      {open ? (
        <div className="grid grid-cols-2 gap-2 px-2.5 pb-3">
          <label className="col-span-2 flex flex-col gap-1 text-xs font-medium">
            Name
            <CommitInput value={style.name} maxLength={40} onCommit={(v) => actions.updateStyle(style.id, { name: v })} className={field} />
          </label>
          <label className="col-span-2 flex flex-col gap-1 text-xs font-medium">
            Typeface
            <select value={style.family_id} onChange={(e) => actions.updateStyle(style.id, { family_id: e.target.value })} className={field}>
              {Object.values(draft.families).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium">
            Weight
            <select value={style.weight} onChange={(e) => actions.updateStyle(style.id, { weight: Number(e.target.value) })} className={field}>
              {WEIGHTS.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </label>
          <NumberField label="Size (px)" value={style.size} onCommit={(v) => actions.updateStyle(style.id, { size: v })} />
          <NumberField label="Line height" value={style.line_height} step={0.05} onCommit={(v) => actions.updateStyle(style.id, { line_height: v })} />
          <NumberField label="Tracking (em)" value={style.tracking} step={0.01} onCommit={(v) => actions.updateStyle(style.id, { tracking: v })} />
          <label className="col-span-2 flex items-center gap-2 text-xs">
            <input type="checkbox" checked={style.text_transform === "uppercase"} onChange={(e) => actions.updateStyle(style.id, { text_transform: e.target.checked ? "uppercase" : "none" })} />
            Uppercase
          </label>
          <div className="col-span-2 flex justify-end">
            <SmallButton danger onClick={() => actions.deleteStyle(style.id)}>Delete style</SmallButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AddFamilyForm({ onAdd, onCancel }: { onAdd: (input: { name: string; source: FamilyRow["source"] }) => string | undefined; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [source, setSource] = useState<FamilyRow["source"]>("google");
  const [error, setError] = useState<string | undefined>();
  return (
    <form
      className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-line-strong p-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(onAdd({ name, source }));
      }}
    >
      <label className="flex flex-col gap-1 text-xs font-medium">
        Typeface name
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Fraunces" className={field} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium">
        Source
        <select value={source} onChange={(e) => setSource(e.target.value as FamilyRow["source"])} className={field}>
          <option value="google">Google Fonts</option>
          <option value="upload">Upload font files (.woff2, .woff, .ttf, .otf)</option>
          <option value="system">Installed on the viewer's device</option>
        </select>
      </label>
      <p className="text-xs leading-relaxed text-muted">
        {source === "google"
          ? "Use the exact name from fonts.google.com."
          : source === "upload"
            ? "After adding, upload a file for each weight. Check the font's licence allows web use."
            : "Only use for fonts like Arial or Georgia that every device has."}
      </p>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <div className="flex gap-2">
        <button type="submit" className="rounded-md bg-ink px-3 py-1.5 text-[13px] text-white">Add typeface</button>
        <button type="button" onClick={onCancel} className="rounded-md px-3 py-1.5 text-[13px] hover:bg-paper">Cancel</button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Small inputs
// ---------------------------------------------------------------------------

/** Text input that commits on blur or Enter, so half-typed values aren't saved. */
function CommitInput({ value, onCommit, className, maxLength, placeholder, inputMode }: {
  value: string;
  onCommit: (v: string) => void;
  className?: string;
  maxLength?: number;
  placeholder?: string;
  inputMode?: "numeric" | "decimal";
}) {
  return (
    <input
      key={value}
      defaultValue={value}
      maxLength={maxLength}
      placeholder={placeholder}
      inputMode={inputMode}
      className={className}
      onBlur={(e) => {
        if (e.currentTarget.value !== value) onCommit(e.currentTarget.value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          e.currentTarget.value = value;
          e.currentTarget.blur();
        }
      }}
    />
  );
}

function NumberField({ label, value, onCommit, step = 1 }: { label: string; value: number; onCommit: (v: number) => void; step?: number }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium">
      {label}
      <input
        key={value}
        type="number"
        step={step}
        defaultValue={value}
        className={field}
        onBlur={(e) => {
          const n = Number(e.currentTarget.value);
          if (Number.isFinite(n) && n !== value) onCommit(n);
        }}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
    </label>
  );
}

function SmallButton({ children, onClick, disabled, danger }: { children: ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={`rounded px-2 py-1 text-xs hover:bg-surface disabled:opacity-30 ${danger ? "text-danger" : ""}`}>
      {children}
    </button>
  );
}

function UploadedFontFiles({ family, draft, actions }: { family: FamilyRow; draft: Draft; actions: BrandActions }) {
  const files = familyFontFiles(draft, family.id);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-1.5 border-t border-line pt-2">
      {files.map((ff) => (
        <div key={ff.id} className="flex items-center gap-2 text-xs">
          <span style={{ fontFamily: familyCss(family), fontWeight: ff.weight, fontStyle: ff.style }} className="flex-1 truncate text-sm">
            {ff.weight} {ff.style === "italic" ? "Italic" : ""}
          </span>
          <span className="truncate text-muted">{draft.assets[ff.asset_id]?.name}</span>
          <SmallButton danger onClick={() => actions.deleteFontFile(ff.id)}>Remove</SmallButton>
        </div>
      ))}
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        className="self-start text-xs text-accent hover:underline disabled:opacity-50"
      >
        {busy ? "Uploading…" : files.length ? "Add more weights" : "Upload font files"}
      </button>
      <input
        ref={input}
        type="file"
        multiple
        accept=".woff2,.woff,.ttf,.otf"
        className="sr-only"
        aria-label={`Upload font files for ${family.name}`}
        onChange={async (e) => {
          const list = [...(e.target.files ?? [])];
          e.target.value = "";
          if (!list.length) return;
          setBusy(true);
          await actions.uploadFontFiles(family.id, list);
          setBusy(false);
        }}
      />
      <p className="text-[11px] leading-relaxed text-muted">Weight and style are read from each file name, e.g. Brand-SemiBoldItalic.woff2.</p>
      <label className="flex items-start gap-2 text-xs">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={family.downloadable}
          onChange={(e) => actions.setFontLicence(family.id, e.target.checked, family.licence_note)}
        />
        <span>Licence allows clients to download these files</span>
      </label>
    </div>
  );
}
