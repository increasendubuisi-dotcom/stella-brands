"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_OPS_PER_SAVE } from "@stella/brand-schema";
import { saveDraft } from "@/app/(app)/brands/[id]/actions";
import type { Draft, Result } from "./model";
import { SaveQueue } from "./save-queue";

export type SaveStatus =
  | { state: "saved" }
  | { state: "pending" }
  | { state: "saving" }
  | { state: "retrying"; message: string }
  | { state: "conflict"; message: string }
  | { state: "error"; message: string };

const DEBOUNCE_MS = 700;
const RETRY_MS = [2000, 4000, 8000, 15000];

/**
 * Holds the draft in memory, applies edits instantly and saves them in the
 * background. One save is in flight at a time; edits made meanwhile wait for
 * the next batch. Stops (without losing the queue) on conflict or rejection.
 */
export function useDraft(brandId: string, initial: Draft, initialRev: number) {
  const [draft, setDraft] = useState(initial);
  const [status, setStatus] = useState<SaveStatus>({ state: "saved" });
  const draftRef = useRef(initial);
  const rev = useRef(initialRev);
  const queue = useRef(new SaveQueue());
  const inFlight = useRef(false);
  const halted = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attempts = useRef(0);

  const flush = useCallback(async () => {
    timer.current = null;
    if (inFlight.current || halted.current || queue.current.size === 0) return;
    inFlight.current = true;
    setStatus({ state: "saving" });
    const batch = queue.current.take(MAX_OPS_PER_SAVE);
    let result;
    try {
      result = await saveDraft(brandId, rev.current, batch);
    } catch {
      result = { ok: false as const, kind: "error" as const, message: "Couldn't reach the server" };
    }
    inFlight.current = false;

    if (result.ok) {
      rev.current = result.rev;
      attempts.current = 0;
      if (queue.current.size > 0) {
        setStatus({ state: "pending" });
        timer.current = setTimeout(flush, 0);
      } else {
        setStatus({ state: "saved" });
      }
      return;
    }

    queue.current.restore(batch);
    if (result.kind === "conflict") {
      halted.current = true;
      setStatus({ state: "conflict", message: "This guide was changed in another tab or by a teammate." });
    } else if (result.kind === "error") {
      const wait = RETRY_MS[Math.min(attempts.current, RETRY_MS.length - 1)]!;
      attempts.current++;
      setStatus({ state: "retrying", message: `Not saved yet. Retrying in ${Math.round(wait / 1000)}s.` });
      timer.current = setTimeout(flush, wait);
    } else {
      halted.current = true;
      setStatus({ state: "error", message: result.message });
    }
  }, [brandId]);

  const schedule = useCallback(() => {
    if (halted.current) return;
    setStatus((s) => (s.state === "saving" ? s : { state: "pending" }));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, DEBOUNCE_MS);
  }, [flush]);

  /** Apply a command result: update the screen now, save in the background. */
  const commit = useCallback(
    (result: Result) => {
      if (result.ops.length === 0 && !result.drop) return;
      draftRef.current = result.draft;
      setDraft(result.draft);
      if (result.drop) queue.current.drop(result.drop);
      queue.current.push(result.ops);
      schedule();
    },
    [schedule],
  );

  /** Run a command against the latest draft (safe inside rapid event handlers). */
  const run = useCallback(
    (command: (d: Draft) => Result) => {
      const result = command(draftRef.current);
      commit(result);
      return result;
    },
    [commit],
  );

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (queue.current.size > 0 || inFlight.current) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // Save immediately when the tab is hidden (switching apps, closing the laptop).
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden" && queue.current.size > 0) {
        if (timer.current) clearTimeout(timer.current);
        void flush();
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [flush]);

  return { draft, status, run, unsavedCount: () => queue.current.size };
}
