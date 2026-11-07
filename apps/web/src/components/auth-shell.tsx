import Link from "next/link";
import type { ReactNode } from "react";

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-16">
      <Link href="/" className="mb-10 font-[family-name:var(--font-display)] text-4xl leading-none text-ink no-underline">
        Stella
      </Link>
      <div className="w-full max-w-sm rounded-[var(--radius-card)] border border-line bg-surface p-8">
        <h1 className="font-[family-name:var(--font-display)] text-3xl leading-tight">{title}</h1>
        {subtitle ? <p className="mt-2 text-sm text-muted">{subtitle}</p> : null}
        <div className="mt-6">{children}</div>
      </div>
      {footer ? <div className="mt-6 text-sm text-muted">{footer}</div> : null}
    </main>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mb-4 rounded-[var(--radius-control)] bg-[#fbe9e5] px-3 py-2 text-sm text-danger">
      {message}
    </p>
  );
}

export function Field({ label, name, type = "text", autoComplete, defaultValue, required = true, hint }: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  defaultValue?: string;
  required?: boolean;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium">
      {label}
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        required={required}
        className="h-11 rounded-[var(--radius-control)] border border-line-strong bg-surface px-3 text-[15px] font-normal outline-none focus:border-accent"
      />
      {hint ? <span className="text-xs font-normal text-muted">{hint}</span> : null}
    </label>
  );
}

export function SubmitButton({ children }: { children: ReactNode }) {
  return (
    <button type="submit" className="h-11 w-full rounded-[var(--radius-control)] bg-ink font-medium text-white hover:bg-black">
      {children}
    </button>
  );
}
