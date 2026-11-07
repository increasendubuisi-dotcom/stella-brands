"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { slugify, templateToOps, TEMPLATES } from "@stella/brand-schema";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkLimit } from "@stella/entitlements";
import { requireUser } from "@/lib/auth";
import { primaryWorkspace, workspaceEntitlements } from "@/lib/brands";
import { ASSET_BUCKET, loadDraft } from "@/lib/draft";
import { chunkOps, planDuplicate } from "@/lib/duplicate";

const NewBrand = z.object({
  name: z.string().trim().min(1, "Give the brand a name").max(120, "Keep the name under 120 characters"),
  description: z.string().trim().max(500, "Keep the description under 500 characters").optional().transform((v) => v || null),
  websiteUrl: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? (/^https?:\/\//i.test(v) ? v : `https://${v}`) : null))
    .pipe(z.url("Enter a valid website address").nullable()),
  template: z.enum(Object.keys(TEMPLATES) as [string, ...string[]]),
});

const fail = (message: string): never => redirect(`/brands/new?error=${encodeURIComponent(message)}`);

export async function createBrand(formData: FormData) {
  const parsed = NewBrand.safeParse(Object.fromEntries(formData));
  if (!parsed.success) fail(parsed.error.issues[0]?.message ?? "Check the details");
  const input = parsed.data!;

  const { supabase, user } = await requireUser();
  const workspace = await primaryWorkspace(supabase, user.id);
  if (!workspace) fail("You don't have a studio you can create brands in.");

  const ent = await workspaceEntitlements(supabase, workspace!.id);
  const { count } = await supabase.from("brands").select("id", { count: "exact", head: true }).eq("workspace_id", workspace!.id);
  const limit = checkLimit(ent, "brands", count ?? 0);
  if (!limit.allowed) fail(`Your ${ent.plan.name} plan includes ${limit.limit} brands. Archive or delete one, or upgrade.`);

  const { brandId, error: insertError } = await insertBrandWithUniqueSlug(supabase, {
    workspace_id: workspace!.id,
    name: input.name,
    description: input.description,
    website_url: input.websiteUrl,
    created_by: user.id,
  });
  if (insertError) fail(`Could not create the brand: ${insertError}`);
  if (!brandId) fail("Could not find a free web address for this brand. Try a different name.");

  const template = TEMPLATES[input.template]!;
  const { error: opsError } = await supabase.rpc("apply_draft_ops", {
    p_brand_id: brandId,
    p_base_rev: 0,
    p_ops: templateToOps(template),
  });
  if (opsError) {
    await supabase.from("brands").delete().eq("id", brandId!);
    fail(`Could not set up the template: ${opsError.message}`);
  }

  revalidatePath("/dashboard");
  redirect(`/brands/${brandId}`);
}

const IdForm = z.object({ id: z.uuid() });

export async function archiveBrand(formData: FormData) {
  const { id } = IdForm.parse(Object.fromEntries(formData));
  const { supabase } = await requireUser();
  const { error } = await supabase.from("brands").update({ archived_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}

export async function restoreBrand(formData: FormData) {
  const { id } = IdForm.parse(Object.fromEntries(formData));
  const { supabase } = await requireUser();
  const { error } = await supabase.from("brands").update({ archived_at: null }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}

export async function deleteBrand(formData: FormData) {
  const { id } = IdForm.parse(Object.fromEntries(formData));
  const { supabase } = await requireUser();
  const { error, count } = await supabase.from("brands").delete({ count: "exact" }).eq("id", id);
  if (error) throw new Error(error.message);
  if (!count) throw new Error("You don't have permission to delete this brand.");
  revalidatePath("/dashboard");
  redirect("/dashboard?status=archived&deleted=1");
}

type NewBrandRow = {
  workspace_id: string;
  name: string;
  description: string | null;
  website_url: string | null;
  created_by: string;
  theme_key?: string;
  theme_overrides?: Record<string, unknown>;
  nav_config?: Record<string, unknown>;
};

/** Slugs are global (they become the guide's address); add a short suffix if taken. */
async function insertBrandWithUniqueSlug(supabase: SupabaseClient, row: NewBrandRow): Promise<{ brandId: string | null; error: string | null }> {
  const base = slugify(row.name).slice(0, 52) || "brand";
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${crypto.randomUUID().slice(0, 6)}`;
    const { data, error } = await supabase.from("brands").insert({ ...row, slug }).select("id").single();
    if (data) return { brandId: data.id as string, error: null };
    if (error?.code !== "23505") return { brandId: null, error: error?.message ?? "unknown error" };
  }
  return { brandId: null, error: null };
}

/**
 * Copies a brand's draft (structure, blocks, colours, type, strategy and files)
 * into a new draft brand. Published versions, conversations and comments are
 * not copied: the copy starts unpublished.
 */
export async function duplicateBrand(formData: FormData) {
  const { id } = IdForm.parse(Object.fromEntries(formData));
  const { supabase, user } = await requireUser();
  const dashboardFail = (message: string): never => redirect(`/dashboard?error=${encodeURIComponent(message)}`);

  const loaded = await loadDraft(supabase, id);
  if (!loaded) dashboardFail("That brand no longer exists.");
  const { brand, draft } = loaded!;

  const { data: extra } = await supabase.from("brands").select("theme_overrides, nav_config").eq("id", id).single();

  const ent = await workspaceEntitlements(supabase, brand.workspace_id);
  const { count } = await supabase.from("brands").select("id", { count: "exact", head: true }).eq("workspace_id", brand.workspace_id);
  const limit = checkLimit(ent, "brands", count ?? 0);
  if (!limit.allowed) dashboardFail(`Your ${ent.plan.name} plan includes ${limit.limit} brands. Archive or delete one, or upgrade.`);

  const name = `${brand.name} (copy)`.slice(0, 120);
  const { brandId, error } = await insertBrandWithUniqueSlug(supabase, {
    workspace_id: brand.workspace_id,
    name,
    description: brand.description,
    website_url: brand.website_url,
    created_by: user.id,
    theme_key: brand.theme_key,
    theme_overrides: (extra?.theme_overrides as Record<string, unknown>) ?? {},
    nav_config: (extra?.nav_config as Record<string, unknown>) ?? {},
  });
  if (!brandId) dashboardFail(`Could not duplicate the brand${error ? `: ${error}` : ""}.`);

  const plan = planDuplicate(draft, brandId!);
  const copied: string[] = [];
  const undo = async (message: string): Promise<never> => {
    if (copied.length) await supabase.storage.from(ASSET_BUCKET).remove(copied);
    await supabase.from("brands").delete().eq("id", brandId!);
    return dashboardFail(message);
  };

  for (const c of plan.copies) {
    const { error: copyError } = await supabase.storage.from(ASSET_BUCKET).copy(c.from, c.to);
    if (copyError) await undo(`Could not copy a file (${c.from.split("/").pop()}): ${copyError.message}`);
    copied.push(c.to);
  }

  let rev = 0;
  for (const batch of chunkOps(plan.ops)) {
    const { data, error: opsError } = await supabase.rpc("apply_draft_ops", { p_brand_id: brandId, p_base_rev: rev, p_ops: batch });
    if (opsError) await undo(`Could not copy the guide: ${opsError.message}`);
    rev = Number(data);
  }

  revalidatePath("/dashboard");
  redirect(`/brands/${brandId}`);
}
