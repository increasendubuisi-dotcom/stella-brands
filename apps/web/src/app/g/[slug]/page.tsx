import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GuideView } from "@/guide/guide-view";
import { canSignFiles, loadPublishedGuide, signGuideAssets } from "@/lib/guide";
import { unlockGuide } from "./actions";

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<{ error?: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const guide = await loadPublishedGuide(slug);
  if (guide.kind === "ok") return { title: `${guide.snapshot.brand.name} brand guidelines`, robots: { index: false } };
  if (guide.kind === "locked") return { title: `${guide.brandName} brand guidelines`, robots: { index: false } };
  return { title: "Guide not found" };
}

export default async function PublishedGuidePage({ params }: Params) {
  const { slug } = await params;
  const guide = await loadPublishedGuide(slug);
  if (guide.kind === "missing") notFound();

  if (guide.kind === "locked") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-4">
        <form action={unlockGuide} className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-black/10 p-8">
          <h1 className="text-2xl font-semibold">{guide.brandName}</h1>
          <p className="text-sm text-black/60">These brand guidelines are private. Enter the password you were given.</p>
          <input type="hidden" name="slug" value={slug} />
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Password
            <input name="password" type="password" required autoComplete="current-password" className="h-11 rounded-lg border border-black/20 px-3 text-base font-normal outline-none focus:border-black" />
          </label>
          {guide.wrongPassword ? (
            <p role="alert" className="text-sm text-[#A3361F]">
              That password didn&apos;t work.
            </p>
          ) : null}
          <button type="submit" className="h-11 rounded-lg bg-[#1b1b1b] font-medium text-white">
            View guidelines
          </button>
        </form>
      </main>
    );
  }

  const urls = await signGuideAssets(guide.snapshot);
  const filesAvailable = canSignFiles();
  return (
    <GuideView
      snapshot={guide.snapshot}
      urls={urls}
      downloadHref={(id) => (filesAvailable ? `/g/${slug}/download/${id}` : null)}
      downloadAllEndpoint={filesAvailable ? `/g/${slug}/downloads` : null}
      agentBase={`/g/${slug}`}
    />
  );
}
