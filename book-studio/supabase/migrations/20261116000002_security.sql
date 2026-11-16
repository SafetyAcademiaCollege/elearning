-- Privileges and row-level security.
-- Supabase grants ALL on new public tables to anon/authenticated by default.
-- We revoke that and grant only what each table needs.

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from anon, public;

alter table public.plans            enable row level security;
alter table public.organizations    enable row level security;
alter table public.profiles         enable row level security;
alter table public.platform_admins  enable row level security;
alter table public.memberships      enable row level security;
alter table public.templates        enable row level security;
alter table public.books            enable row level security;
alter table public.chapters         enable row level security;
alter table public.chapter_versions enable row level security;
alter table public.comments         enable row level security;
alter table public.chapter_flags    enable row level security;
alter table public.sources          enable row level security;
alter table public.chapter_sources  enable row level security;
alter table public.glossary_terms   enable row level security;
alter table public.ai_usage         enable row level security;
alter table public.audit_events     enable row level security;

-- plans, templates: readable by any signed-in user
grant select on public.plans, public.templates to authenticated;
create policy plans_read on public.plans for select to authenticated using (true);
create policy templates_read on public.templates for select to authenticated using (active);

-- organizations: members read; owners may change name, colour and logo only
grant select on public.organizations to authenticated;
grant update (name, brand_color, logo_path) on public.organizations to authenticated;
create policy org_read on public.organizations for select to authenticated
  using (public.is_member(id) or public.is_platform_admin());
create policy org_update on public.organizations for update to authenticated
  using (public.has_role(id, 'owner')) with check (public.has_role(id, 'owner'));

-- profiles: see yourself and people who share an organisation with you
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;
create policy profiles_read on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1 from public.memberships m1 join public.memberships m2 on m1.org_id = m2.org_id
      where m1.user_id = auth.uid() and m2.user_id = profiles.id
    )
  );
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- platform_admins: a user may see whether they are one
grant select on public.platform_admins to authenticated;
create policy platform_admins_self on public.platform_admins for select to authenticated
  using (user_id = auth.uid());

-- memberships: members see their org's roster; owners change roles and remove people.
-- Adding people goes through the invite edge function (it needs auth admin rights).
grant select, delete on public.memberships to authenticated;
grant update (roles) on public.memberships to authenticated;
create policy memberships_read on public.memberships for select to authenticated
  using (public.is_member(org_id) or public.is_platform_admin());
create policy memberships_update on public.memberships for update to authenticated
  using (public.has_role(org_id, 'owner')) with check (public.has_role(org_id, 'owner'));
create policy memberships_delete on public.memberships for delete to authenticated
  using (public.has_role(org_id, 'owner') and user_id <> auth.uid());

-- books
grant select, insert, delete on public.books to authenticated;
grant update (title, subtitle, document_ref, languages, primary_lang, archived, updated_at) on public.books to authenticated;
create policy books_read on public.books for select to authenticated using (public.is_member(org_id));
create policy books_insert on public.books for insert to authenticated
  with check (public.has_role(org_id, 'author'));
create policy books_update on public.books for update to authenticated
  using (public.has_role(org_id, 'author')) with check (public.has_role(org_id, 'author'));
create policy books_delete on public.books for delete to authenticated
  using (public.has_role(org_id, 'owner'));

-- chapters: authors manage structure; status only changes through workflow functions
grant select, insert, delete on public.chapters to authenticated;
grant update (title_en, title_ka, goal, position) on public.chapters to authenticated;
create policy chapters_read on public.chapters for select to authenticated using (public.is_member(org_id));
create policy chapters_insert on public.chapters for insert to authenticated
  with check (public.has_role(org_id, 'author') and status = 'draft' and revision is null);
create policy chapters_update on public.chapters for update to authenticated
  using (public.has_role(org_id, 'author')) with check (public.has_role(org_id, 'author'));
create policy chapters_delete on public.chapters for delete to authenticated
  using (public.has_role(org_id, 'author') and revision is null and status <> 'approved');

-- chapter_versions: read only. Writes go through save_draft()/restore_version() or the AI gateway.
grant select on public.chapter_versions to authenticated;
create policy versions_read on public.chapter_versions for select to authenticated using (public.is_member(org_id));
grant select on public.chapter_provenance to authenticated;

-- comments
grant select, insert, delete on public.comments to authenticated;
grant update (resolved) on public.comments to authenticated;
create policy comments_read on public.comments for select to authenticated using (public.is_member(org_id));
create policy comments_insert on public.comments for insert to authenticated
  with check (public.is_member(org_id) and author_id = auth.uid() and kind = 'comment'
              and exists (select 1 from public.chapters c where c.id = chapter_id and c.org_id = comments.org_id));
create policy comments_update on public.comments for update to authenticated
  using (public.is_member(org_id)) with check (public.is_member(org_id));
create policy comments_delete on public.comments for delete to authenticated
  using (author_id = auth.uid() and kind = 'comment');

-- chapter_flags: read only (written by the AI gateway)
grant select on public.chapter_flags to authenticated;
create policy flags_read on public.chapter_flags for select to authenticated using (public.is_member(org_id));

-- sources and glossary: everyone reads, authors edit
grant select, insert, update, delete on public.sources, public.glossary_terms to authenticated;
create policy sources_read on public.sources for select to authenticated using (public.is_member(org_id));
create policy sources_write on public.sources for insert to authenticated with check (public.has_role(org_id, 'author'));
create policy sources_update on public.sources for update to authenticated
  using (public.has_role(org_id, 'author')) with check (public.has_role(org_id, 'author'));
create policy sources_delete on public.sources for delete to authenticated using (public.has_role(org_id, 'author'));

create policy glossary_read on public.glossary_terms for select to authenticated using (public.is_member(org_id));
create policy glossary_write on public.glossary_terms for insert to authenticated with check (public.has_role(org_id, 'author'));
create policy glossary_update on public.glossary_terms for update to authenticated
  using (public.has_role(org_id, 'author')) with check (public.has_role(org_id, 'author'));
create policy glossary_delete on public.glossary_terms for delete to authenticated using (public.has_role(org_id, 'author'));

grant select, insert, delete on public.chapter_sources to authenticated;
create policy chapter_sources_read on public.chapter_sources for select to authenticated using (public.is_member(org_id));
create policy chapter_sources_insert on public.chapter_sources for insert to authenticated
  with check (public.has_role(org_id, 'author'));
create policy chapter_sources_delete on public.chapter_sources for delete to authenticated
  using (public.has_role(org_id, 'author'));

-- usage: owners see the whole org, others see their own calls
grant select on public.ai_usage to authenticated;
create policy usage_read on public.ai_usage for select to authenticated
  using (public.has_role(org_id, 'owner') or user_id = auth.uid());

-- audit log: members read
grant select on public.audit_events to authenticated;
create policy audit_read on public.audit_events for select to authenticated using (public.is_member(org_id));

-- helper functions callable by signed-in users
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.has_role(uuid, text) to authenticated;
grant execute on function public.org_ai_budget(uuid) to authenticated;
grant execute on function public.org_ai_spend_this_month(uuid) to authenticated;
-- log_event is internal: only security-definer workflow functions call it
revoke execute on function public.log_event(uuid, uuid, uuid, text, jsonb) from authenticated;
