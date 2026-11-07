-- Stella — core schema (Phase 1)
--
-- Every brand-scoped row carries brand_id, and child rows use composite
-- foreign keys (child_id, brand_id) so a block can never point at another
-- brand's section, a font file at another brand's asset, and so on.
-- Access is enforced with row-level security via can_view_brand / can_edit_brand.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.workspace_role as enum ('owner', 'admin', 'editor', 'viewer');
create type public.guide_visibility as enum ('public', 'password', 'unpublished');
create type public.color_group as enum ('primary', 'secondary', 'supporting');
create type public.type_role as enum ('primary', 'secondary', 'other');
create type public.font_source as enum ('upload', 'google', 'system');
create type public.asset_category as enum ('logo', 'font', 'illustration', 'pattern', 'icon', 'photography', 'video', 'mockup', 'other');
create type public.strategy_status as enum ('draft', 'approved');
create type public.content_origin as enum ('manual', 'ai');

-- ---------------------------------------------------------------------------
-- Shared trigger: updated_at
-- ---------------------------------------------------------------------------

create function public.set_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Accounts and workspaces
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 120),
  studio_name text check (char_length(studio_name) <= 120),
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.workspace_role not null default 'editor',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members (user_id);

-- Written only by the server (service role) from payment webhooks.
create table public.subscriptions (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  plan_key text not null default 'starter',
  status text not null default 'active' check (status in ('trialing', 'active', 'past_due', 'canceled')),
  billing_interval text check (billing_interval in ('monthly', 'annual')),
  currency text not null default 'NGN',
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  current_period_end timestamptz,
  limit_overrides jsonb not null default '{}' check (jsonb_typeof(limit_overrides) = 'object'),
  feature_overrides jsonb not null default '{}' check (jsonb_typeof(feature_overrides) = 'object'),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Brands
-- ---------------------------------------------------------------------------

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$'),
  description text check (char_length(description) <= 500),
  website_url text check (website_url is null or website_url ~* '^https?://'),
  theme_key text not null default 'standard',
  theme_overrides jsonb not null default '{}' check (jsonb_typeof(theme_overrides) = 'object'),
  nav_config jsonb not null default '{}' check (jsonb_typeof(nav_config) = 'object'),
  visibility public.guide_visibility not null default 'unpublished',
  current_version_id uuid,
  -- Increments on every draft change; autosave sends the rev it last saw.
  draft_rev bigint not null default 0,
  archived_at timestamptz,
  status text generated always as (
    case
      when archived_at is not null then 'archived'
      when current_version_id is not null then 'published'
      else 'draft'
    end
  ) stored,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index brands_workspace_idx on public.brands (workspace_id);

-- Passwords live apart from brands so no client query can ever read the hash.
create table public.guide_access_secrets (
  brand_id uuid primary key references public.brands (id) on delete cascade,
  password_hash text not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Guide structure
-- ---------------------------------------------------------------------------

create table public.sections (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  parent_id uuid,
  title text not null check (char_length(title) between 1 and 120),
  slug text not null check (char_length(slug) between 1 and 140),
  position double precision not null,
  hidden boolean not null default false,
  template_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, brand_id),
  foreign key (parent_id, brand_id) references public.sections (id, brand_id) on delete cascade,
  check (parent_id is null or parent_id <> id)
);
create index sections_brand_parent_idx on public.sections (brand_id, parent_id, position);

create table public.blocks (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  section_id uuid not null,
  parent_block_id uuid,
  type text not null check (type in (
    'text', 'heading', 'image', 'video', 'gallery', 'file_download', 'palette',
    'color_combinations', 'type_specimen', 'type_family', 'strategy_field',
    'dos_donts', 'grid', 'divider'
  )),
  position double precision not null,
  props jsonb not null default '{}' check (jsonb_typeof(props) = 'object'),
  layout jsonb not null default '{"width": "wide", "span": 1}' check (jsonb_typeof(layout) = 'object'),
  origin public.content_origin not null default 'manual',
  schema_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, section_id),
  foreign key (section_id, brand_id) references public.sections (id, brand_id) on delete cascade,
  foreign key (parent_block_id, section_id) references public.blocks (id, section_id) on delete cascade,
  check (parent_block_id is null or parent_block_id <> id)
);
create index blocks_section_idx on public.blocks (section_id, parent_block_id, position);
create index blocks_brand_idx on public.blocks (brand_id);

