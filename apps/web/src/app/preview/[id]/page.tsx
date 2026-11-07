import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildSnapshot } from "@stella/brand-schema";
import { GuideView } from "@/guide/guide-view";
import { requireUser } from "@/lib/auth";
import { loadDraft, signPaths, snapshotInput } from "@/lib/draft";

export const metadata: Metadata = { title: "Preview", robots: { index: false } };

// The draft rendered exactly as the published guide would show it. Only the brand's editors can open this.
export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await requireUser();
  const loaded = await loadDraft(supabase, id);
  if (!loaded) notFound();

  const { snapshot } = buildSnapshot(snapshotInput(loaded.brand, loaded.draft));
  const byPath = await signPaths(supabase, snapshot.assets.map((a) => a.storagePath));
  const urls = Object.fromEntries(snapshot.assets.map((a) => [a.id, byPath[a.storagePath]]).filter(([, u]) => u));

  return (
    <GuideView
      snapshot={snapshot}
      urls={urls}
      downloadHref={(assetId) => urls[assetId] ?? null}
      downloadAllEndpoint={null}
      banner={
        <div className="sticky top-0 z-20 flex flex-wrap items-center gap-3 bg-[#3A3BD0] px-5 py-2.5 text-sm text-white">
          <strong>Preview of your draft</strong>
          <span className="opacity-80">Clients see this only after you publish. Hidden sections are left out.</span>
          <span className="flex-1" />
          <Link href={`/brands/${id}`} className="rounded-md bg-white/15 px-3 py-1 text-white no-underline hover:bg-white/25">
            Back to editor
          </Link>
        </div>
      }
    />
  );
}
