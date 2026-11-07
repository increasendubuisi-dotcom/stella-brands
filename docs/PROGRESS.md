# Progress

> Stella continues the Stela Brands codebase (10 commits, built 7 Nov 2026). Stella's Supabase project is **Stella-brands** (`sxaebtlbjdqidxcgtxoc`, eu-central-1), with all five migrations applied on 7 Nov 2026. Older notes below that mention the stela-brands project or stela-brands.vercel.app refer to the previous deployment.

## Live check against Stella-brands (7 Nov 2026)

A local app pointed at the live project was driven in a real browser. Everything below **passed**:

- Sign-in. New-brand provisioning (profile, studio and Starter plan) was checked in SQL.
- Creating a brand from a template. Typing persists after reload, and dragging a block persists (order confirmed in the database).
- Publishing (version 1), then opening the public link signed out.
- A draft edit does not change the live guide until republished. Republishing (version 2) updates the live guide.
- brand.md and brand.json serve the published version, with no storage paths.
- Uploading a logo. Duplicating a brand copies its content and files into the copy's own storage folder, and edits to the copy leave the original untouched.
- The Starter plan's 2-brand limit blocks a third brand with a clear message. Archive followed by delete permanently works.

**Not yet checked live:** client file downloads. These need `SUPABASE_SERVICE_ROLE_KEY`, which only the project owner can provide.

**Local development behind a proxy:** run `NODE_USE_ENV_PROXY=1 pnpm dev`. Otherwise Node's fetch ignores `HTTPS_PROXY` and sign-in fails with a misleading "email and password don't match" message.


Status key: Not started · In progress · Completed · Tested · Blocked

## Phase 1 — Functional MVP

| # | Feature | Status | Notes |
| --- | --- | --- | --- |
| 1 | Repo, CI, schema + RLS | Tested | 60 database tests, 37 unit tests. Applied to Supabase project stela-brands (London); live smoke test passed. |
| 2 | Authentication and profiles | Completed | Sign-up with email confirmation, sign-in, sign-out, protected routes; signup creates profile, studio and Starter plan. Live at stela-brands.vercel.app. |
| 3 | Dashboard | Tested | Brands by status (all, drafts, published, archived); archive, restore, delete with confirmation; duplicate copies structure, blocks, colours, type, strategy and files with every reference remapped (7 unit + 10 database tests). File copy verified against live Supabase Storage. |
| 4 | New brand flow | In progress | Name, description, website, template; plan limit enforced. Logo/asset upload and colour extraction not built yet. |
| 5 | Templates as data | Tested | Complete, Essentials, Blank applied through apply_draft_ops in database tests and from the app. |
| 6 | Block registry | Completed | Editing built for all block types except Grid (container layouts come later). |
| 7 | Section editor | Completed | Add, nest (4 levels), rename, hide, duplicate (with blocks and subsections), delete. |
| 8 | Drag and drop | Tested | Sections reorder by drag within their level. Blocks drag within a section and into other sections on the page, by mouse or keyboard (Space, arrows, Space; Esc cancels); up/down buttons kept. A grid holding blocks stays in its section. 3 model tests; mouse, keyboard and cancel checked in a real browser against the real canvas. Fixed a hydration mismatch in both drag areas. |
| 9 | Asset uploads | Completed | Browser uploads to private storage, library with categories, client-download flag. Deleting keeps the stored file (live versions may use it); orphan cleanup later. |
| 10 | Colour tokens | Completed | Add, edit, group, reorder, delete (cleans blocks), HEX/RGB/CMYK with overrides, Pantone, copy values, extraction from an image in the browser, WCAG contrast on combinations. |
| 11 | Typography | Completed | Google, system and uploaded font files (weight/style read from file names, licence flag gates downloads). |
| 12 | Autosave with conflict detection | Tested | Merged batches, one save in flight, retry when offline, stops on conflict; editing session replayed through the database in tests. |
| 13 | Live preview | Completed | /preview renders the draft through the same renderer as the live guide. |
| 14 | Publish, history, rollback, unpublish | Completed | Publish panel with notes, version history, restore, access settings; plan limit on live guides. |
| 15 | Published guide, password | Completed | /g/<slug>, password unlock (httpOnly cookie, checked by the database each visit). Files need SUPABASE_SERVICE_ROLE_KEY in Vercel. |
| 16 | Client downloads | Completed | Single files via short-lived signed links; Download all zips in the browser. Needs SUPABASE_SERVICE_ROLE_KEY. |
| 16a | brand.md / brand.json for AI tools | Tested | Built from the live snapshot only, same access rules as the guide; only downloadable files are linked; storage paths never exposed; computed CMYK marked approximate. 13 unit tests. Linked from the guide footer. |
| 17 | Entitlements | Tested | Plans in config with brief's NGN prices; limits and annual prices are proposals. |

## Phase 2 — AI brand strategy assistant

| # | Feature | Status | Notes |
| --- | --- | --- | --- |
| 18 | AI data: conversations, messages, project memory, proposals, monthly usage | Tested | Per-brand access like the guide; usage only increases, through a function; 10 database tests. Applied to Supabase. |
| 19 | Provider layer | Completed | OpenAI through the AI SDK behind one module (`ai/provider.ts`); model set by `AI_MODEL` (default gpt-6-luna). Key is server-only. |
| 20 | Brand context and prompts | Tested | Strategy, sections with ids, colours, type and memory, capped in length. |
| 21 | Discovery chat | Completed | Streams replies; saved after streaming; memory refreshed every few messages. Needs OPENAI_API_KEY. |
| 22 | Populate the guide | Tested | Structured suggestions; item-by-item review; replacements start unticked; text is added as new blocks, never over existing ones; strategy marked as AI-written. |
| 23 | Improve with AI | Completed | Text and strategy blocks: improve, shorter, warmer, bolder; shows the rewrite, applies only on "Use this". |
| 24 | Usage limits | Completed | Monthly tokens from the plan (Starter 20k, AI 2M, Studio 5M); Basic has none. |

## Decisions awaiting approval

- Starter gets a small AI allowance (20k tokens a month) as a taste; Basic gets none, per the brief.
- Starter (free) tier limits, annual prices (10 × monthly) and per-plan limits in `packages/entitlements/src/plans.ts`.
