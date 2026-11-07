"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

/** A submit button that shows progress and blocks double submits while its form's action runs. */
export function PendingButton({ children, pendingLabel, className }: { children: ReactNode; pendingLabel: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={`${className ?? ""} disabled:cursor-wait disabled:opacity-60`}>
      {pending ? pendingLabel : children}
    </button>
  );
}
