import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { entitlementsFor, type Entitlements } from "@stella/entitlements";

export type BrandListItem = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: "draft" | "published" | "archived";
  visibility: "public" | "password" | "unpublished";
  draft_rev: number;
  current_version_id: string | null;
  updated_at: string;
  workspace_id: string;
  publishedNumber: number | null;
  hasUnpublishedChanges: boolean;
};

export type StatusFilter = "all" | "draft" | "published" | "archived";

export async function listBrands(supabase: SupabaseClient, filter: StatusFilter): Promise<BrandListItem[]> {
  let query = supabase
    .from("brands")
    .select("id, name, slug, description, status, visibility, draft_rev, current_version_id, updated_at, workspace_id")
    .order("updated_at", { ascending: false });
  query = filter === "all" ? query.neq("status", "archived") : query.eq("status", filter);
  const { data, error } = await query;
  if (error) throw new Error(`Could not load brands: ${error.message}`);

  const versionIds = (data ?? []).map((b) => b.current_version_id).filter((v): v is string => Boolean(v));
  const versions = new Map<string, { number: number; draft_rev: number }>();
  if (versionIds.length) {
    const { data: vs, error: vErr } = await supabase.from("versions").select("id, number, draft_rev").in("id", versionIds);
    if (vErr) throw new Error(`Could not load versions: ${vErr.message}`);
    for (const v of vs ?? []) versions.set(v.id, { number: v.number, draft_rev: v.draft_rev });
  }

  return (data ?? []).map((b) => {
    const v = b.current_version_id ? versions.get(b.current_version_id) : undefined;
    return {
      ...b,
      publishedNumber: v?.number ?? null,
      hasUnpublishedChanges: v ? b.draft_rev > v.draft_rev : false,
    } as BrandListItem;
  });
}

export async function countByStatus(supabase: SupabaseClient): Promise<Record<StatusFilter, number>> {
  const { data, error } = await supabase.from("brands").select("status");
  if (error) throw new Error(`Could not count brands: ${error.message}`);
  const counts = { all: 0, draft: 0, published: 0, archived: 0 };
  for (const row of data ?? []) {
    const s = row.status as StatusFilter;
    counts[s]++;
    if (s !== "archived") counts.all++;
  }
  return counts;
}

/** The workspace new brands go into: the first one the user owns or can edit. */
export async function primaryWorkspace(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspace_id, role, workspaces(name)")
    .eq("user_id", userId)
    .in("role", ["owner", "admin", "editor"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Could not load your studio: ${error.message}`);
  if (!data) return null;
  const ws = data.workspaces as unknown as { name: string } | null;
  return { id: data.workspace_id as string, role: data.role as string, name: ws?.name ?? "Studio" };
}

export async function workspaceEntitlements(supabase: SupabaseClient, workspaceId: string): Promise<Entitlements> {
  const { data } = await supabase
    .from("subscriptions")
    .select("plan_key, status, limit_overrides, feature_overrides")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  const active = data && (data.status === "active" || data.status === "trialing");
  return entitlementsFor(active ? data.plan_key : "starter", {
    limitOverrides: (data?.limit_overrides ?? {}) as Entitlements["limitOverrides"],
    featureOverrides: (data?.feature_overrides ?? {}) as Entitlements["featureOverrides"],
  });
}

export function relativeTime(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
