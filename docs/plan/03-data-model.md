# 03 · Data model (PostgreSQL / Supabase)

> **Superseded by the actual schema** in `supabase/migrations/`. This was the pre-implementation proposal. The implemented schema covers the same concepts with different names: `color_tokens`, `type_families` and `type_styles`, `strategy_fields` (brand facts), `versions` (snapshots), `ai_proposals` (change sets), and `subscriptions` with plans held in `packages/entitlements`.

Proposed schema. All tables have `id uuid pk default gen_random_uuid()`, `created_at`, `updated_at`. Tenant-owned rows carry `workspace_id` (denormalised) so RLS policies are simple: *user is a member of `workspace_id` with sufficient role*. Phases are marked P1–P4.

```sql
-- ── Identity & tenancy (P1) ──────────────────────────────────────────────
profiles(id = auth.users.id, full_name, avatar_url, default_workspace_id)
workspaces(name, slug unique, owner_id → profiles, plan_id → plans)
workspace_members(workspace_id, user_id, role enum('owner','admin','editor','viewer'),
                  unique(workspace_id,user_id))
workspace_invites(workspace_id, email, role, token_hash, expires_at, accepted_at)   -- P3

-- ── Brands (P1) ─────────────────────────────────────────────────────────
brands(workspace_id, name, description, website_url,
       status enum('draft','published','archived'),   -- derived badge for dashboard
       cover_asset_id, primary_logo_asset_id,
       theme jsonb,                                     -- presentation theme id + params
       archived_at, deleted_at)                         -- soft delete, purge job later

-- ── Brand Core tokens (P1) ──────────────────────────────────────────────
color_groups(brand_id, workspace_id, name, role enum('primary','secondary','supporting','custom'), position)
colors(brand_id, workspace_id, group_id, name, hex char(7) check (hex ~ '^#[0-9A-F]{6}$'),
       cmyk_override int[4] null, pantone text null, notes, position)
       -- RGB derived from hex; CMYK = override ?? computed approximation (flagged in UI)

font_families(brand_id, workspace_id, name, source enum('upload','google','system'),
              role enum('primary','secondary','accent','custom'),
              allow_web_render bool default true, allow_download bool default false,
              license_note text)
font_files(family_id, workspace_id, storage_path, weight int, style enum('normal','italic'),
           format, variable_axes jsonb null)
text_styles(brand_id, workspace_id, name ('Display','H1','Body'…), family_id,
            weight, size_px, line_height, letter_spacing, case_transform, position)

-- ── Guide document (P1) ─────────────────────────────────────────────────
sections(brand_id, workspace_id, parent_id null → sections,   -- nesting (UI caps depth at 3)
         title, slug, kind text null,                         -- e.g. 'colour-system' (hint for AI mapping)
         hidden bool, position text,                          -- fractional index
         revision int default 0)
blocks(section_id, workspace_id, brand_id, parent_block_id null → blocks,  -- columns/grid children
       type text,                 -- registry key: 'text','image','palette','type-specimen'…
       props jsonb,               -- validated by registry Zod schema; token refs as {"$ref":"color:<id>"}
       layout jsonb,              -- width, alignment, background, spacing preset
       position text, revision int default 0,
       origin enum('human','ai','template') default 'human',
       human_edited_at timestamptz null)

templates(slug, name, description, is_system bool, workspace_id null, definition jsonb)  -- sections+blocks seed

-- ── Assets (P1) ─────────────────────────────────────────────────────────
asset_folders(brand_id, workspace_id, name, category enum('logos','fonts','illustrations',
              'patterns','icons','photography','video','mockups','other'), position)
assets(brand_id, workspace_id, folder_id, storage_path, filename, mime, bytes,
       width, height, duration_s, checksum_sha256, alt_text,
       client_downloadable bool default false,    -- designer-controlled
       variants jsonb)                            -- e.g. logo: svg/png/pdf siblings

-- ── Publishing (P1) ─────────────────────────────────────────────────────
guide_versions(brand_id, workspace_id, number int, note text, published_by,
               snapshot jsonb,           -- resolved sections, blocks, tokens, theme, asset manifest
               unique(brand_id, number))
publications(brand_id unique, workspace_id, slug unique, current_version_id → guide_versions,
             access enum('public','password','unpublished'), password_hash,
             custom_domain null,         -- P4
             allow_comments bool)        -- P3
preview_tokens(brand_id, token_hash, expires_at)

-- ── AI (P2) ─────────────────────────────────────────────────────────────
ai_threads(brand_id, workspace_id, kind enum('discovery','section','general'), title,
           summary text, summary_upto_message_id)
ai_messages(thread_id, workspace_id, role, content jsonb, tool_calls jsonb,
            provider, model, input_tokens, output_tokens)
brand_facts(brand_id, workspace_id, key text,  -- 'positioning','mission','audience.primary'…
            value jsonb, status enum('proposed','approved','rejected'),
            source_message_id null, approved_by, approved_at)
ai_change_sets(brand_id, workspace_id, thread_id, status enum('pending','applied','discarded','partial'))
ai_change_items(change_set_id, op enum('create_section','create_block','update_block','update_fact'),
                target_id null, payload jsonb, before jsonb null,
                status enum('pending','accepted','rejected'), conflict text null)

-- ── Feedback (P3) ───────────────────────────────────────────────────────
reviewers(publication_id, name, email, token_hash)          -- lightweight client identity
comments(brand_id, workspace_id, version_id, section_id, block_id null,
         author_user_id null, reviewer_id null, body, parent_id null,
         kind enum('comment','revision_request'), status enum('open','resolved'))

-- ── Billing & entitlements (P1 config, P4 payments) ─────────────────────
plans(slug unique, name, is_public, sort)
plan_prices(plan_id, currency, interval enum('month','year'), amount_minor bigint,
            provider, provider_plan_code)
plan_entitlements(plan_id, key text, value jsonb)  -- 'brands.max':3, 'ai.messages.monthly':200, 'feature.password':true
subscriptions(workspace_id, plan_id, status, provider, provider_customer_id,
              provider_subscription_code, current_period_end, cancel_at_period_end)
usage_counters(workspace_id, metric, period_start, value bigint, unique(workspace_id,metric,period_start))
billing_events(provider, event_id unique, payload jsonb, processed_at)   -- idempotent webhooks

-- ── Business (P4) ───────────────────────────────────────────────────────
clients(workspace_id, name, email, company, address)
invoices(workspace_id, client_id, brand_id null, number, currency, items jsonb,
         subtotal_minor, tax_minor, total_minor, status, issued_at, due_at)
brand_transfers(brand_id, from_workspace_id, to_email, token_hash, status, accepted_at)
```

