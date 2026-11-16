-- Book Studio core schema.
-- Design rules:
--  * Every tenant table carries org_id and is protected by row-level security.
--  * Chapter text lives only in chapter_versions, which users cannot write directly.
--    Authors write through save_draft(); AI text is written only by the AI gateway
--    (service role). That makes the "AI-generated" provenance flag trustworthy.
--  * Workflow state changes go through security-definer functions that check roles
--    and write the audit log.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Plans and organisations
-- ---------------------------------------------------------------------------

create table public.plans (
  id text primary key,
  name text not null,
  seats int not null,
  max_books int,                       -- null = unlimited
  ai_monthly_budget_usd numeric(10,2) not null,
  exports text[] not null default array['docx','pdf'],
  sort int not null default 0
);

insert into public.plans (id, name, seats, max_books, ai_monthly_budget_usd, exports, sort) values
  ('pilot',         'Pilot',         10, null,  8.00, array['docx','pdf','epub','scorm'], 0),
  ('starter',       'Starter',        3,    2, 12.00, array['docx','pdf'],                 1),
  ('team',          'Team',          10, null, 40.00, array['docx','pdf','epub','scorm'], 2),
  ('institutional', 'Institutional', 200, null, 150.00, array['docx','pdf','epub','scorm'], 3);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  brand_color text not null default '#1F3A52' check (brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  logo_path text,
  plan_id text not null default 'pilot' references public.plans(id),
  subscription_status text not null default 'pilot'
    check (subscription_status in ('pilot','trialing','active','past_due','canceled','unpaid','incomplete')),
  ai_budget_override_usd numeric(10,2),   -- set by platform admin for special deals
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz not null default now()
);

create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table public.memberships (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  roles text[] not null default array['author'],
  created_at timestamptz not null default now(),
  primary key (org_id, user_id),
  constraint roles_valid check (
    cardinality(roles) > 0
    and roles <@ array['owner','author','reviewer','approver']::text[]
  )
);
create index memberships_user_idx on public.memberships(user_id);

