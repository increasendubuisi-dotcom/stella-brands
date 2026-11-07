import Link from "next/link";
import type { Metadata } from "next";
import { ConfirmButton } from "@/components/confirm-button";
import { PendingButton } from "@/components/pending-button";
import { requireUser } from "@/lib/auth";
import { countByStatus, listBrands, relativeTime, type BrandListItem, type StatusFilter } from "@/lib/brands";
import { archiveBrand, deleteBrand, duplicateBrand, restoreBrand } from "../brands/actions";

export const metadata: Metadata = { title: "Your brands" };

const TABS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Drafts" },
  { key: "published", label: "Published" },
  { key: "archived", label: "Archived" },
];

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ status?: string; deleted?: string; error?: string }> }) {
  const params = await searchParams;
  const filter = (TABS.find((t) => t.key === params.status)?.key ?? "all") as StatusFilter;
  const { supabase } = await requireUser();
  const [brands, counts] = await Promise.all([listBrands(supabase, filter), countByStatus(supabase)]);

  return (
    <main className="mx-auto flex max-w-[1240px] flex-col gap-8 px-6 py-12 md:px-8">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex min-w-[280px] flex-1 flex-col gap-2">
          <h1 className="font-[family-name:var(--font-display)] text-5xl leading-none md:text-[56px]">Your brands</h1>
          <p className="text-[15px] text-muted">Drafts stay private until you publish. Published guides keep their live version while you edit.</p>
        </div>
        <Link
          href="/brands/new"
          className="flex h-11 items-center gap-2 rounded-[var(--radius-control)] bg-ink px-5 font-medium text-white no-underline hover:bg-black"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New brand
        </Link>
      </div>

      {params.error ? (
        <p role="alert" className="rounded-[var(--radius-control)] bg-[#fbe9e5] px-3 py-2 text-sm text-danger">
          {params.error}
        </p>
      ) : null}

      {params.deleted ? (
        <p role="status" className="rounded-[var(--radius-control)] bg-[#e6f2ea] px-3 py-2 text-sm text-success">
          Brand deleted.
        </p>
      ) : null}

      <nav aria-label="Filter brands" className="flex gap-6 border-b border-line">
        {TABS.map((tab) => {
          const active = tab.key === filter;
          return (
            <Link
              key={tab.key}
              href={tab.key === "all" ? "/dashboard" : `/dashboard?status=${tab.key}`}
              aria-current={active ? "page" : undefined}
              className={`-mb-px border-b-2 py-2.5 text-sm no-underline ${active ? "border-ink font-semibold text-ink" : "border-transparent text-muted hover:text-ink"}`}
            >
              {tab.label} <span className="font-normal text-muted">{counts[tab.key]}</span>
            </Link>
          );
        })}
      </nav>

      {brands.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <ul className="grid list-none grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-6 p-0">
          {brands.map((b) => (
            <BrandCard key={b.id} brand={b} />
          ))}
        </ul>
      )}
    </main>
  );
}

function StatusBadge({ brand }: { brand: BrandListItem }) {
  if (brand.status === "archived") return <span className="rounded-full bg-[#f0eee8] px-2 py-0.5 text-xs text-muted">Archived</span>;
  if (brand.status === "published")
    return <span className="rounded-full bg-[#e6f2ea] px-2 py-0.5 text-xs text-[#1f5c3b]">Live · v{brand.publishedNumber}</span>;
  return <span className="rounded-full bg-[#f0eee8] px-2 py-0.5 text-xs text-muted">Draft</span>;
}

function BrandCard({ brand }: { brand: BrandListItem }) {
  const archived = brand.status === "archived";
  return (
    <li className="flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
      <Link href={`/brands/${brand.id}`} className="flex h-36 items-end bg-paper p-5 text-ink no-underline" aria-label={`Open ${brand.name}`}>
        <span className="font-[family-name:var(--font-display)] text-3xl leading-tight">{brand.name}</span>
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center gap-2">
          <Link href={`/brands/${brand.id}`} className="truncate text-[15px] font-semibold text-ink no-underline">
            {brand.name}
          </Link>
          <span className="flex-1" />
          <StatusBadge brand={brand} />
        </div>
        <span className="text-[13px] text-muted">
          {brand.hasUnpublishedChanges ? "Draft has unpublished changes · " : ""}
          Edited {relativeTime(brand.updated_at)}
        </span>
        <div className="mt-auto flex gap-1 pt-2">
          {archived ? (
            <>
              <form action={restoreBrand}>
                <input type="hidden" name="id" value={brand.id} />
                <button type="submit" className="rounded-md px-2 py-1.5 text-[13px] text-ink hover:bg-paper">
                  Restore
                </button>
              </form>
              <form action={deleteBrand}>
                <input type="hidden" name="id" value={brand.id} />
                <ConfirmButton
                  message={`Delete ${brand.name} permanently? Its draft, published versions and live link are removed. This cannot be undone.`}
                  className="rounded-md px-2 py-1.5 text-[13px] text-danger hover:bg-paper"
                >
                  Delete permanently
                </ConfirmButton>
              </form>
            </>
          ) : (
            <>
              <form action={duplicateBrand}>
                <input type="hidden" name="id" value={brand.id} />
                <PendingButton pendingLabel="Duplicating…" className="rounded-md px-2 py-1.5 text-[13px] text-muted hover:bg-paper hover:text-ink">
                  Duplicate
                </PendingButton>
              </form>
              <form action={archiveBrand}>
                <input type="hidden" name="id" value={brand.id} />
                <button type="submit" className="rounded-md px-2 py-1.5 text-[13px] text-muted hover:bg-paper hover:text-ink">
                  Archive
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

function EmptyState({ filter }: { filter: StatusFilter }) {
  const copy: Record<StatusFilter, string> = {
    all: "No brands yet. Start one and it will appear here.",
    draft: "No drafts. Every brand starts as a draft until you publish it.",
    published: "Nothing published yet. Publishing gives a brand a live link you can share.",
    archived: "Nothing archived. Archived brands are hidden from the main list and can be restored.",
  };
  return (
    <div className="flex flex-col items-start gap-4 rounded-[var(--radius-card)] border border-dashed border-line-strong p-10">
      <p className="text-[15px] text-muted">{copy[filter]}</p>
      {filter === "all" ? (
        <Link href="/brands/new" className="rounded-[var(--radius-control)] bg-ink px-4 py-2.5 text-sm font-medium text-white no-underline">
          Start a brand
        </Link>
      ) : null}
    </div>
  );
}
