import Link from "next/link";
import type { Metadata } from "next";
import { TEMPLATES } from "@stella/brand-schema";
import { FormError } from "@/components/auth-shell";
import { createBrand } from "../actions";

export const metadata: Metadata = { title: "New brand" };

const ORDER = ["complete", "essentials", "blank"];

export default async function NewBrandPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const templates = ORDER.map((k) => TEMPLATES[k]!).filter(Boolean);
  const inputClass =
    "h-11 rounded-[var(--radius-control)] border border-line-strong bg-surface px-3 text-[15px] font-normal outline-none focus:border-accent";

  return (
    <main className="mx-auto max-w-[1100px] px-6 py-12 md:px-8">
      <form action={createBrand} className="flex flex-wrap gap-12">
        <section className="flex min-w-[300px] flex-1 flex-col gap-5">
          <div className="flex flex-col gap-2">
            <span className="text-xs uppercase tracking-[0.08em] text-muted">New brand</span>
            <h1 className="font-[family-name:var(--font-display)] text-5xl leading-none">Start a brand</h1>
          </div>
          <FormError message={error} />
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Brand name
            <input name="name" required maxLength={120} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Short description <span className="font-normal text-muted">Optional</span>
            <textarea
              name="description"
              rows={3}
              maxLength={500}
              className="rounded-[var(--radius-control)] border border-line-strong bg-surface px-3 py-2.5 text-[15px] font-normal outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Website <span className="font-normal text-muted">Optional</span>
            <input name="websiteUrl" type="text" inputMode="url" placeholder="example.com" className={inputClass} />
          </label>
          <p className="text-sm text-muted">You'll add the logo, colours and fonts inside the brand.</p>
        </section>

        <section aria-labelledby="start-heading" className="flex min-w-[300px] flex-1 flex-col gap-4">
          <h2 id="start-heading" className="text-lg font-semibold md:pt-[68px]">
            How do you want to begin?
          </h2>
          <fieldset className="flex flex-col gap-3">
            <legend className="sr-only">Starting point</legend>
            {templates.map((t, i) => (
              <label
                key={t.key}
                className="flex cursor-pointer items-start gap-3.5 rounded-[var(--radius-card)] border border-line bg-surface p-4 has-[:checked]:border-2 has-[:checked]:border-ink"
              >
                <input type="radio" name="template" value={t.key} defaultChecked={i === 0} className="mt-1" />
                <span className="flex flex-col gap-1">
                  <strong className="text-[15px]">{t.name}</strong>
                  <span className="text-[13px] leading-relaxed text-muted">{t.description}</span>
                </span>
              </label>
            ))}
            <div className="flex items-start gap-3.5 rounded-[var(--radius-card)] border border-dashed border-line-strong p-4 opacity-70">
              <span className="flex flex-col gap-1">
                <strong className="text-[15px]">Brand discovery with the assistant</strong>
                <span className="text-[13px] text-muted">Arrives in Phase 2.</span>
              </span>
            </div>
          </fieldset>
          <div className="mt-2 flex justify-end gap-3">
            <Link href="/dashboard" className="rounded-[var(--radius-control)] border border-line bg-surface px-4 py-2.5 text-ink no-underline">
              Cancel
            </Link>
            <button type="submit" className="rounded-[var(--radius-control)] bg-ink px-5 py-2.5 font-medium text-white hover:bg-black">
              Create brand
            </button>
          </div>
        </section>
      </form>
    </main>
  );
}
