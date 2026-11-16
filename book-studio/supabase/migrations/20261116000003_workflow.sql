-- Workflow functions. Each one checks the caller's role itself (security definer).

-- Save author text. Consecutive saves by the same author within 10 minutes are
-- merged into one version so autosave doesn't flood the history.
create function public.save_draft(p_chapter uuid, p_lang text, p_body text)
returns public.chapter_versions
language plpgsql security definer set search_path = public as $$
declare
  c chapters;
  last_v chapter_versions;
  result chapter_versions;
begin
  select * into c from chapters where id = p_chapter;
  if c.id is null or not has_role(c.org_id, 'author') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_lang not in ('en','ka') then
    raise exception 'unsupported language %', p_lang using errcode = '22023';
  end if;
  if length(p_body) > 400000 then
    raise exception 'chapter text is too long' using errcode = '22023';
  end if;

  select * into last_v from chapter_versions
  where chapter_id = p_chapter and lang = p_lang order by id desc limit 1;

  if last_v.id is not null and last_v.body = p_body then
    return last_v;
  end if;

  if last_v.id is not null and last_v.source = 'author' and last_v.created_by = auth.uid()
     and last_v.restored_from is null and last_v.created_at > now() - interval '10 minutes' then
    update chapter_versions set body = p_body, updated_at = now()
    where id = last_v.id returning * into result;
  else
    insert into chapter_versions (org_id, chapter_id, lang, body, source, created_by)
    values (c.org_id, p_chapter, p_lang, p_body, 'author', auth.uid())
    returning * into result;
  end if;

  update books set updated_at = now() where id = c.book_id;
  if c.status = 'changes_requested' then
    null; -- stays in changes_requested until resubmitted
  end if;
  return result;
end $$;

-- Restore an older version as the newest one. Provenance travels with the text.
create function public.restore_version(p_version bigint)
returns public.chapter_versions
language plpgsql security definer set search_path = public as $$
declare
  v chapter_versions;
  result chapter_versions;
begin
  select * into v from chapter_versions where id = p_version;
  if v.id is null or not has_role(v.org_id, 'author') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into chapter_versions (org_id, chapter_id, lang, body, source, ai_op, model, restored_from, created_by)
  values (v.org_id, v.chapter_id, v.lang, v.body, v.source, v.ai_op, v.model, v.id, auth.uid())
  returning * into result;
  perform log_event(v.org_id, (select book_id from chapters where id = v.chapter_id), v.chapter_id,
                    'version_restored', jsonb_build_object('lang', v.lang, 'from_version', v.id));
  return result;
end $$;

-- Status machine:
--   draft / changes_requested --submit (author)--> in_review
--   in_review --accept (reviewer)--> reviewed
--   in_review / reviewed --request_changes (reviewer or approver)--> changes_requested
--   reviewed --approve (approver)--> approved   (locks the chapter, sets revision)
--   approved --reopen (approver)--> draft       (starts the next revision)
create function public.chapter_transition(p_chapter uuid, p_action text, p_note text default '')
returns public.chapters
language plpgsql security definer set search_path = public as $$
declare
  c chapters;
  new_status text;
  has_text boolean;
