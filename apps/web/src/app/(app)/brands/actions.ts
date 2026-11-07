"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { slugify, templateToOps, TEMPLATES } from "@stella/brand-schema";
import { checkLimit } from "@stella/entitlements";
import { requireUser } from "@/lib/auth";
import { primaryWorkspace, workspaceEntitlements } from "@/lib/brands";

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

  // Slugs are global (they become the guide's address); add a short suffix if taken.
  const base = slugify(input.name).slice(0, 52);
  let brandId: string | null = null;
  for (let attempt = 0; attempt < 5 && !brandId; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${crypto.randomUUID().slice(0, 6)}`;
    const { data, error } = await supabase
      .from("brands")
      .insert({
        workspace_id: workspace!.id,
        name: input.name,
        slug,
        description: input.description,
        website_url: input.websiteUrl,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (data) brandId = data.id;
    else if (error?.code !== "23505") fail(`Could not create the brand: ${error?.message ?? "unknown error"}`);
  }
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
