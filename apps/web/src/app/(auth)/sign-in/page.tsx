import Link from "next/link";
import type { Metadata } from "next";
import { AuthShell, Field, FormError, SubmitButton } from "@/components/auth-shell";
import { signIn } from "../actions";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string; confirmed?: string }> }) {
  const { error, next, confirmed } = await searchParams;
  return (
    <AuthShell
      title="Welcome back"
      footer={
        <>
          New to Stella? <Link href="/sign-up" className="text-accent">Create an account</Link>
        </>
      }
    >
      {confirmed ? <p className="mb-4 rounded-[var(--radius-control)] bg-[#e6f2ea] px-3 py-2 text-sm text-success">Email confirmed. Sign in to continue.</p> : null}
      <FormError message={error} />
      <form action={signIn} className="flex flex-col gap-4">
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <Field label="Email" name="email" type="email" autoComplete="email" />
        <Field label="Password" name="password" type="password" autoComplete="current-password" />
        <SubmitButton>Sign in</SubmitButton>
      </form>
    </AuthShell>
  );
}
