# 02 · Product & technical plan

> **Product name: Stella.** This plan was written before the existing Stela Brands codebase was found. Stella is built on that code (see the repo README). Where this document differs from `supabase/migrations` or `packages/`, the code is the source of truth. Table names in particular differ; see [03-data-model.md](03-data-model.md).
> Status: **proposal awaiting approval**. Nothing below is implemented yet.

## 0. Repository inspection (Step 2)

The working directory is **empty** — no repo, framework, database, dependencies or design system exist. This is a greenfield build, so nothing is at risk of being overwritten.
Environment facts relevant to stack choice: Node 22, pnpm, Postgres client available; **Supabase and Vercel connectors are attached** to this workspace, which makes them the lowest-friction infrastructure choice.

---

## 1. Product architecture

The product is one **structured brand document** with many interfaces.

```
                    ┌──────────────────────────── BRAND (structured data) ────────────────────────────┐
                    │  Brand Core            Guide document           Asset library     Strategy memory │
                    │  colours · type styles  sections → blocks        files · groups    facts · briefs  │
                    │  logos · voice tokens   (reference Core by id)   client-visible?   conversations   │
                    └────────┬──────────────────────┬───────────────────────┬────────────────┬─────────┘
                             │                      │                       │                │
     Editor (designer) ──────┤      Renderer (shared, pure) ─── Published site (humans)       │
     Strategist AI ──────────┤                      │      ├── Present mode                   │
     Feedback inbox ─────────┤                      │      └── brand.md / brand.json / MCP (agents)
                             └── Publish = immutable snapshot ──────────────────────────────────┘
```

Key ideas:
1. **Brand Core** — colours, type styles, logos and voice are *tokens*. Blocks reference tokens by id, never copy values. Edit a colour once → every palette, specimen, combination and published preview updates. (Satisfies "no inconsistent colour values".)
2. **Guide document** — an ordered tree of sections (unlimited user-created; templates are just seed data) containing typed blocks. A **block registry** defines each block type once: schema, defaults, editor UI, renderer, and `toMarkdown()` for AI/export. Adding a new block type = one registry entry; nothing else is hardcoded.
3. **Shared renderer** — the same React components render the editor canvas, the preview, the published site and present mode. What you see while editing *is* the published output.
4. **Snapshots** — publishing freezes the resolved document (sections + blocks + resolved tokens + asset manifest) into an immutable version row. Draft edits never touch it. Rollback = republish an older snapshot.
5. **Strategy memory** — the AI's long-term memory is not chat history; it's a set of **brand facts** (positioning, audience, values…) each with status `proposed | approved`, plus conversation summaries. Every AI request is built from this, so new chats don't start from zero.

## 2. Application sitemap

**Marketing (public)** `/` · `/pricing` · `/login` · `/signup` · `/reset`

**App (authenticated)**
| Route | Screen |
|---|---|
| `/app` | Dashboard — brands grid, filters: Draft / Published / Archived |
| `/app/new` | New brand flow (name → how to begin → inputs → template) |
| `/app/b/[brand]` | Brand home → redirects to editor |
| `/app/b/[brand]/edit/[section?]` | **Editor** (outline · canvas · inspector) |
| `/app/b/[brand]/core` | Brand Core: colours, typography, logos |
| `/app/b/[brand]/assets` | Asset library |
| `/app/b/[brand]/strategist` | AI Strategist (full screen; also available as editor drawer) |
| `/app/b/[brand]/feedback` | Client comments & revision requests |
| `/app/b/[brand]/publish` | Publish settings, versions, access, domain |
| `/app/settings/profile` · `/workspace` · `/members` · `/billing` | Account & workspace |

**Published (public / protected)**
| Route | Purpose |
|---|---|
| `/g/[slug]` and `/g/[slug]/[section]` | Published guide |
| `/g/[slug]/unlock` | Password gate |
| `/g/[slug]/present` | Presentation mode (keyboard-driven slides from sections) |
| `/g/[slug]/brand.md`, `/brand.json` | Agent-readable guide (respecting access) |
| `/g/[slug]/download/[asset]`, `/download.zip?group=` | Approved asset downloads |
| `/preview/[token]` | Draft preview (unguessable, expiring) |
| *(Phase 4)* custom domains → middleware rewrite to `/g/[slug]` |

