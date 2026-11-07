import "server-only";
import { cookies } from "next/headers";
import type { GuideSnapshot } from "@stella/brand-schema";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { signPaths } from "@/lib/draft";

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function guideCookie(slug: string) {
  return `stella_guide_${slug}`;
}

export type LoadedGuide =
  | { kind: "missing" }
  | { kind: "locked"; brandName: string; wrongPassword: boolean }
  | { kind: "ok"; snapshot: GuideSnapshot; version: number; publishedAt: string };

/**
 * Loads the live version of a guide for anyone (signed in or not). The database
 * function enforces visibility and the password; drafts are never reachable here.
 */
export async function loadPublishedGuide(slug: string): Promise<LoadedGuide> {
  if (!SLUG_RE.test(slug)) return { kind: "missing" };
  const jar = await cookies();
  const password = jar.get(guideCookie(slug))?.value ?? null;
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("get_published_guide", { p_slug: slug, p_password: password });
  if (error) throw new Error(`Could not load the guide: ${error.message}`);
  if (!data) return { kind: "missing" };
  const result = data as { locked: boolean; brandName?: string; version?: number; publishedAt?: string; snapshot?: GuideSnapshot };
  if (result.locked) return { kind: "locked", brandName: result.brandName ?? "This brand", wrongPassword: Boolean(password) };
  return { kind: "ok", snapshot: result.snapshot!, version: result.version!, publishedAt: result.publishedAt! };
}

/** Files in a published guide are private; the server signs them only after access is confirmed. */
export function canSignFiles(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function signGuideAssets(snapshot: GuideSnapshot, assetIds?: string[], download = false): Promise<Record<string, string>> {
  if (!canSignFiles()) return {};
  const wanted = assetIds ? snapshot.assets.filter((a) => assetIds.includes(a.id)) : snapshot.assets;
  const byPath = await signPaths(supabaseAdmin(), wanted.map((a) => a.storagePath), download ? 60 * 10 : 60 * 60 * 2, download);
  return Object.fromEntries(wanted.map((a) => [a.id, byPath[a.storagePath]]).filter(([, url]) => url));
}
