# Stella

Build, present and publish brand guidelines: a block-based editor, a brand
system of colour and type tokens, an AI strategy assistant (Phase 2), and
published guides clients can browse, comment on and download from.

Product and technical plan: [docs/plan](docs/plan) (research, plan, original data-model proposal).
Progress: [docs/PROGRESS.md](docs/PROGRESS.md).

## How it fits together

```
apps/web                 Next.js app (designer app now; published guides at /g/<slug>)
packages/brand-schema    Types, block registry, colour maths, templates, publish snapshots
packages/entitlements    Plans, prices and limits as config; can() / checkLimit()
supabase/migrations      Postgres schema, row-level security, save and publish functions
supabase/tests           Database tests run against a throwaway Postgres
```

Key rules:

- **One brand record.** The editor, published guide, downloads and AI all read the
  same structured data. Blocks reference colour tokens, type styles and strategy
  fields by id, so editing a colour updates it everywhere.
- **Drafts and published versions are separate.** Publishing freezes the draft into
  an immutable snapshot (`versions.snapshot`). The live link only ever reads snapshots.
- **Safe autosave.** The editor saves batches through `apply_draft_ops`, which applies
  them atomically and refuses a save made from an out-of-date revision (another tab
  or teammate), instead of silently overwriting.
- **Plans are config.** No component checks a plan name or price; ask `can()` /
  `checkLimit()` from `@stella/entitlements`.

## Develop

Requirements: Node 22+, pnpm 10, Postgres 15+ binaries for database tests.

```bash
pnpm install
pnpm test        # unit tests
pnpm test:db     # migrations + database tests on a throwaway Postgres
pnpm typecheck
pnpm dev         # http://localhost:3000
```

To run against Supabase, create a project, apply `supabase/migrations` (Supabase CLI:
`supabase link` then `supabase db push`), and copy `.env.example` to
`apps/web/.env.local` with your project's URL and keys. Keys stay in env files and
hosting settings, never in code.