begin
  select * into c from chapters where id = p_chapter for update;
  if c.id is null or not is_member(c.org_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if p_action = 'submit' then
    if not has_role(c.org_id, 'author') then raise exception 'only authors can submit' using errcode = '42501'; end if;
    if c.status not in ('draft','changes_requested') then raise exception 'chapter is %', c.status using errcode = '22023'; end if;
    select exists (
      select 1 from chapter_provenance p where p.chapter_id = c.id and length(trim(coalesce(p.body,''))) > 0
    ) into has_text;
    if not has_text then raise exception 'write the chapter before submitting it' using errcode = '22023'; end if;
    new_status := 'in_review';
  elsif p_action = 'accept' then
    if not has_role(c.org_id, 'reviewer') then raise exception 'only reviewers can accept' using errcode = '42501'; end if;
    if c.status <> 'in_review' then raise exception 'chapter is %', c.status using errcode = '22023'; end if;
    new_status := 'reviewed';
  elsif p_action = 'request_changes' then
    if not (has_role(c.org_id, 'reviewer') or has_role(c.org_id, 'approver')) then
      raise exception 'only reviewers or approvers can request changes' using errcode = '42501';
    end if;
    if c.status not in ('in_review','reviewed') then raise exception 'chapter is %', c.status using errcode = '22023'; end if;
    if length(trim(coalesce(p_note,''))) = 0 then raise exception 'say what needs to change' using errcode = '22023'; end if;
    new_status := 'changes_requested';
  elsif p_action = 'approve' then
    if not has_role(c.org_id, 'approver') then raise exception 'only approvers can approve' using errcode = '42501'; end if;
    if c.status <> 'reviewed' then raise exception 'chapter must be reviewed before approval' using errcode = '22023'; end if;
    new_status := 'approved';
  elsif p_action = 'reopen' then
    if not has_role(c.org_id, 'approver') then raise exception 'only approvers can open a new revision' using errcode = '42501'; end if;
    if c.status <> 'approved' then raise exception 'chapter is not approved' using errcode = '22023'; end if;
    if length(trim(coalesce(p_note,''))) = 0 then raise exception 'give a reason for the new revision' using errcode = '22023'; end if;
    new_status := 'draft';
  else
    raise exception 'unknown action %', p_action using errcode = '22023';
  end if;

  update chapters set
    status = new_status,
    revision = case when new_status = 'approved' then coalesce(revision + 1, 0) else revision end,
    approved_at = case when new_status = 'approved' then now() else approved_at end,
    approved_by = case when new_status = 'approved' then auth.uid() else approved_by end
  where id = c.id returning * into c;

  if length(trim(coalesce(p_note,''))) > 0 then
    insert into comments (org_id, chapter_id, author_id, body, kind)
    values (c.org_id, c.id, auth.uid(), p_note, 'review');
  end if;

  perform log_event(c.org_id, c.book_id, c.id, 'chapter_' || p_action,
    jsonb_build_object('status', new_status, 'revision', c.revision, 'note', nullif(p_note,'')));
  return c;
end $$;

-- Create a book, optionally from a template. Enforces the plan's book limit.
create function public.create_book(
  p_org uuid, p_title text, p_template text default null,
  p_languages text[] default array['en','ka'], p_primary_lang text default 'en',
  p_document_ref text default '', p_subtitle text default ''
) returns public.books
language plpgsql security definer set search_path = public as $$
declare
  b books;
  limit_books int;
  current_books int;
  t templates;
  ch jsonb;
  i int := 0;
begin
  if not has_role(p_org, 'author') then raise exception 'not allowed' using errcode = '42501'; end if;

  select p.max_books into limit_books from organizations o join plans p on p.id = o.plan_id where o.id = p_org;
  if limit_books is not null then
    select count(*) into current_books from books where org_id = p_org and not archived;
    if current_books >= limit_books then
      raise exception 'your plan allows % active books; archive one or upgrade', limit_books using errcode = '53400';
    end if;
  end if;

  insert into books (org_id, title, subtitle, document_ref, template_id, languages, primary_lang, created_by)
  values (p_org, p_title, coalesce(p_subtitle,''), coalesce(p_document_ref,''), p_template, p_languages, p_primary_lang, auth.uid())
  returning * into b;

  if p_template is not null then
    select * into t from templates where id = p_template and active;
    if t.id is null then raise exception 'unknown template' using errcode = '22023'; end if;
    for ch in select * from jsonb_array_elements(t.chapters) loop
      insert into chapters (org_id, book_id, position, title_en, title_ka, goal)
      values (p_org, b.id, i, coalesce(ch->>'title_en',''), coalesce(ch->>'title_ka',''), coalesce(ch->>'goal',''));
      i := i + 1;
    end loop;
  end if;

  perform log_event(p_org, b.id, null, 'book_created', jsonb_build_object('template', p_template));
  return b;
end $$;

-- Platform admin: create an organisation (the owner is invited by the edge function).
create function public.admin_create_org(p_name text, p_plan text default 'pilot')
returns public.organizations
language plpgsql security definer set search_path = public as $$
declare o organizations;
begin
  if not is_platform_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  insert into organizations (name, plan_id) values (p_name, p_plan) returning * into o;
  return o;
end $$;

grant execute on function public.save_draft(uuid, text, text) to authenticated;
grant execute on function public.restore_version(bigint) to authenticated;
grant execute on function public.chapter_transition(uuid, text, text) to authenticated;
grant execute on function public.create_book(uuid, text, text, text[], text, text, text) to authenticated;
grant execute on function public.admin_create_org(text, text) to authenticated;

-- Safe uuid cast for storage paths (a malformed path must not raise inside a policy).
create function public.try_uuid(p text) returns uuid
language plpgsql immutable as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;
grant execute on function public.try_uuid(text) to authenticated;

-- Supabase Storage: private bucket for organisation logos, foldered by org id.
insert into storage.buckets (id, name, public) values ('org-assets', 'org-assets', false)
on conflict (id) do nothing;

create policy org_assets_read on storage.objects for select to authenticated
  using (bucket_id = 'org-assets' and public.is_member(public.try_uuid((storage.foldername(name))[1])));
create policy org_assets_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'org-assets' and public.has_role(public.try_uuid((storage.foldername(name))[1]), 'owner'));
create policy org_assets_update on storage.objects for update to authenticated
  using (bucket_id = 'org-assets' and public.has_role(public.try_uuid((storage.foldername(name))[1]), 'owner'));
create policy org_assets_delete on storage.objects for delete to authenticated
  using (bucket_id = 'org-assets' and public.has_role(public.try_uuid((storage.foldername(name))[1]), 'owner'));