-- ---------------------------------------------------------------------------
-- Brand system: colour, type, assets, strategy
-- ---------------------------------------------------------------------------

create table public.color_tokens (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  hex text not null check (hex ~ '^#[0-9A-F]{6}$'),
  cmyk_override jsonb check (
    cmyk_override is null or (
      jsonb_typeof(cmyk_override) = 'object'
      and (cmyk_override ?& array['c', 'm', 'y', 'k'])
    )
  ),
  pantone text check (char_length(pantone) <= 40),
  color_group public.color_group not null default 'primary',
  position double precision not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, name)
);
create index color_tokens_brand_idx on public.color_tokens (brand_id, position);

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  category public.asset_category not null default 'other',
  name text not null check (char_length(name) between 1 and 200),
  -- Object key in the private brand-assets bucket: <brand_id>/<asset_id>/<filename>
  storage_path text not null unique,
  mime text not null,
  size bigint not null check (size >= 0),
  width integer check (width > 0),
  height integer check (height > 0),
  client_visible boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, brand_id),
  check (split_part(storage_path, '/', 1) = brand_id::text)
);
create index assets_brand_idx on public.assets (brand_id, category);

create table public.type_families (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  source public.font_source not null default 'upload',
  role public.type_role not null default 'other',
  fallback text not null default 'sans-serif' check (char_length(fallback) <= 120),
  licence_note text check (char_length(licence_note) <= 500),
  downloadable boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, brand_id)
);

create table public.font_files (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  family_id uuid not null,
  weight integer not null check (weight between 100 and 900),
  style text not null default 'normal' check (style in ('normal', 'italic')),
  asset_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (family_id, brand_id) references public.type_families (id, brand_id) on delete cascade,
  foreign key (asset_id, brand_id) references public.assets (id, brand_id) on delete cascade,
  unique (family_id, weight, style)
);

create table public.type_styles (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  family_id uuid not null,
  weight integer not null check (weight between 100 and 900),
  size numeric(6, 2) not null check (size > 0 and size <= 400),
  line_height numeric(4, 2) not null check (line_height > 0 and line_height <= 4),
  tracking numeric(4, 3) not null default 0 check (tracking between -0.5 and 1),
  text_transform text not null default 'none' check (text_transform in ('none', 'uppercase')),
  position double precision not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, name),
  -- restrict: deleting a typeface that styles still use must be an explicit choice.
  foreign key (family_id, brand_id) references public.type_families (id, brand_id) on delete restrict
);

create table public.strategy_fields (
  brand_id uuid not null references public.brands (id) on delete cascade,
  key text not null check (key in (
    'overview', 'story', 'mission', 'vision', 'purpose', 'values', 'positioning',
    'audience', 'personality', 'archetype', 'promise', 'messaging', 'tone'
  )),
  value jsonb not null check (jsonb_typeof(value) in ('string', 'array')),
  status public.strategy_status not null default 'approved',
  source public.content_origin not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (brand_id, key)
);

-- ---------------------------------------------------------------------------
-- Published versions (immutable)
-- ---------------------------------------------------------------------------

create table public.versions (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  number integer not null check (number > 0),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  draft_rev bigint not null,
  note text check (char_length(note) <= 300),
  published_by uuid references auth.users (id) on delete set null,
  published_at timestamptz not null default now(),
  unique (brand_id, number),
  unique (id, brand_id)
);

alter table public.brands
  add constraint brands_current_version_fk
  foreign key (current_version_id, id) references public.versions (id, brand_id)
  on delete set null (current_version_id);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger workspaces_updated_at before update on public.workspaces for each row execute function public.set_updated_at();
create trigger brands_updated_at before update on public.brands for each row execute function public.set_updated_at();
create trigger sections_updated_at before update on public.sections for each row execute function public.set_updated_at();
create trigger blocks_updated_at before update on public.blocks for each row execute function public.set_updated_at();
create trigger color_tokens_updated_at before update on public.color_tokens for each row execute function public.set_updated_at();
create trigger assets_updated_at before update on public.assets for each row execute function public.set_updated_at();
create trigger type_families_updated_at before update on public.type_families for each row execute function public.set_updated_at();
create trigger font_files_updated_at before update on public.font_files for each row execute function public.set_updated_at();
create trigger type_styles_updated_at before update on public.type_styles for each row execute function public.set_updated_at();
create trigger strategy_fields_updated_at before update on public.strategy_fields for each row execute function public.set_updated_at();

