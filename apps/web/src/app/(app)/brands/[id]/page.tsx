import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { primaryWorkspace, workspaceEntitlements } from "@/lib/brands";
import { loadDraft, signPaths } from "@/lib/draft";
import { Editor } from "@/editor/editor";
import { limitOf } from "@stella/entitlements";

export const metadata: Metadata = { title: "Editor" };

export default async function BrandEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, user } = await requireUser();

  const loaded = await loadDraft(supabase, id);
  if (!loaded) notFound();
  const { brand, draft } = loaded;

  const assets = Object.values(draft.assets);
  const byPath = await signPaths(supabase, assets.map((a) => a.storage_path));
  const assetUrls = Object.fromEntries(assets.map((a) => [a.id, byPath[a.storage_path] ?? ""]).filter(([, url]) => url));

  const workspace = await primaryWorkspace(supabase, user.id);
  const uploadLimitMb = workspace ? limitOf(await workspaceEntitlements(supabase, workspace.id), "upload_mb") : 25;

  const { data: current } = await supabase
    .from("versions")
    .select("number, draft_rev")
    .eq("brand_id", id)
    .order("number", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <Editor
      brand={{ id: brand.id, name: brand.name, slug: brand.slug, status: brand.status }}
      initial={draft}
      rev={brand.draft_rev}
      assetUrls={assetUrls}
      uploadLimitMb={uploadLimitMb}
      published={current ? { number: current.number, draftRev: Number(current.draft_rev) } : null}
    />
  );
}
