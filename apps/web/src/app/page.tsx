import Link from "next/link";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/env";
import { supabaseServer } from "@/lib/supabase/server";

export default async function Home() {
  if (isSupabaseConfigured()) {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) redirect("/dashboard");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-24">
      <h1 className="font-[family-name:var(--font-display)] text-7xl leading-none">Stella</h1>
      <p className="text-xl leading-relaxed text-muted">
        Brand guidelines for designers: build the guide, publish it as a live site, and hand it to your client.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href="/sign-up" className="rounded-[var(--radius-control)] bg-ink px-5 py-3 font-medium text-white no-underline hover:bg-black">
          Create an account
        </Link>
        <Link href="/sign-in" className="rounded-[var(--radius-control)] border border-line bg-surface px-5 py-3 text-ink no-underline">
          Sign in
        </Link>
      </div>
      <p className="text-sm text-subtle">Early access: Stella is being built in the open. Expect changes.</p>
    </main>
  );
}