## 3. Core user journeys

**J1 · First guide in one sitting (Phase 1)**
Sign up → "New brand" → name + one line → *How do you want to begin?* [Start from template · Start blank · Start with discovery (AI, Phase 2)] → drop logo / paste website (optional) → colours extracted from the logo shown as suggestions → pick template → land in editor with sections pre-filled with structure + guidance placeholders → edit → Preview → Publish → copy link.

**J2 · Strategy to guide (Phase 2)** — the restaurant scenario
Open Strategist → guided discovery (business, market, audience, objectives, competition, personality, positioning, values, perception, visual direction) with follow-ups → Strategist maintains a live **Brand Brief** panel of proposed facts → designer approves/edits facts → "Populate the guide" → **Change review** screen lists every create/modify per section with diffs; existing human-edited content is flagged, never silently overwritten → accept all / per item → content lands as normal editable blocks.

**J3 · Client review loop (Phase 1 publish → Phase 3 comments)**
Designer shares link (optionally password) → client reads, downloads approved assets, comments on a section or requests a revision → designer's Feedback inbox (by section, status open/resolved) → edits draft (published untouched) → republish with a note → client sees "Updated" stamp.

**J4 · Present to client** — `/present`: full-screen, one section per slide, arrow keys, presenter can jump via outline.

**J5 · Handover (Phase 4)** — transfer brand ownership to client's account, including assets and published URL.

## 4. Data model

Full schema in [`03-data-model.md`](03-data-model.md). Summary of entities:

`profiles` · `workspaces` · `workspace_members(role)` · `brands` · `brand_tokens`: `colors`, `color_groups`, `font_families`, `font_files`, `text_styles` · `sections(parent_id, position)` · `blocks(section_id, parent_block_id, type, props jsonb, position)` · `assets`, `asset_folders` · `guide_versions(snapshot jsonb)` · `publications(slug, access, password_hash, current_version_id)` · `preview_tokens` · `ai_threads`, `ai_messages`, `brand_facts`, `ai_change_sets`, `ai_change_items` · `comments`, `revision_requests` · `plans`, `plan_entitlements`, `subscriptions`, `usage_counters` · `invoices` (Phase 4).

Design choices:
- **Normalised rows for sections/blocks** (not one giant JSON doc): granular autosave, comments and AI changes anchor to stable ids, Postgres RLS works per row.
- **Block props in `jsonb`, validated by Zod** schemas from the block registry on every write (server-side).
- **Token references** inside props are `{ "$ref": "color:<uuid>" }`; the renderer resolves them. Deleting a referenced colour is blocked or prompts reassignment.
- **Ordering** via fractional index strings (`position`), so moving one item writes one row.
- **Snapshots** store *resolved* data so a published guide never changes when tokens are later edited in draft.

## 5. Component architecture

Single Next.js app, organised by domain module, with hard boundaries:

```
src/
  app/                      # routes only (thin)
    (marketing)/ (auth)/ app/ g/[slug]/ api/
  modules/
    core-tokens/            # colours, type styles, logos — model, actions, UI
    guide/                  # sections tree, blocks, ordering, autosave
    blocks/                 # REGISTRY: one folder per block type
      text/  heading/  image/  gallery/  video/  palette/  type-specimen/
      color-combos/  dos-donts/  file-download/  columns/  embed/
        └─ schema.ts  defaults.ts  Editor.tsx  Render.tsx  toMarkdown.ts
    templates/              # templates as JSON seed data + importer
    assets/                 # upload, storage, signed URLs, zip
    publishing/             # snapshot builder, versions, access, md/json export
    ai/                     # provider abstraction, context builder, tools, change sets
    feedback/               # comments, revision requests
    billing/                # plans, entitlements, usage, Paystack adapter
    workspace/              # members, roles, invites
  renderer/                 # PURE presentational components; no data fetching, no editor deps
    themes/                 # presentation themes (tokens + layout archetype)
  ui/                       # design-system primitives (Button, Field, Popover, Sheet…)
  lib/                      # supabase clients, zod helpers, errors, logging
```

