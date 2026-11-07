"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { buildSnapshot } from "@stella/brand-schema";
import { checkLimit } from "@stella/entitlements";
import { workspaceEntitlements } from "@/lib/brands";
import { loadDraft, snapshotInput } from "@/lib/draft";
import { supabaseServer } from "@/lib/supabase/server";

export type PublishState = {
  slug: string;
  visibility: "public" | "password" | "unpublished";
  hasPassword: boolean;
  currentVersionId: string | null;
  draftRev: number;
  versions: Array<{ id: string; number: number; publishedAt: string; note: string | null; draftRev: number }>;
};

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; message: string };

const BrandId = z.uuid();

async function client() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Your session ended. Sign in again.");
  return supabase;
}

export async function getPublishState(brandId: string): Promise<ActionResult<PublishState>> {
  if (!BrandId.safeParse(brandId).success) return { ok: false, message: "Unknown brand" };
  const supabase = await client();
  const [{ data: brand }, { data: versions }] = await Promise.all([
    supabase.from("brands").select("slug, visibility, current_version_id, draft_rev").eq("id", brandId).maybeSingle(),
    supabase.from("versions").select("id, number, published_at, note, draft_rev").eq("brand_id", brandId).order("number", { ascending: false }).limit(30),
  ]);
  if (!brand) return { ok: false, message: "Brand not found" };
  // Whether a password exists is not readable directly (the hash table is locked);
  // a password-protected guide always has one, because setting the mode requires it.
  return {
    ok: true,
    data: {
      slug: brand.slug,
      visibility: brand.visibility,
      hasPassword: brand.visibility === "password",
      currentVersionId: brand.current_version_id,
      draftRev: Number(brand.draft_rev),
      versions: (versions ?? []).map((v) => ({
        id: v.id,
        number: v.number,
        publishedAt: v.published_at,
        note: v.note,
        draftRev: Number(v.draft_rev),
      })),
    },
  };
}

/** Freezes the current draft into a new published version. */
export async function publishBrand(brandId: string, note: string): Promise<ActionResult<{ number: number }>> {
  if (!BrandId.safeParse(brandId).success) return { ok: false, message: "Unknown brand" };
  const supabase = await client();
  const loaded = await loadDraft(supabase, brandId);
  if (!loaded) return { ok: false, message: "Brand not found" };

  // Plan limit on live guides applies only when this brand isn't live yet.
  const { data: brandRow } = await supabase.from("brands").select("workspace_id, current_version_id, visibility").eq("id", brandId).single();
  if (brandRow && (!brandRow.current_version_id || brandRow.visibility === "unpublished")) {
    const ent = await workspaceEntitlements(supabase, brandRow.workspace_id);
    const { count } = await supabase
      .from("brands")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", brandRow.workspace_id)
      .neq("visibility", "unpublished")
      .not("current_version_id", "is", null)
      .neq("id", brandId);
    const limit = checkLimit(ent, "published_guides", count ?? 0);
    if (!limit.allowed) {
      return { ok: false, message: `Your ${ent.plan.name} plan includes ${limit.limit} live guide${limit.limit === 1 ? "" : "s"}. Unpublish another guide or upgrade.` };
    }
  }

  const { snapshot, warnings } = buildSnapshot(snapshotInput(loaded.brand, loaded.draft));
  const { data, error } = await supabase.rpc("publish_version", {
    p_brand_id: brandId,
    p_snapshot: snapshot,
    p_draft_rev: loaded.brand.draft_rev,
    p_note: note.trim().slice(0, 300) || null,
  });
  if (error) {
    if (error.code === "SB409") return { ok: false, message: "Your latest edits were still saving. Try publishing again." };
    return { ok: false, message: error.message };
  }
  if (warnings.length) console.warn(`publish ${brandId}: ${warnings.length} warnings`, warnings.slice(0, 5));
  revalidatePath(`/brands/${brandId}`);
  revalidatePath("/dashboard");
  return { ok: true, data: { number: (data as { number: number }).number } };
}

const Access = z.object({
  brandId: z.uuid(),
  visibility: z.enum(["public", "password", "unpublished"]),
  password: z.string().max(200).optional(),
});

export async function setGuideAccess(brandId: string, visibility: string, password?: string): Promise<ActionResult> {
  const parsed = Access.safeParse({ brandId, visibility, password: password || undefined });
  if (!parsed.success) return { ok: false, message: "Invalid access setting" };
  const supabase = await client();
  const { error } = await supabase.rpc("set_guide_access", {
    p_brand_id: parsed.data.brandId,
    p_visibility: parsed.data.visibility,
    p_password: parsed.data.password ?? null,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/dashboard");
  return { ok: true, data: undefined };
}

export async function restoreVersion(brandId: string, versionId: string): Promise<ActionResult<{ number: number }>> {
  if (!BrandId.safeParse(brandId).success || !BrandId.safeParse(versionId).success) return { ok: false, message: "Unknown version" };
  const supabase = await client();
  const { data, error } = await supabase.rpc("restore_version", { p_brand_id: brandId, p_version_id: versionId });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/dashboard");
  return { ok: true, data: { number: (data as { number: number }).number } };
}
