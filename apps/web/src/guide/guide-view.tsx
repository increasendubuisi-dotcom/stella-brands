import type { ReactNode } from "react";
import { contrastRatio, type GuideSnapshot, type SnapshotBlock, type SnapshotSection } from "@stella/brand-schema";
import { cssFamilyName } from "@/editor/brand-system";
import { docToText } from "@/editor/model";
import { CopyChip, DownloadAll } from "./guide-client";

/**
 * Renders a guide snapshot: the published guide, and the designer's preview of
 * the draft. Read-only; everything comes from the snapshot, so what a client
 * sees can never drift from what was published.
 */

type Props = {
  snapshot: GuideSnapshot;
  /** Short-lived URLs for files, keyed by asset id. */
  urls: Record<string, string>;
  /** Link for downloading one asset, or null when downloads aren't available here. */
  downloadHref: (assetId: string) => string | null;
  /** Endpoint returning download links for "Download all", or null. */
  downloadAllEndpoint: string | null;
  banner?: ReactNode;
};

const STRATEGY_LABELS: Record<string, string> = {
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

function fontStack(f: { name: string; fallback: string } | undefined, generic: string) {
  if (!f) return generic;
  return `"${cssFamilyName(f.name)}", ${f.fallback.replace(/[^\p{L}\p{N} ,_-]/gu, "") || generic}`;
}

export function GuideView({ snapshot, urls, downloadHref, downloadAllEndpoint, banner }: Props) {
  const families = snapshot.tokens.typeFamilies;
  const primary = families.find((f) => f.role === "primary") ?? families[0];
  const secondary = families.find((f) => f.role === "secondary") ?? primary;
  const headingFont = fontStack(primary, "Georgia, serif");
  const bodyFont = fontStack(secondary, "system-ui, sans-serif");

  const googleLinks = families
    .filter((f) => f.source === "google")
    .flatMap((f) => {
      const weights = new Set([400, ...snapshot.tokens.typeStyles.filter((s) => s.familyId === f.id).map((s) => s.weight)]);
      const fam = encodeURIComponent(f.name).replace(/%20/g, "+");
      return [...weights].map((w) => `https://fonts.googleapis.com/css2?family=${fam}:wght@${w}&display=swap`);
    });
  const faces = families
    .flatMap((f) =>
      f.files.map((ff) => {
        const url = urls[ff.assetId];
        if (!url || !/^https:\/\//.test(url)) return "";
        return `@font-face{font-family:"${cssFamilyName(f.name)}";src:url("${encodeURI(url)}");font-weight:${ff.weight};font-style:${ff.style};font-display:swap;}`;
      }),
    )
    .join("\n");

  const downloads = snapshot.assets.filter((a) => a.downloadable);

  return (
    <div className="min-h-screen bg-white text-[#1b1b1b]" style={{ fontFamily: bodyFont }}>
      {googleLinks.map((href) => (
        <link key={href} rel="stylesheet" href={href} precedence="guide-fonts" />
      ))}
      {faces ? <style>{faces}</style> : null}
      {banner}
      <div className="flex flex-wrap">
        <nav aria-label="Guide" className="w-full border-b border-black/10 px-6 py-6 md:sticky md:top-0 md:h-screen md:w-[260px] md:overflow-auto md:border-b-0 md:border-r md:py-10">
          <a href="#top" className="block text-2xl leading-tight no-underline" style={{ fontFamily: headingFont, color: "inherit" }}>
            {snapshot.brand.name}
          </a>
          <span className="mt-1 block text-xs text-black/50">Brand guidelines</span>
          <ol className="mt-6 flex list-none flex-col gap-1 p-0 text-[15px]">
            {snapshot.sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.slug}`} className="block py-1 text-inherit no-underline hover:underline">
                  {s.title}
                </a>
              </li>
            ))}
            {downloads.length ? (
              <li className="mt-4">
                <a href="#downloads" className="block rounded-md bg-[#1b1b1b] px-3 py-2 text-center text-sm text-white no-underline">
                  Brand assets
                </a>
              </li>
            ) : null}
          </ol>
        </nav>

        <main id="top" className="min-w-0 flex-[999_1_560px]">
          <div className="mx-auto flex max-w-[920px] flex-col gap-20 px-6 py-12 md:px-14 md:py-16">
            {snapshot.sections.length === 0 ? <p className="text-black/60">This guide has no visible sections yet.</p> : null}
            {snapshot.sections.map((s, i) => (
              <Section key={s.id} section={s} depth={0} index={i} snapshot={snapshot} urls={urls} headingFont={headingFont} downloadHref={downloadHref} />
            ))}
            {downloads.length ? (
              <section id="downloads" className="scroll-mt-8 border-t border-black/10 pt-12">
                <h2 className="mb-6 text-4xl" style={{ fontFamily: headingFont }}>
                  Brand assets
                </h2>
                <ul className="grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
                  {downloads.map((a) => {
                    const href = downloadHref(a.id);
                    return (
                      <li key={a.id} className="flex items-center gap-3 rounded-lg border border-black/10 p-3">
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded bg-[#f5f3ee] text-[10px] font-semibold text-black/50">
                          {urls[a.id] && a.mime.startsWith("image/") ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={urls[a.id]} alt="" className="h-full w-full object-contain p-1" />
                          ) : (
                            (a.name.split(".").pop() ?? "FILE").toUpperCase().slice(0, 4)
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{a.name}</span>
                          <span className="text-xs text-black/50">{formatBytes(a.size)}</span>
                        </span>
                        {href ? (
                          <a href={href} className="rounded-md border border-black/15 px-3 py-1.5 text-sm text-inherit no-underline hover:bg-black/5">
                            Download
                          </a>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
                {downloadAllEndpoint && downloads.length > 1 ? (
                  <div className="mt-4">
                    <DownloadAll endpoint={downloadAllEndpoint} fileName={`${snapshot.brand.slug}-brand-assets.zip`} />
                  </div>
                ) : null}
              </section>
            ) : null}
            <footer className="border-t border-black/10 pt-6 text-xs text-black/40">Made with Stella</footer>
          </div>
        </main>
      </div>
    </div>
  );
}

function formatBytes(n: number) {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function Section({ section, depth, index, snapshot, urls, headingFont, downloadHref }: {
  section: SnapshotSection;
  depth: number;
  index: number;
  snapshot: GuideSnapshot;
  urls: Record<string, string>;
  headingFont: string;
  downloadHref: Props["downloadHref"];
}) {
  const H = depth === 0 ? "h1" : depth === 1 ? "h2" : "h3";
  const size = depth === 0 ? "text-5xl md:text-6xl" : depth === 1 ? "text-3xl" : "text-xl";
  return (
    <section id={section.slug} className={`scroll-mt-8 ${depth === 0 ? "" : "mt-14"}`}>
      {depth === 0 ? <span className="mb-3 block text-xs uppercase tracking-[0.16em] text-black/45">{String(index + 1).padStart(2, "0")}</span> : null}
      <H className={`mb-6 leading-[1.05] ${size}`} style={{ fontFamily: headingFont }}>
        {section.title}
      </H>
      <div className="flex flex-col gap-6">
        {section.blocks.map((b) => (
          <div key={b.id} className={b.layout.width === "narrow" ? "max-w-[560px]" : ""}>
            <Block block={b} snapshot={snapshot} urls={urls} headingFont={headingFont} downloadHref={downloadHref} />
          </div>
        ))}
      </div>
      {section.children.map((c, i) => (
        <Section key={c.id} section={c} depth={depth + 1} index={i} snapshot={snapshot} urls={urls} headingFont={headingFont} downloadHref={downloadHref} />
      ))}
    </section>
  );
}

function Block({ block, snapshot, urls, headingFont, downloadHref }: {
  block: SnapshotBlock;
  snapshot: GuideSnapshot;
  urls: Record<string, string>;
  headingFont: string;
  downloadHref: Props["downloadHref"];
}) {
  const p = block.props as Record<string, unknown>;
  const asset = (id: unknown) => (typeof id === "string" ? snapshot.assets.find((a) => a.id === id) : undefined);
  const color = (id: unknown) => (typeof id === "string" ? snapshot.tokens.colors.find((c) => c.id === id) : undefined);

  switch (block.type) {
    case "text": {
      const text = docToText(p.doc);
      if (!text.trim()) return null;
      return (
        <div className="flex flex-col gap-4 text-[17px] leading-relaxed">
          {text.split(/\n{2,}/).map((para, i) => (
            <p key={i} className="m-0 whitespace-pre-line">
              {para}
            </p>
          ))}
        </div>
      );
    }
    case "heading": {
      if (!p.text) return null;
      const level = Number(p.level ?? 2);
      return (
        <p className={`m-0 leading-tight ${level === 1 ? "text-4xl" : level === 2 ? "text-[28px]" : "text-xl"}`} style={{ fontFamily: headingFont }}>
          {String(p.text)}
        </p>
      );
    }
    case "strategy_field": {
      const key = String(p.fieldKey);
      const value = snapshot.strategy[key as keyof typeof snapshot.strategy];
      if (!value) return null;
      const text = typeof value === "string" ? value : value.map((v) => (v.body ? `${v.title}: ${v.body}` : v.title)).join("\n");
      if (!text.trim()) return null;
      const display = String(p.display ?? "body");
      return (
        <div className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-[0.14em] text-black/45">{STRATEGY_LABELS[key] ?? key}</span>
          {display === "list" ? (
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {text.split("\n").filter(Boolean).map((line, i) => (
                <li key={i} className="border-t border-black/10 pt-3 text-lg">
                  {line}
                </li>
              ))}
            </ul>
          ) : display === "statement" ? (
            <p className="m-0 text-3xl leading-snug md:text-[34px]" style={{ fontFamily: headingFont }}>
              {text}
            </p>
          ) : (
            <p className="m-0 whitespace-pre-line text-[17px] leading-relaxed">{text}</p>
          )}
        </div>
      );
    }
    case "divider":
      return <hr className="border-black/15" />;
    case "palette": {
      const show = (p.show as Record<string, boolean>) ?? {};
      const colors = ((p.tokenIds as string[]) ?? []).map(color).filter((c): c is NonNullable<ReturnType<typeof color>> => Boolean(c));
      if (!colors.length) return null;
      const layout = String(p.layout ?? "columns");
      const columns = layout === "stacked" ? 1 : layout === "grid" ? 3 : Math.min(colors.length, 5);
      return (
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {colors.map((c) => (
            <div key={c.id} className="flex flex-col overflow-hidden rounded-lg border border-black/10">
              <div className="h-36" style={{ background: c.hex }} />
              <div className="flex flex-col gap-0.5 p-3 text-xs">
                <strong className="mb-1 text-sm">{c.name}</strong>
                {show.hex !== false ? <CopyChip value={c.hex} /> : null}
                {show.rgb !== false ? <CopyChip value={`RGB ${c.rgb.r} ${c.rgb.g} ${c.rgb.b}`} /> : null}
                {show.cmyk !== false ? <CopyChip value={`CMYK ${c.cmyk.c} ${c.cmyk.m} ${c.cmyk.y} ${c.cmyk.k}`} /> : null}
                {show.pantone && c.pantone ? <CopyChip value={`PMS ${c.pantone}`} /> : null}
              </div>
            </div>
          ))}
        </div>
      );
    }
    case "color_combinations": {
      const pairs = ((p.pairs as Array<{ foregroundId: string; backgroundId: string }>) ?? [])
        .map((x) => ({ fg: color(x.foregroundId), bg: color(x.backgroundId) }))
        .filter((x) => x.fg && x.bg);
      if (!pairs.length) return null;
      return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {pairs.map(({ fg, bg }) => {
            const ratio = contrastRatio(fg!.hex, bg!.hex);
            return (
              <div key={`${fg!.id}-${bg!.id}`} className="flex flex-col gap-8 rounded-lg p-5" style={{ background: bg!.hex, color: fg!.hex }}>
                <span className="text-4xl" style={{ fontFamily: headingFont }}>
                  Aa
                </span>
                <span className="text-xs">
                  {fg!.name} on {bg!.name} · {ratio.toFixed(1)}:1 {ratio >= 7 ? "AAA" : ratio >= 4.5 ? "AA" : ratio >= 3 ? "AA large" : ""}
                </span>
              </div>
            );
          })}
        </div>
      );
    }
    case "type_specimen": {
      const styles = ((p.styleIds as string[]) ?? []).map((id) => snapshot.tokens.typeStyles.find((s) => s.id === id)).filter(Boolean);
      if (!styles.length) return null;
      return (
        <div className="flex flex-col divide-y divide-black/10">
          {styles.map((s) => {
            const fam = snapshot.tokens.typeFamilies.find((f) => f.id === s!.familyId);
            return (
              <div key={s!.id} className="flex flex-col gap-2 py-5 first:pt-0">
                {p.showDetails !== false ? (
                  <span className="text-xs text-black/50">
                    {s!.name} · {fam?.name} {s!.weight} · {s!.size}px / {s!.lineHeight}
                  </span>
                ) : null}
                <span
                  className="break-words"
                  style={{
                    fontFamily: fontStack(fam, "inherit"),
                    fontWeight: s!.weight,
                    fontSize: `min(${s!.size}px, 12vw)`,
                    lineHeight: s!.lineHeight,
                    letterSpacing: `${s!.tracking}em`,
                    textTransform: s!.textTransform,
                  }}
                >
                  {String(p.sampleText || s!.name)}
                </span>
              </div>
            );
          })}
        </div>
      );
    }
    case "type_family": {
      const fam = snapshot.tokens.typeFamilies.find((f) => f.id === p.familyId);
      if (!fam) return null;
      const stack = fontStack(fam, "inherit");
      const weights = [...new Set([400, ...snapshot.tokens.typeStyles.filter((s) => s.familyId === fam.id).map((s) => s.weight)])].sort();
      return (
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-[auto_1fr]">
          <span className="text-[140px] leading-none" style={{ fontFamily: stack }}>
            Aa
          </span>
          <div className="flex flex-col gap-3">
            <span className="text-3xl" style={{ fontFamily: stack }}>
              {fam.name}
            </span>
            {p.showWeights !== false ? (
              <div className="flex flex-wrap gap-x-5 text-lg">
                {weights.map((w) => (
                  <span key={w} style={{ fontFamily: stack, fontWeight: w }}>
                    {w}
                  </span>
                ))}
              </div>
            ) : null}
            {p.showCharacters !== false ? (
              <p className="m-0 break-all text-xl leading-relaxed" style={{ fontFamily: stack }}>
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
    case "image": {
      const a = asset(p.assetId);
      const url = a ? urls[a.id] : undefined;
      if (!url) return null;
      const bg = color(p.background)?.hex ?? "#f5f3ee";
      return (
        <figure className="m-0 flex flex-col gap-2">
          <div className="overflow-hidden rounded-lg" style={{ background: bg }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={String(p.alt ?? "")} loading="lazy" className={`max-h-[640px] w-full ${p.fit === "cover" ? "object-cover" : "object-contain p-10"}`} />
          </div>
          {p.caption ? <figcaption className="text-sm text-black/55">{String(p.caption)}</figcaption> : null}
        </figure>
      );
    }
    case "video": {
      const a = asset(p.assetId);
      const url = a ? urls[a.id] : undefined;
      if (!url) return null;
      return (
        <figure className="m-0 flex flex-col gap-2">
          <video src={url} controls muted={Boolean(p.autoplay)} autoPlay={Boolean(p.autoplay)} loop={Boolean(p.loop)} playsInline preload="metadata" className="w-full rounded-lg bg-black" />
          {p.caption ? <figcaption className="text-sm text-black/55">{String(p.caption)}</figcaption> : null}
        </figure>
      );
    }
    case "gallery": {
      const items = ((p.assetIds as string[]) ?? []).map(asset).filter((a) => a && urls[a.id]);
      if (!items.length) return null;
      const columns = Math.max(1, Math.min(6, Number(p.columns ?? 3)));
      return (
        <figure className="m-0 flex flex-col gap-2">
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
            {items.map((a) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={a!.id} src={urls[a!.id]} alt={a!.name} loading="lazy" className="aspect-square w-full rounded-lg bg-[#f5f3ee] object-contain p-4" />
            ))}
          </div>
          {p.caption ? <figcaption className="text-sm text-black/55">{String(p.caption)}</figcaption> : null}
        </figure>
      );
    }
    case "file_download": {
      const files = ((p.assetIds as string[]) ?? []).map(asset).filter((a) => a && a.downloadable);
      if (!files.length) return null;
      return (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">{String(p.label ?? "Download")}</span>
          {files.map((a) => {
            const href = downloadHref(a!.id);
            return (
              <div key={a!.id} className="flex items-center gap-3 rounded-lg border border-black/10 p-3 text-sm">
                <span className="min-w-0 flex-1 truncate">{a!.name}</span>
                <span className="text-xs text-black/50">{formatBytes(a!.size)}</span>
                {href ? (
                  <a href={href} className="rounded-md border border-black/15 px-3 py-1 text-inherit no-underline hover:bg-black/5">
                    Download
                  </a>
                ) : null}
              </div>
            );
          })}
        </div>
      );
    }
    case "dos_donts": {
      const items = (p.items as Array<{ assetId: string | null; kind: "do" | "dont"; note: string }>) ?? [];
      if (!items.length) return null;
      return (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {items.map((item, i) => {
            const a = asset(item.assetId);
            const url = a ? urls[a.id] : undefined;
            return (
              <figure key={i} className="m-0 flex flex-col gap-2">
                <div className={`overflow-hidden rounded-lg border-2 bg-[#f5f3ee] ${item.kind === "do" ? "border-[#2F7A4F]" : "border-[#A3361F]"}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {url ? <img src={url} alt="" loading="lazy" className="aspect-[4/3] w-full object-contain p-6" /> : <span className="block aspect-[4/3]" />}
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
    default:
      return null;
  }
}