Rules: `renderer/` cannot import from `modules/*/Editor` or Supabase; published routes import only `renderer/` + `publishing/`. That makes "editor separate from published guide" structural, not aspirational.

## 6. Technical decisions (recommendations)

| Concern | Recommendation | Why |
|---|---|---|
| Framework | **Next.js (App Router) + TypeScript** | SSR/ISR for fast published guides, server actions for secure mutations, one codebase. |
| Hosting | **Vercel** | Connector attached; edge caching + on-demand revalidation on publish. |
| DB / Auth / Storage | **Supabase** (Postgres + Auth + Storage + RLS) | Connector attached; row-level security for multi-tenant; private buckets + signed URLs. |
| Validation | **Zod** everywhere (forms, actions, block props, AI tool output) | One schema language end-to-end. |
| UI | **Own design system** on **Radix primitives** + Tailwind CSS (tokens as CSS vars) | Accessible primitives, but a distinct visual identity — no stock component look. |
| Rich text | **Tiptap** (ProseMirror) storing JSON | Structured, safe, renders without HTML injection; easy `toMarkdown`. |
| Drag & drop | **dnd-kit** | Nested sortable trees, keyboard accessible. |
| Client state | **Zustand** store + debounced, queued **autosave** with per-row `revision` for conflict detection | Reliable autosave; survives refresh; detects stale writes. |
| Colour | `culori` for conversions; client-side palette extraction (k-means on downsampled canvas) | No server cost; CMYK shown as *computed approx.* unless designer enters print values (naive RGB→CMYK is not print-accurate — designers must be able to override). |
| Fonts | Private storage, served to published guides via short-lived signed URLs; per-font `allow_web_render` / `allow_download` flags; Google Fonts option | Respects licensing — desktop licences often don't permit web embedding or redistribution. |
| Images/video | Supabase Storage + image transformation for responsive sizes; video size caps in Phase 1, dedicated video service (e.g. Mux) evaluated later | Cost control. |
| AI | **Vercel AI SDK** provider layer: OpenAI default, Anthropic pluggable via config; all calls server-side | Provider independence + streaming + typed tool calls. |
| Payments | **Paystack** adapter behind a `BillingProvider` interface; Stripe adapter possible later | NGN cards/bank/USSD; international later. |
| Testing | **Vitest** (domain logic, schemas, snapshot builder, entitlements) + **Playwright** (acceptance criteria end-to-end) | Acceptance list in the brief maps 1:1 to e2e tests. |

**Entitlements system.** Plans live in the DB (`plans`, `plan_entitlements` with keys like `brands.max`, `storage.bytes`, `ai.messages.monthly`, `feature.custom_domain`, `feature.password`, `seats.max`). One server function `getEntitlements(workspaceId)` + `assertEntitled(key)` used by actions; the UI reads the same object for upgrade prompts. Prices in a `plan_prices` table (currency, interval, provider plan code). Nothing is hardcoded in components.

