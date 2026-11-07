import Link from "next/link";
import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import { primaryWorkspace, workspaceEntitlements } from "@/lib/brands";
import { signOut } from "../(auth)/actions";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { supabase, user } = await requireUser();
  const workspace = await primaryWorkspace(supabase, user.id);
  const plan = workspace ? (await workspaceEntitlements(supabase, workspace.id)).plan : null;
  const name = (user.user_metadata?.name as string | undefined) ?? user.email ?? "Account";
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="min-h-screen">
      <header className="flex flex-wrap items-center gap-6 border-b border-line bg-surface px-6 py-3.5 md:px-8">
        <Link href="/dashboard" className="font-[family-name:var(--font-display)] text-[26px] leading-none text-ink no-underline">
          Stella
        </Link>
        <nav aria-label="Main" className="flex gap-5 text-sm">
          <Link href="/dashboard" className="font-semibold text-ink no-underline">
            Brands
          </Link>
        </nav>
        <div className="flex-1" />
        {plan ? <span className="rounded-full border border-line px-2.5 py-1 text-xs text-muted">{plan.name} plan</span> : null}
        <details className="relative">
          <summary
            aria-label="Account menu"
            className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-full bg-ink text-sm font-semibold text-white"
          >
            {initials}
          </summary>
          <div className="absolute right-0 z-10 mt-2 w-56 rounded-[var(--radius-card)] border border-line bg-surface p-2 shadow-lg">
            <p className="truncate px-2 py-1.5 text-sm font-medium">{name}</p>
            <p className="truncate px-2 pb-2 text-xs text-muted">{workspace?.name}</p>
            <form action={signOut}>
              <button type="submit" className="w-full rounded-md px-2 py-2 text-left text-sm hover:bg-paper">
                Sign out
              </button>
            </form>
          </div>
        </details>
      </header>
      {children}
    </div>
  );
}