-- Any change to a brand's draft content bumps brands.draft_rev.
create function public.bump_draft_rev() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_brand uuid := coalesce(new.brand_id, old.brand_id);
begin
  update public.brands set draft_rev = draft_rev + 1 where id = v_brand;
  return null;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['sections', 'blocks', 'color_tokens', 'assets', 'type_families', 'font_files', 'type_styles', 'strategy_fields'] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function public.bump_draft_rev()',
      t || '_bump_draft_rev', t
    );
  end loop;
end;
$$;

-- Sections may nest, but never in a loop and never deeper than 4 levels.
create function public.check_section_tree() returns trigger
language plpgsql set search_path = public as $$
declare
  v_depth integer;
  v_cycle boolean;
begin
  if new.parent_id is null then
    return new;
  end if;
  with recursive ancestors as (
    select s.id, s.parent_id, 1 as depth from public.sections s where s.id = new.parent_id
    union all
    select s.id, s.parent_id, a.depth + 1 from public.sections s join ancestors a on s.id = a.parent_id
    where a.depth < 10
  )
  select max(depth), bool_or(id = new.id) into v_depth, v_cycle from ancestors;
  if v_cycle then
    raise exception 'A section cannot be moved inside itself' using errcode = 'check_violation';
  end if;
  if v_depth >= 4 then
    raise exception 'Sections can be nested at most 4 levels deep' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger sections_tree before insert or update of parent_id on public.sections
  for each row execute function public.check_section_tree();

create function public.prevent_version_update() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'Published versions are immutable' using errcode = 'insufficient_privilege';
end;
$$;
create trigger versions_immutable before update on public.versions
  for each row execute function public.prevent_version_update();

-- A new workspace gets its creator as owner and a Starter subscription.
create function public.on_workspace_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.created_by is not null then
    insert into public.workspace_members (workspace_id, user_id, role) values (new.id, new.created_by, 'owner')
    on conflict do nothing;
  end if;
  insert into public.subscriptions (workspace_id) values (new.id) on conflict do nothing;
  return null;
end;
$$;
create trigger workspaces_created after insert on public.workspaces
  for each row execute function public.on_workspace_created();