**Permissions.** Workspace roles: `owner`, `admin`, `editor`, `viewer`. Enforced twice: Postgres RLS (data can't leak even with a bug) + server-action checks (good error messages). Client reviewers are *not* workspace members: they access a publication via link (+ password) and identify by name/email to comment (Phase 3).

**Machine-readable guide (proposed promotion to Phase 1).** Because every block implements `toMarkdown()`, `/g/[slug]/brand.md` and `brand.json` are nearly free. Shipping them in Phase 1 puts us level with both references on "AI-ready" from day one. An MCP server endpoint follows in Phase 2.

**Presentation themes (Module E) without risk.** A theme is data: `{ typeScale, fontPairing roles, spacing, navStyle: sidebar|top|index, heroStyle: colorField|image|typographic, sectionOpener, cornerRadius, motion }`. Phase 1 ships one excellent **Standard** theme + 2 variants; Phase 3 adds Editorial / Expressive / Minimal-tech / Institutional and lets AI *recommend* a theme + parameters from the brand brief — never generate free-form layouts.

## 7. Roadmap & dependencies

```
P1.0 Foundation ─► P1.1 Dashboard/Brands ─► P1.2 Brand Core ─┐
   (scaffold, design      (create/dup/archive/    (colours, type,  │
    system, schema,        delete, new-brand flow)  logos)          ├─► P1.5 Blocks ─► P1.6 Templates ─► P1.7 Publish
    auth, RLS, CI)                              P1.3 Assets ───────┤                                  (snapshot, public
                                                P1.4 Outline editor┘                                   site, password,
                                                 (sections, dnd, autosave)                             downloads, brand.md)
Phase 2 (AI) needs: P1.2 + P1.5 (block registry toMarkdown) + entitlements usage counters
Phase 3 (comments/present/themes) needs: P1.7 snapshots + renderer
Phase 4 (billing/handover/domains) needs: entitlements (built in P1.0 as config, enforced loosely until payments land)
```

**Phase 1 — Functional MVP** (ordered): foundation → auth → dashboard → brand creation → Brand Core (colours incl. extraction, typography incl. font upload) → asset library → outline editor with dnd → blocks (text, heading, image, gallery, video, file, palette, type specimen, colour combinations, do/don't, columns, callout) → templates (Full brand book · Essentials · Blank) → autosave hardening → live preview → publish with snapshots, password, versions list → public site → client downloads (single + zip) → brand.md/json.
**Phase 2 — AI**: provider layer, Strategist discovery, brand facts memory, Brief panel, populate-guide change sets with review, per-block "Improve/Write" assistant, asset analysis (logo colour/style read), usage limits, MCP endpoint.
**Phase 3 — Collaboration & presentation**: section comments, revision requests, feedback inbox, present mode, version compare/rollback, team members & roles UI, presentation themes, per-breakpoint tuning.
**Phase 4 — Business**: Paystack subscriptions, upgrade/downgrade, invoicing, handover, custom domains, PDF export, agency (multi-client) management, Anthropic provider switch.

## 8. Quality bar

Every acceptance criterion in the brief becomes a Playwright test, e.g.: create section → reload → exists; reorder → reload → order persists; upload image → public URL renders; edit colour → all referencing blocks show new value; publish → public link 200; edit draft → public unchanged until republish; download → byte-identical file. Features not finished are labelled "Not yet available" in UI — never fake buttons. Progress tracked in [`CHECKLIST.md`](CHECKLIST.md).

## 9. Risks

| Risk | Mitigation |
|---|---|
| **AI cost vs ₦10k price** — model costs are USD, revenue NGN; heavy discovery chats are expensive | Hard monthly caps per plan in `usage_counters`; rolling summaries keep context small; cheaper model for summarisation; configurable without deploys. |
| **FX / pricing volatility** | Prices in DB per currency; can reprice without code. |
| **Editor complexity creep** (becoming a website builder) | Blocks are brand-specific (palette, specimen, do/don't, clear-space) rather than generic; layout options are constrained presets, not free positioning. |
| **Autosave data loss / conflicts** | Debounced queue, retry with backoff, `revision` checks, "unsaved" indicator, beforeunload guard; e2e tests with forced reloads. Real-time multi-user co-editing (Phase 3) may require moving the text layer to CRDT (Yjs) — the row-based model is chosen to allow that migration. |
| **Font licensing** | Per-font rights flags; downloads off by default; fonts served via signed URLs only. |
| **Storage/video costs** | Plan storage caps; video size limits; consider external video hosting later. |
| **Paystack subscription limitations** (plan changes / proration handling) | Isolate behind `BillingProvider`; verify Paystack's subscription-change behaviour during Phase 4 spike before promising proration. |
| **AI overwriting designer work** | AI never writes directly; always via `ai_change_sets` reviewed by the designer; blocks track `edited_by_human_at`. |

## 10. Decisions needing your approval

1. **Stack**: Next.js + Supabase + Vercel + Tailwind/Radix (as above).
2. **Supabase project**: may I create a new project in your Supabase org for development (free tier), or do you have one to use?
3. **Git hosting**: there is no repository yet. Which GitHub repo should I push to (create new, e.g. `<you>/stella`)?
4. **Name**: "Stella" is a codename. Do you have a product name?
5. **Free/starter plan**: I recommend a Free tier (1 brand, published with badge, no AI or a tiny AI trial) — both competitors use one and it lowers acquisition friction.
6. **Promote brand.md/json export to Phase 1** (small effort, strong positioning).
7. **Pricing currency**: NGN only at launch, with USD prices added when international payments arrive?
