"use server";

import { z } from "zod";
import { DRAFT_TABLES, MAX_OPS_PER_SAVE, safeParseBlockProps, type DraftOp } from "@stella/brand-schema";
import { supabaseServer } from "@/lib/supabase/server";

export type SaveResult =
  | { ok: true; rev: number }
  | { ok: false; kind: "conflict"; message: string; currentRev: number | null }
  | { ok: false; kind: "invalid" | "auth" | "error"; message: string };

const Op = z.object({
  op: z.enum(["upsert", "delete"]),
  table: z.enum(DRAFT_TABLES),
  row: z.record(z.string(), z.unknown()),
});
const Input = z.object({
  brandId: z.uuid(),
  baseRev: z.number().int().nonnegative(),
  ops: z.array(Op).min(1).max(MAX_OPS_PER_SAVE),
});

/**
 * Saves a batch of draft changes. The database applies them atomically and
 * refuses the batch if the guide changed since `baseRev` (another tab or a teammate).
 */
export async function saveDraft(brandId: string, baseRev: number, ops: DraftOp[]): Promise<SaveResult> {
  const parsed = Input.safeParse({ brandId, baseRev, ops });
  if (!parsed.success) return { ok: false, kind: "invalid", message: parsed.error.issues[0]?.message ?? "Invalid changes" };

  const clean: DraftOp[] = [];
  for (const op of parsed.data.ops) {
    const row = { ...op.row };
    delete row.brand_id; // always set by the database from the brand being saved
    if (op.op === "upsert" && op.table === "blocks" && "props" in row) {
      if (typeof row.type !== "string") return { ok: false, kind: "invalid", message: "Block content was sent without its type" };
      const props = safeParseBlockProps(row.type, row.props);
      if (!props.success) return { ok: false, kind: "invalid", message: `A ${row.type} block has invalid content` };
      row.props = props.data;
    }
    clean.push({ op: op.op, table: op.table, row } as DraftOp);
  }

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, kind: "auth", message: "Your session ended. Sign in again to keep saving." };

  const { data, error } = await supabase.rpc("apply_draft_ops", {
    p_brand_id: parsed.data.brandId,
    p_base_rev: parsed.data.baseRev,
    p_ops: clean,
  });

  if (error) {
    if (error.code === "SB409") {
      let currentRev: number | null = null;
      try {
        currentRev = JSON.parse(error.details ?? "{}").currentRev ?? null;
      } catch {
        // detail is informational only
      }
      return { ok: false, kind: "conflict", message: error.message, currentRev };
    }
    if (error.code === "P0002" || error.code === "42501") {
      return { ok: false, kind: "auth", message: "You don't have permission to edit this brand." };
    }
    if (["23514", "23503", "23505", "22023", "22P02"].includes(error.code ?? "")) {
      return { ok: false, kind: "invalid", message: error.message };
    }
    return { ok: false, kind: "error", message: error.message };
  }
  return { ok: true, rev: Number(data) };
}
