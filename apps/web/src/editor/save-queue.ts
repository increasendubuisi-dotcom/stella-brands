import type { DraftOp } from "@stella/brand-schema";
import { queueKey } from "./model";

/**
 * Collects draft ops between saves and merges repeated changes to the same row,
 * so typing a paragraph sends one update, not one per keystroke.
 *
 * Order is preserved by first appearance, so a new section is always inserted
 * before the blocks created inside it. A delete moves to the end of the batch.
 */
export class SaveQueue {
  private ops = new Map<string, DraftOp>();

  get size(): number {
    return this.ops.size;
  }

  push(ops: DraftOp[]): void {
    for (const op of ops) {
      const key = queueKey(op.table, op.row);
      const existing = this.ops.get(key);
      if (op.op === "delete") {
        this.ops.delete(key);
        this.ops.set(key, op);
      } else if (existing && existing.op === "upsert") {
        this.ops.set(key, { op: "upsert", table: op.table, row: { ...existing.row, ...op.row } });
      } else {
        // New key, or re-creating something deleted earlier in the batch.
        if (existing) this.ops.delete(key);
        this.ops.set(key, op);
      }
    }
  }

  /** Forget pending changes to rows that no longer exist (e.g. inside a deleted section). */
  drop(keys: string[]): void {
    for (const key of keys) this.ops.delete(key);
  }

  /** Take up to `max` ops for one save. Unsent ops stay queued. */
  take(max = 500): DraftOp[] {
    const batch: DraftOp[] = [];
    for (const [key, op] of this.ops) {
      if (batch.length >= max) break;
      batch.push(op);
      this.ops.delete(key);
    }
    return batch;
  }

  /** Put a failed batch back in front of anything queued since, merging with newer edits. */
  restore(batch: DraftOp[]): void {
    const newer = this.ops;
    this.ops = new Map();
    this.push(batch);
    this.push([...newer.values()]);
  }
}
