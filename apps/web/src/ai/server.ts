/**
 * Server-side plumbing shared by the chat route and the assistant actions:
 * who is asking, what the brand looks like, and how much allowance is left.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { limitOf } from "@stella/entitlements";
import { workspaceEntitlements } from "@/lib/brands";
import { loadDraft } from "@/lib/draft";
import { supabaseServer } from "@/lib/supabase/server";
import { buildBrandContext } from "./context";
import type { ChatTurn } from "./generate";
import { aiConfigured } from "./provider";

export type Allowance = { used: number; limit: number };

export class AiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function aiSession(brandId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(brandId)) throw new AiError("Unknown brand", 404);
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AiError("Your session ended. Sign in again.", 401);
  const loaded = await loadDraft(supabase, brandId);
  if (!loaded) throw new AiError("Brand not found", 404);
  const { brand, draft } = loaded;
  const [{ data: memory }, allowance] = await Promise.all([
    supabase.from("ai_memory").select("summary, message_count").eq("brand_id", brandId).maybeSingle(),
    allowanceFor(supabase, brand.workspace_id),
  ]);
  const context = buildBrandContext({ name: brand.name, description: brand.description, website: brand.website_url }, draft, memory?.summary ?? null);
  return { supabase, user, brand, draft, memory: memory ?? { summary: "", message_count: 0 }, allowance, context };
}

export async function allowanceFor(supabase: SupabaseClient, workspaceId: string): Promise<Allowance> {
  const [ent, { data: used }] = await Promise.all([
    workspaceEntitlements(supabase, workspaceId),
    supabase.rpc("ai_usage_this_month", { p_workspace_id: workspaceId }),
  ]);
  return { used: Number(used ?? 0), limit: limitOf(ent, "ai_tokens_monthly") };
}

/** Throws a user-facing error when AI can't run for this request. */
export function assertCanUseAi(allowance: Allowance) {
  if (!aiConfigured()) throw new AiError("The AI assistant isn't switched on yet: OPENAI_API_KEY is not set on the server.", 503);
  if (allowance.limit <= 0) throw new AiError("Your plan doesn't include the AI assistant. The AI plan adds it.", 402);
  if (allowance.used >= allowance.limit) throw new AiError("You've used this month's AI allowance. It resets on the 1st.", 429);
}

export async function recordUsage(supabase: SupabaseClient, workspaceId: string, tokens: number) {
  if (tokens <= 0) return;
  const { error } = await supabase.rpc("record_ai_usage", { p_workspace_id: workspaceId, p_tokens: Math.min(Math.round(tokens), 500_000) });
  if (error) console.error("record_ai_usage failed", error.message);
}

export async function threadTurns(supabase: SupabaseClient, threadId: string): Promise<ChatTurn[]> {
  const { data, error } = await supabase
    .from("ai_messages")
    .select("role, content")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw new AiError(`Could not load the conversation: ${error.message}`, 500);
  return (data ?? []) as ChatTurn[];
}