## Snapshot shape (`guide_versions.snapshot`)

```jsonc
{
  "schemaVersion": 1,
  "brand": { "name": "Ọ̀ṣun Kitchen", "description": "…" },
  "theme": { "id": "standard", "params": { "navStyle": "sidebar", "heroStyle": "colorField" } },
  "tokens": {
    "colors": [{ "id": "c1", "name": "Palm Oil", "hex": "#E2711D", "rgb": [226,113,29], "cmyk": [0,58,92,0], "cmykSource": "override", "group": "Primary" }],
    "textStyles": [{ "id": "t1", "name": "Display", "family": "f1", "weight": 700, "size": 72 }],
    "fonts": [{ "id": "f1", "name": "Fraunces", "files": [{ "assetKey": "font:…", "weight": 700 }] }]
  },
  "sections": [{ "id": "s1", "title": "Colour", "slug": "colour", "children": [...],
                 "blocks": [{ "id": "b1", "type": "palette", "props": { "colors": ["c1"] } }] }],
  "assets": { "a1": { "path": "…", "filename": "logo-primary.svg", "downloadable": true } }
}
```

Snapshots embed *resolved* token values, so later draft edits cannot alter a published guide. Asset files are content-addressed (checksum in path) so replacing a draft asset uploads a new object and doesn't mutate the published one.