-- New auth users get a profile row.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Access helpers (security definer so policies don't recurse into memberships RLS)
-- ---------------------------------------------------------------------------

create function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;

create function public.is_member(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships where org_id = p_org and user_id = auth.uid());
$$;

-- Owners hold every role.
create function public.has_role(p_org uuid, p_role text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships
    where org_id = p_org and user_id = auth.uid()
      and (p_role = any(roles) or 'owner' = any(roles))
  );
$$;

create function public.org_ai_budget(p_org uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(o.ai_budget_override_usd, p.ai_monthly_budget_usd)
  from organizations o join plans p on p.id = o.plan_id
  where o.id = p_org;
$$;

-- ---------------------------------------------------------------------------
-- Templates (global, read-only for users)
-- ---------------------------------------------------------------------------

create table public.templates (
  id text primary key,
  name text not null,
  name_ka text,
  description text not null,
  domain text not null check (domain in ('aviation','osh','general')),
  chapters jsonb not null,             -- [{title_en, title_ka, goal}]
  sort int not null default 0,
  active boolean not null default true
);

-- ---------------------------------------------------------------------------
-- Books, chapters, versions
-- ---------------------------------------------------------------------------

create table public.books (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 200),
  subtitle text not null default '',
  document_ref text not null default '',       -- e.g. "TM-ATO-01"
  template_id text references public.templates(id),
  languages text[] not null default array['en','ka'],
  primary_lang text not null default 'en',
  archived boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint languages_valid check (cardinality(languages) between 1 and 2 and languages <@ array['en','ka']::text[]),
  constraint primary_lang_valid check (primary_lang = any(languages))
);
create index books_org_idx on public.books(org_id);

create table public.chapters (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  position int not null default 0,
  title_en text not null default '',
  title_ka text not null default '',
  goal text not null default '',
  status text not null default 'draft'
    check (status in ('draft','in_review','reviewed','changes_requested','approved')),
  revision int,                         -- null until first approval; 0 = initial issue
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index chapters_book_idx on public.chapters(book_id, position);

-- Chapter org must match its book's org (prevents cross-tenant attachment).
create function public.chapters_org_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from books where id = new.book_id;
  if v_org is null or v_org <> new.org_id then
    raise exception 'chapter org does not match book org' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.status = 'approved' and (
       new.title_en is distinct from old.title_en or
       new.title_ka is distinct from old.title_ka or
       new.goal is distinct from old.goal) then
    raise exception 'chapter is approved and locked; open a new revision first' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger chapters_org_guard before insert or update on public.chapters
  for each row execute function public.chapters_org_guard();

create table public.chapter_versions (
  id bigserial primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  lang text not null check (lang in ('en','ka')),
  body text not null,
  source text not null check (source in ('author','ai')),
  ai_op text check (ai_op in ('draft','adapt')),
  model text,
  restored_from bigint references public.chapter_versions(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_fields check (
    (source = 'ai' and ai_op is not null and model is not null) or
    (source = 'author' and ai_op is null)
  )
);
create index chapter_versions_chapter_idx on public.chapter_versions(chapter_id, lang, id desc);

-- No version may be written while the chapter is under review or approved,
-- whoever writes it (including the service role).
create function public.versions_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_status text; v_org uuid;
begin
  select status, org_id into v_status, v_org from chapters where id = new.chapter_id;
  if v_org is null or v_org <> new.org_id then
    raise exception 'version org does not match chapter org' using errcode = '42501';
  end if;
  if v_status in ('in_review','reviewed','approved') then
    raise exception 'chapter is % and cannot be edited', v_status using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and (new.source <> old.source or new.chapter_id <> old.chapter_id or new.lang <> old.lang) then
    raise exception 'version provenance is immutable' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger versions_guard before insert or update on public.chapter_versions
  for each row execute function public.versions_guard();

-- Provenance per chapter and language. Follows the KDP-style rule: once AI has
-- drafted or adapted a chapter in a language, that language version stays
-- AI-generated however much it is edited afterwards.
create view public.chapter_provenance with (security_invoker = true) as
select
  c.id as chapter_id,
  c.book_id,
  l.lang,
  exists (select 1 from chapter_versions v where v.chapter_id = c.id and v.lang = l.lang and v.source = 'ai') as ai_generated,
  (select v.body from chapter_versions v where v.chapter_id = c.id and v.lang = l.lang order by v.id desc limit 1) as body,
  (select v.id from chapter_versions v where v.chapter_id = c.id and v.lang = l.lang order by v.id desc limit 1) as version_id,
  (select v.updated_at from chapter_versions v where v.chapter_id = c.id and v.lang = l.lang order by v.id desc limit 1) as last_edit_at
from chapters c
cross join (values ('en'), ('ka')) as l(lang);

-- ---------------------------------------------------------------------------
-- Review: comments, AI consistency flags
-- ---------------------------------------------------------------------------

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  lang text check (lang in ('en','ka')),
  author_id uuid not null references auth.users(id) default auth.uid(),
  body text not null check (length(trim(body)) between 1 and 4000),
  kind text not null default 'comment' check (kind in ('comment','review','system')),
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);
create index comments_chapter_idx on public.comments(chapter_id, created_at);

create table public.chapter_flags (
  id bigserial primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  lang text not null check (lang in ('en','ka')),
  type text not null,
  note text not null,
  created_at timestamptz not null default now()
);
create index chapter_flags_chapter_idx on public.chapter_flags(chapter_id, lang);

-- ---------------------------------------------------------------------------
-- Source library and glossary
-- ---------------------------------------------------------------------------

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 300),
  reference text not null default '',      -- e.g. "ICAO Annex 19, 2nd ed., 2016"
  kind text not null default 'regulation' check (kind in ('regulation','standard','guidance','internal','other')),
  url text not null default '',
  excerpt text not null default '' check (length(excerpt) <= 40000),
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index sources_org_idx on public.sources(org_id);

create table public.chapter_sources (
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  source_id uuid not null references public.sources(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  primary key (chapter_id, source_id)
);

create function public.chapter_sources_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from chapters where id = new.chapter_id and org_id = new.org_id)
     or not exists (select 1 from sources where id = new.source_id and org_id = new.org_id) then
    raise exception 'source and chapter must belong to the same organisation' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger chapter_sources_guard before insert on public.chapter_sources
  for each row execute function public.chapter_sources_guard();

create table public.glossary_terms (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  term_en text not null default '',
  term_ka text not null default '',
  note text not null default '',
  created_at timestamptz not null default now(),
  constraint term_present check (length(trim(term_en)) > 0 or length(trim(term_ka)) > 0)
);
create index glossary_org_idx on public.glossary_terms(org_id);

-- ---------------------------------------------------------------------------
-- Usage metering and audit log (written by server code only)
-- ---------------------------------------------------------------------------

create table public.ai_usage (
  id bigserial primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id),
  book_id uuid references public.books(id) on delete set null,
  chapter_id uuid references public.chapters(id) on delete set null,
  op text not null check (op in ('blueprint','draft','adapt','check')),
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric(12,6) not null default 0,
  created_at timestamptz not null default now()
);
create index ai_usage_org_month_idx on public.ai_usage(org_id, created_at);

create function public.org_ai_spend_this_month(p_org uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(cost_usd), 0) from ai_usage
  where org_id = p_org and created_at >= date_trunc('month', now());
$$;

create table public.audit_events (
  id bigserial primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  book_id uuid references public.books(id) on delete cascade,
  chapter_id uuid references public.chapters(id) on delete cascade,
  actor_id uuid references auth.users(id),
  event text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_events_book_idx on public.audit_events(book_id, created_at);

create function public.log_event(p_org uuid, p_book uuid, p_chapter uuid, p_event text, p_detail jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into audit_events (org_id, book_id, chapter_id, actor_id, event, detail)
  values (p_org, p_book, p_chapter, auth.uid(), p_event, coalesce(p_detail, '{}'::jsonb));
$$;