-- A new account gets a profile and a personal workspace.
create function public.on_auth_user_created() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_name text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name', '')), '');
begin
  insert into public.profiles (id, display_name) values (new.id, v_name);
  insert into public.workspaces (name, created_by)
    values (coalesce(v_name || '''s studio', 'My studio'), new.id);
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.on_auth_user_created();

-- ---------------------------------------------------------------------------
-- Access helpers (security definer to avoid RLS recursion)
-- ---------------------------------------------------------------------------

create function public.workspace_role_of(p_workspace uuid) returns public.workspace_role
language sql stable security definer set search_path = public as $$
  select role from public.workspace_members where workspace_id = p_workspace and user_id = auth.uid();
$$;

create function public.brand_role_of(p_brand uuid) returns public.workspace_role
language sql stable security definer set search_path = public as $$
  select m.role
  from public.brands b
  join public.workspace_members m on m.workspace_id = b.workspace_id and m.user_id = auth.uid()
  where b.id = p_brand;
$$;

create function public.can_view_brand(p_brand uuid) returns boolean
language sql stable set search_path = public as $$
  select public.brand_role_of(p_brand) is not null;
$$;

create function public.can_edit_brand(p_brand uuid) returns boolean
language sql stable set search_path = public as $$
  select coalesce(public.brand_role_of(p_brand) in ('owner', 'admin', 'editor'), false);
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.subscriptions enable row level security;
alter table public.brands enable row level security;
alter table public.guide_access_secrets enable row level security; -- no policies: definer functions only
alter table public.sections enable row level security;
alter table public.blocks enable row level security;
alter table public.color_tokens enable row level security;
alter table public.assets enable row level security;
alter table public.type_families enable row level security;
alter table public.font_files enable row level security;
alter table public.type_styles enable row level security;
alter table public.strategy_fields enable row level security;
alter table public.versions enable row level security;

create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid()
  or exists (
    select 1 from public.workspace_members mine
    join public.workspace_members theirs on theirs.workspace_id = mine.workspace_id
    where mine.user_id = auth.uid() and theirs.user_id = profiles.id
  )
);
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy workspaces_select on public.workspaces for select to authenticated using (public.workspace_role_of(id) is not null);
create policy workspaces_insert on public.workspaces for insert to authenticated with check (created_by = auth.uid());
create policy workspaces_update on public.workspaces for update to authenticated
  using (public.workspace_role_of(id) in ('owner', 'admin')) with check (public.workspace_role_of(id) in ('owner', 'admin'));
create policy workspaces_delete on public.workspaces for delete to authenticated using (public.workspace_role_of(id) = 'owner');

create policy members_select on public.workspace_members for select to authenticated using (public.workspace_role_of(workspace_id) is not null);
create policy members_write on public.workspace_members for all to authenticated
  using (public.workspace_role_of(workspace_id) in ('owner', 'admin'))
  with check (public.workspace_role_of(workspace_id) in ('owner', 'admin'));

create policy subscriptions_select on public.subscriptions for select to authenticated using (public.workspace_role_of(workspace_id) is not null);

create policy brands_select on public.brands for select to authenticated using (public.workspace_role_of(workspace_id) is not null);
create policy brands_insert on public.brands for insert to authenticated
  with check (public.workspace_role_of(workspace_id) in ('owner', 'admin', 'editor') and created_by = auth.uid());
create policy brands_update on public.brands for update to authenticated
  using (public.can_edit_brand(id)) with check (public.workspace_role_of(workspace_id) in ('owner', 'admin', 'editor'));
create policy brands_delete on public.brands for delete to authenticated
  using (public.workspace_role_of(workspace_id) in ('owner', 'admin') or (created_by = auth.uid() and public.can_edit_brand(id)));

do $$
declare t text;
begin
  foreach t in array array['sections', 'blocks', 'color_tokens', 'assets', 'type_families', 'font_files', 'type_styles', 'strategy_fields'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.can_view_brand(brand_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.can_edit_brand(brand_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.can_edit_brand(brand_id)) with check (public.can_edit_brand(brand_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.can_edit_brand(brand_id))', t || '_delete', t);
  end loop;
end;
$$;

create policy versions_select on public.versions for select to authenticated using (public.can_view_brand(brand_id));
create policy versions_insert on public.versions for insert to authenticated with check (public.can_edit_brand(brand_id));

-- ---------------------------------------------------------------------------
-- Draft saving: apply a batch of changes atomically, refusing stale writes
-- ---------------------------------------------------------------------------

-- p_ops: [{"op": "upsert" | "delete", "table": "<table>", "row": {...snake_case columns...}}]
-- An upsert of an existing row updates only the columns present (so reordering
-- sends just {id, position}); a new row must carry its required columns.
-- Raises SQLSTATE 'SB409' when p_base_rev is stale; the client then reloads.
create function public.apply_draft_ops(p_brand_id uuid, p_base_rev bigint, p_ops jsonb)
returns bigint
language plpgsql security invoker set search_path = public as $$
declare
  v_rev bigint;
  v_op jsonb;
  v_table text;
  v_row jsonb;
  v_keys text[];
  v_pk text[];
  v_cols text;
  v_set text;
  v_where text;
  v_exists boolean;
  v_count integer;
  c_tables constant text[] := array['sections', 'blocks', 'color_tokens', 'assets', 'type_families', 'font_files', 'type_styles', 'strategy_fields'];
begin
  if jsonb_typeof(p_ops) <> 'array' then
    raise exception 'ops must be an array' using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_array_length(p_ops) > 500 then
    raise exception 'Too many changes in one save (max 500)' using errcode = 'invalid_parameter_value';
  end if;

  -- Locks the brand row; RLS makes this fail for anyone who cannot edit it.
  select draft_rev into v_rev from public.brands where id = p_brand_id for update;
  if not found then
    raise exception 'Brand not found' using errcode = 'no_data_found';
  end if;
  if v_rev <> p_base_rev then
    raise exception 'This guide changed in another tab or by a teammate'
      using errcode = 'SB409', detail = json_build_object('currentRev', v_rev)::text;
  end if;

  for v_op in select * from jsonb_array_elements(p_ops) loop
    v_table := v_op ->> 'table';
    v_row := coalesce(v_op -> 'row', '{}'::jsonb);
    if not (v_table = any (c_tables)) then
      raise exception 'Unknown table: %', v_table using errcode = 'invalid_parameter_value';
    end if;
    if jsonb_typeof(v_row) <> 'object' then
      raise exception 'row must be an object' using errcode = 'invalid_parameter_value';
    end if;

    v_row := (v_row - 'created_at' - 'updated_at') || jsonb_build_object('brand_id', p_brand_id);
    v_pk := case when v_table = 'strategy_fields' then array['brand_id', 'key'] else array['id'] end;

    if exists (select 1 from unnest(v_pk) k where not (v_row ? k)) then
      raise exception 'Missing key for % (%)', v_table, array_to_string(v_pk, ', ') using errcode = 'invalid_parameter_value';
    end if;

    select string_agg(format('t.%1$I = r.%1$I', k), ' and ') into v_where from unnest(v_pk) k;

    if v_op ->> 'op' = 'delete' then
      execute format('delete from public.%I t using jsonb_populate_record(null::public.%I, $1) r where %s', v_table, v_table, v_where)
        using v_row;
      continue;
    elsif v_op ->> 'op' <> 'upsert' then
      raise exception 'Unknown op: %', v_op ->> 'op' using errcode = 'invalid_parameter_value';
    end if;

    -- Only real, writable columns that the client sent.
    select array_agg(a.attname::text order by a.attnum) into v_keys
    from pg_attribute a
    where a.attrelid = format('public.%I', v_table)::regclass
      and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
      and v_row ? a.attname::text;

    execute format('select exists (select 1 from public.%I t, jsonb_populate_record(null::public.%I, $1) r where %s)', v_table, v_table, v_where)
      into v_exists using v_row;

    if v_exists then
      select string_agg(format('%1$I = r.%1$I', k), ', ') into v_set
      from unnest(v_keys) k where not (k = any (v_pk)) and k <> 'brand_id';
      if v_set is null then
        continue;
      end if;
      execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I, $1) r where %s and t.brand_id = $2', v_table, v_set, v_table, v_where)
        using v_row, p_brand_id;
      get diagnostics v_count = row_count;
      if v_count = 0 then
        raise exception 'Not allowed to change this % row', v_table using errcode = 'insufficient_privilege';
      end if;
    else
      select string_agg(format('%I', k), ', ') into v_cols from unnest(v_keys) k;
      execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)', v_table, v_cols, v_cols, v_table)
        using v_row;
    end if;
  end loop;

  select draft_rev into v_rev from public.brands where id = p_brand_id;
  return v_rev;
end;
$$;

-- ---------------------------------------------------------------------------
-- Publishing
-- ---------------------------------------------------------------------------

-- The app builds the snapshot from the draft (packages/brand-schema buildSnapshot)
-- and passes the draft_rev it was built from, so a publish never ships content
-- that changed while the snapshot was being built.
create function public.publish_version(p_brand_id uuid, p_snapshot jsonb, p_draft_rev bigint, p_note text default null)
returns public.versions
language plpgsql security invoker set search_path = public as $$
declare
  v_brand public.brands;
  v_version public.versions;
begin
  select * into v_brand from public.brands where id = p_brand_id for update;
  if not found or not public.can_edit_brand(p_brand_id) then
    raise exception 'Not allowed to publish this brand' using errcode = 'insufficient_privilege';
  end if;
  if v_brand.archived_at is not null then
    raise exception 'Unarchive the brand before publishing' using errcode = 'check_violation';
  end if;
  if v_brand.draft_rev <> p_draft_rev then
    raise exception 'The draft changed while publishing; try again'
      using errcode = 'SB409', detail = json_build_object('currentRev', v_brand.draft_rev)::text;
  end if;
  if (p_snapshot -> 'brand' ->> 'id') is distinct from p_brand_id::text or (p_snapshot ->> 'schemaVersion') is null then
    raise exception 'Snapshot does not belong to this brand' using errcode = 'invalid_parameter_value';
  end if;

  insert into public.versions (brand_id, number, snapshot, draft_rev, note, published_by)
  values (
    p_brand_id,
    coalesce((select max(number) from public.versions where brand_id = p_brand_id), 0) + 1,
    p_snapshot,
    p_draft_rev,
    p_note,
    auth.uid()
  )
  returning * into v_version;

  update public.brands
  set current_version_id = v_version.id,
      visibility = case when visibility = 'unpublished' then 'public' else visibility end
  where id = p_brand_id;

  return v_version;
end;
$$;

-- Roll back by republishing an earlier snapshot as a new version, keeping history linear.
create function public.restore_version(p_brand_id uuid, p_version_id uuid)
returns public.versions
language plpgsql security invoker set search_path = public as $$
declare
  v_old public.versions;
  v_rev bigint;
begin
  select * into v_old from public.versions where id = p_version_id and brand_id = p_brand_id;
  if not found then
    raise exception 'Version not found' using errcode = 'no_data_found';
  end if;
  select draft_rev into v_rev from public.brands where id = p_brand_id;
  return public.publish_version(p_brand_id, v_old.snapshot, v_rev, format('Restored version %s', v_old.number));
end;
$$;

create function public.set_guide_access(p_brand_id uuid, p_visibility public.guide_visibility, p_password text default null)
returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.can_edit_brand(p_brand_id) then
    raise exception 'Not allowed to change access for this brand' using errcode = 'insufficient_privilege';
  end if;
  if p_visibility = 'password' then
    if p_password is not null then
      if char_length(p_password) < 6 then
        raise exception 'Use a password of at least 6 characters' using errcode = 'check_violation';
      end if;
      insert into public.guide_access_secrets (brand_id, password_hash)
      values (p_brand_id, crypt(p_password, gen_salt('bf', 10)))
      on conflict (brand_id) do update set password_hash = excluded.password_hash, updated_at = now();
    elsif not exists (select 1 from public.guide_access_secrets where brand_id = p_brand_id) then
      raise exception 'Set a password first' using errcode = 'check_violation';
    end if;
  end if;
  update public.brands set visibility = p_visibility where id = p_brand_id;
end;
$$;

-- Public read of a published guide. Callable without an account.
-- Returns null when there is nothing to show (unknown slug, unpublished, archived),
-- {"locked": true, ...} when a password is required and missing or wrong,
-- and the snapshot otherwise. Never exposes drafts.
create function public.get_published_guide(p_slug text, p_password text default null)
returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_brand public.brands;
  v_version public.versions;
  v_hash text;
begin
  select * into v_brand from public.brands where slug = lower(p_slug);
  if not found or v_brand.visibility = 'unpublished' or v_brand.archived_at is not null or v_brand.current_version_id is null then
    return null;
  end if;
  if v_brand.visibility = 'password' then
    select password_hash into v_hash from public.guide_access_secrets where brand_id = v_brand.id;
    if v_hash is null or p_password is null or crypt(p_password, v_hash) <> v_hash then
      return jsonb_build_object('locked', true, 'brandName', v_brand.name);
    end if;
  end if;
  select * into v_version from public.versions where id = v_brand.current_version_id;
  return jsonb_build_object(
    'locked', false,
    'versionId', v_version.id,
    'version', v_version.number,
    'publishedAt', v_version.published_at,
    'snapshot', v_version.snapshot
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated;
-- Supabase grants anon table access by default; visitors only use get_published_guide.
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on public.guide_access_secrets from anon, authenticated;
revoke insert, update, delete on public.subscriptions from authenticated;
revoke update, delete on public.versions from authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.workspace_role_of(uuid),
  public.brand_role_of(uuid),
  public.can_view_brand(uuid),
  public.can_edit_brand(uuid),
  public.apply_draft_ops(uuid, bigint, jsonb),
  public.publish_version(uuid, jsonb, bigint, text),
  public.restore_version(uuid, uuid),
  public.set_guide_access(uuid, public.guide_visibility, text)
to authenticated, service_role;
grant execute on function public.get_published_guide(text, text) to anon, authenticated;
