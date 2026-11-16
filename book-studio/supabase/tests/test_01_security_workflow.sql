-- Security and workflow tests. Runs as superuser; switches to the `authenticated`
-- role with a JWT subject to act as a given user, like PostgREST does.

create schema t;
create function t.act_as(p_user uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, false);
  execute 'set role authenticated';
end $$;
create function t.act_as_service() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', false);
  execute 'set role service_role';
end $$;
create function t.act_as_anon() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', false);
  execute 'set role anon';
end $$;
create function t.reset() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claims', '', false); end $$;
grant usage on schema t to anon, authenticated, service_role;
grant execute on all functions in schema t to anon, authenticated, service_role;

-- Expect a statement to fail with the given SQLSTATE.
create function t.expect_error(p_sql text, p_code text, p_label text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate <> p_code then
      raise exception 'FAIL [%]: expected %, got % (%)', p_label, p_code, sqlstate, sqlerrm;
    end if;
    return;
  end;
  raise exception 'FAIL [%]: expected error %, statement succeeded', p_label, p_code;
end $$;
create function t.ok(p_cond boolean, p_label text) returns void language plpgsql as $$
begin
  if p_cond is distinct from true then raise exception 'FAIL [%]', p_label; end if;
end $$;
grant execute on all functions in schema t to anon, authenticated, service_role;

-- Fixed ids so tests read clearly.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@ato.example'),   -- owner, org A
  ('00000000-0000-0000-0000-00000000000b', 'bob@ato.example'),     -- author, org A
  ('00000000-0000-0000-0000-00000000000c', 'rita@ato.example'),    -- reviewer, org A
  ('00000000-0000-0000-0000-00000000000d', 'alex@ato.example'),    -- approver, org A
  ('00000000-0000-0000-0000-00000000000e', 'eve@other.example'),   -- owner, org B
  ('00000000-0000-0000-0000-00000000000f', 'pat@platform.example'),-- platform admin
  ('00000000-0000-0000-0000-000000000010', 'mallory@x.example');   -- nobody
insert into platform_admins values ('00000000-0000-0000-0000-00000000000f');

do $$ begin
  perform t.ok((select count(*) from profiles) = 7, 'profiles created by auth trigger');
end $$;

-- Platform admin creates organisations; non-admins cannot.
select t.act_as('00000000-0000-0000-0000-00000000000f');
create temp table ids as select
  (select id from admin_create_org('Caucasus Flight Academy')) as org_a,
  (select id from admin_create_org('Other Org')) as org_b;
grant select on ids to authenticated, service_role, anon;
select t.act_as('00000000-0000-0000-0000-000000000010');
select t.expect_error($$select admin_create_org('Hack')$$, '42501', 'non-admin cannot create org');
select t.reset();

insert into memberships (org_id, user_id, roles)
select org_a, '00000000-0000-0000-0000-00000000000a'::uuid, array['owner'] from ids union all
select org_a, '00000000-0000-0000-0000-00000000000b', array['author'] from ids union all
select org_a, '00000000-0000-0000-0000-00000000000c', array['reviewer'] from ids union all
select org_a, '00000000-0000-0000-0000-00000000000d', array['approver'] from ids union all
select org_b, '00000000-0000-0000-0000-00000000000e', array['owner'] from ids;

-- Author creates a book from a template.
select t.act_as('00000000-0000-0000-0000-00000000000b');
create temp table bk as select (create_book((select org_a from ids), 'ATO Training Manual', 'ato-training-manual', array['en','ka'], 'en', 'TM-01')).id as book_id;
grant select on bk to authenticated, service_role, anon;
create temp table ch as select id as chapter_id from chapters where book_id = (select book_id from bk) order by position limit 1;
grant select on ch to authenticated, service_role, anon;
do $$ begin
  perform t.ok((select count(*) from chapters where book_id = (select book_id from bk)) = 8, 'template created 8 chapters');
  perform t.ok((select title_ka from chapters where id = (select chapter_id from ch)) = 'ნაწილი A — ზოგადი', 'Georgian title stored');
end $$;

-- Reviewer (not author) cannot create books.
select t.act_as('00000000-0000-0000-0000-00000000000c');
select t.expect_error($$select create_book((select org_a from ids), 'x')$$, '42501', 'reviewer cannot create book');

-- Author saves text; quick consecutive saves merge into one version.
select t.act_as('00000000-0000-0000-0000-00000000000b');
do $$
declare v1 bigint; v2 bigint;
begin
  v1 := (save_draft((select chapter_id from ch), 'en', 'First draft by Bob.')).id;
  v2 := (save_draft((select chapter_id from ch), 'en', 'First draft by Bob, edited.')).id;
  perform t.ok(v1 = v2, 'autosave merges consecutive author saves');
  perform t.ok((select count(*) from chapter_versions where chapter_id = (select chapter_id from ch)) = 1, 'one version after merge');
  perform t.ok((select not ai_generated from chapter_provenance where chapter_id = (select chapter_id from ch) and lang = 'en'), 'author text is not AI-generated');
end $$;

-- Users cannot write versions or status directly.
select t.expect_error($$insert into chapter_versions (org_id, chapter_id, lang, body, source, created_by)
  values ((select org_a from ids), (select chapter_id from ch), 'en', 'fake', 'author', auth.uid())$$, '42501', 'no direct version insert');
select t.expect_error($$update chapter_versions set source = 'author'$$, '42501', 'no direct version update');
select t.expect_error($$delete from chapter_versions$$, '42501', 'no version delete');
select t.expect_error($$update chapters set status = 'approved' where id = (select chapter_id from ch)$$, '42501', 'no direct status change');
select t.expect_error($$update chapters set revision = 5$$, '42501', 'no direct revision change');

-- AI gateway (service role) writes an AI version; the language is then AI-generated for good.
select t.act_as_service();
insert into chapter_versions (org_id, chapter_id, lang, body, source, ai_op, model, created_by)
values ((select org_a from ids), (select chapter_id from ch), 'en', 'AI drafted text.', 'ai', 'draft', 'claude-opus-5-5', '00000000-0000-0000-0000-00000000000b');
select t.act_as('00000000-0000-0000-0000-00000000000b');
do $$
declare v_ai bigint; v_new bigint;
begin
  select max(id) into v_ai from chapter_versions where chapter_id = (select chapter_id from ch);
  v_new := (save_draft((select chapter_id from ch), 'en', 'AI drafted text, heavily edited by Bob.')).id;
  perform t.ok(v_new > v_ai, 'editing AI text creates a new version, never overwrites the AI one');
  perform t.ok((select ai_generated from chapter_provenance where chapter_id = (select chapter_id from ch) and lang = 'en'), 'AI provenance survives human edits');
  perform t.ok((select not ai_generated from chapter_provenance where chapter_id = (select chapter_id from ch) and lang = 'ka'), 'other language unaffected');
end $$;

-- Restore keeps the restored version's provenance.
do $$
declare v_first bigint; r chapter_versions;
begin
  select min(id) into v_first from chapter_versions where chapter_id = (select chapter_id from ch);
  r := restore_version(v_first);
  perform t.ok(r.source = 'author' and r.restored_from = v_first and r.body = 'First draft by Bob, edited.', 'restore copies body and provenance');
end $$;

-- Workflow.
select t.expect_error($$select chapter_transition((select chapter_id from ch), 'accept')$$, '42501', 'author cannot accept');
select chapter_transition((select chapter_id from ch), 'submit');
select t.expect_error($$select save_draft((select chapter_id from ch), 'en', 'sneaky edit')$$, '42501', 'no edits while in review');

select t.act_as_service();
select t.expect_error($$insert into chapter_versions (org_id, chapter_id, lang, body, source, ai_op, model)
  values ((select org_a from ids), (select chapter_id from ch), 'ka', 'x', 'ai', 'adapt', 'm')$$, '42501', 'AI cannot write while in review either');

select t.act_as('00000000-0000-0000-0000-00000000000c');
select t.expect_error($$select chapter_transition((select chapter_id from ch), 'approve')$$, '42501', 'reviewer cannot approve');
select t.expect_error($$select chapter_transition((select chapter_id from ch), 'request_changes', '')$$, '22023', 'changes need a note');
select chapter_transition((select chapter_id from ch), 'request_changes', 'Cite the ATO approval reference.');
select t.act_as('00000000-0000-0000-0000-00000000000b');
select save_draft((select chapter_id from ch), 'en', 'Revised with citation.');
select chapter_transition((select chapter_id from ch), 'submit');
select t.act_as('00000000-0000-0000-0000-00000000000c');
select chapter_transition((select chapter_id from ch), 'accept');
select t.act_as('00000000-0000-0000-0000-00000000000d');
do $$ declare c chapters; begin
  c := chapter_transition((select chapter_id from ch), 'approve');
  perform t.ok(c.status = 'approved' and c.revision = 0 and c.approved_by = auth.uid(), 'first approval is revision 0');
end $$;

select t.act_as('00000000-0000-0000-0000-00000000000b');
select t.expect_error($$update chapters set title_en = 'Changed' where id = (select chapter_id from ch)$$, '42501', 'approved chapter is locked');
select t.expect_error($$select chapter_transition((select chapter_id from ch), 'reopen', 'x')$$, '42501', 'author cannot reopen');
select t.act_as('00000000-0000-0000-0000-00000000000d');
select t.expect_error($$select chapter_transition((select chapter_id from ch), 'reopen', '  ')$$, '22023', 'reopen needs a reason');
select chapter_transition((select chapter_id from ch), 'reopen', 'Annual review');
select t.act_as('00000000-0000-0000-0000-00000000000b');
select chapter_transition((select chapter_id from ch), 'submit');
select t.act_as('00000000-0000-0000-0000-00000000000c');
select chapter_transition((select chapter_id from ch), 'accept');
select t.act_as('00000000-0000-0000-0000-00000000000d');
do $$ declare c chapters; begin
  c := chapter_transition((select chapter_id from ch), 'approve');
  perform t.ok(c.revision = 1, 'second approval is revision 1');
  perform t.ok((select count(*) from audit_events where chapter_id = (select chapter_id from ch)) >= 9, 'workflow is audited');
  perform t.ok((select count(*) from comments where chapter_id = (select chapter_id from ch) and kind = 'review') = 2, 'review notes stored as comments');
end $$;

-- Tenant isolation: Eve (org B) sees nothing of org A.
select t.act_as('00000000-0000-0000-0000-00000000000e');
do $$ begin
  perform t.ok((select count(*) from books) = 0, 'eve sees no books of org A');
  perform t.ok((select count(*) from chapters) = 0, 'eve sees no chapters of org A');
  perform t.ok((select count(*) from chapter_versions) = 0, 'eve sees no versions of org A');
  perform t.ok((select count(*) from chapter_provenance) = 0, 'eve sees no provenance of org A');
  perform t.ok((select count(*) from audit_events) = 0, 'eve sees no audit log of org A');
  perform t.ok((select count(*) from memberships) = 1, 'eve sees only her own org roster');
  perform t.ok((select count(*) from organizations) = 1, 'eve sees only her own org');
  perform t.ok((select count(*) from profiles) = 1, 'eve sees only profiles in her orgs');
end $$;
select t.expect_error($$select save_draft((select chapter_id from ch), 'en', 'eve was here')$$, '42501', 'eve cannot write to org A');
select t.expect_error($$insert into chapters (org_id, book_id, title_en) values ((select org_a from ids), (select book_id from bk), 'x')$$, '42501', 'eve cannot add chapters to org A');
select t.expect_error($$insert into chapters (org_id, book_id, title_en) values ((select org_b from ids), (select book_id from bk), 'x')$$, '42501', 'eve cannot attach a chapter to org A book via her org');
select t.expect_error($$select chapter_transition((select chapter_id from ch), 'reopen', 'x')$$, '42501', 'eve cannot change workflow in org A');

-- Cross-tenant source linking is blocked.
select t.act_as('00000000-0000-0000-0000-00000000000b');
insert into sources (org_id, title, reference) values ((select org_a from ids), 'ICAO Annex 19', 'ICAO Annex 19, 2nd ed.');
select t.act_as('00000000-0000-0000-0000-00000000000e');
select create_book((select org_b from ids), 'Eve book', 'osh-induction');
select t.reset();
create temp table ev as select
  (select c.id from chapters c join books b on b.id = c.book_id where b.title = 'Eve book' limit 1) as eve_chapter,
  (select id from sources where org_id = (select org_a from ids) limit 1) as a_source;
grant select on ev to authenticated;
select t.act_as('00000000-0000-0000-0000-00000000000e');
-- Eve knows the id of org A's source (worst case) and tries to link it to her chapter.
select t.expect_error($$insert into chapter_sources (chapter_id, source_id, org_id)
  values ((select eve_chapter from ev), (select a_source from ev), (select org_b from ids))$$,
  '42501', 'guard blocks linking another org''s source');
select t.expect_error($$insert into chapter_sources (chapter_id, source_id, org_id)
  values ((select eve_chapter from ev), (select a_source from ev), (select org_a from ids))$$,
  '42501', 'RLS blocks writing link rows into another org');
do $$ begin perform t.ok((select count(*) from sources) = 0, 'eve cannot read org A sources'); end $$;

-- Organisation settings: owner may rename, not change plan; others can't touch it.
select t.act_as('00000000-0000-0000-0000-00000000000a');
update organizations set name = 'Caucasus Flight Academy LLC' where id = (select org_a from ids);
select t.expect_error($$update organizations set plan_id = 'institutional'$$, '42501', 'owner cannot change own plan');
select t.expect_error($$update organizations set ai_budget_override_usd = 9999$$, '42501', 'owner cannot raise own AI budget');
select t.act_as('00000000-0000-0000-0000-00000000000b');
do $$ declare n int; begin
  update organizations set name = 'Bob Org' where id = (select org_a from ids);
  get diagnostics n = row_count;
  perform t.ok(n = 0, 'author cannot rename org');
end $$;

-- Roles: author cannot promote themself; owner can change roles.
do $$ declare n int; begin
  update memberships set roles = array['owner'] where user_id = auth.uid();
  get diagnostics n = row_count;
  perform t.ok(n = 0, 'author cannot self-promote');
end $$;
select t.act_as('00000000-0000-0000-0000-00000000000a');
update memberships set roles = array['author','reviewer'] where user_id = '00000000-0000-0000-0000-00000000000b';
select t.expect_error($$update memberships set roles = array['god']$$, '23514', 'invalid role rejected');
do $$ declare n int; begin
  delete from memberships where user_id = auth.uid();
  get diagnostics n = row_count;
  perform t.ok(n = 0, 'owner cannot remove themself');
end $$;

-- Usage visibility: owner sees all org usage; author only their own.
select t.act_as_service();
insert into ai_usage (org_id, user_id, op, model, input_tokens, output_tokens, cost_usd) values
  ((select org_a from ids), '00000000-0000-0000-0000-00000000000b', 'draft', 'claude-opus-5-5', 1000, 5000, 0.104),
  ((select org_a from ids), '00000000-0000-0000-0000-00000000000c', 'check', 'claude-haiku-5-5', 3000, 400, 0.0005);
select t.act_as('00000000-0000-0000-0000-00000000000a');
do $$ begin
  perform t.ok((select count(*) from ai_usage) = 2, 'owner sees org usage');
  perform t.ok(org_ai_spend_this_month((select org_a from ids)) = 0.1045, 'monthly spend sums');
  perform t.ok(org_ai_budget((select org_a from ids)) = 8.00, 'pilot budget applies');
end $$;
select t.act_as('00000000-0000-0000-0000-00000000000c');
do $$ begin perform t.ok((select count(*) from ai_usage) = 1, 'reviewer sees only own usage'); end $$;

-- Plan book limit.
select t.reset();
update organizations set plan_id = 'starter' where id = (select org_b from ids);
select t.act_as('00000000-0000-0000-0000-00000000000e');
select create_book((select org_b from ids), 'Second');
select t.expect_error($$select create_book((select org_b from ids), 'Third')$$, '53400', 'starter plan limits books to 2');

-- Anonymous visitors get nothing.
select t.act_as_anon();
select t.expect_error($$select * from books$$, '42501', 'anon cannot read books');
select t.expect_error($$select save_draft((select chapter_id from ch), 'en', 'x')$$, '42501', 'anon cannot call save_draft');

-- Storage policies tolerate malformed paths and isolate orgs.
select t.reset();
insert into storage.objects (bucket_id, name) values
  ('org-assets', (select org_a::text from ids) || '/logo.png'),
  ('org-assets', 'not-a-uuid/logo.png');
select t.act_as('00000000-0000-0000-0000-00000000000e');
do $$ begin perform t.ok((select count(*) from storage.objects) = 0, 'eve cannot see org A logo; bad path does not error'); end $$;
select t.act_as('00000000-0000-0000-0000-00000000000b');
do $$ begin perform t.ok((select count(*) from storage.objects) = 1, 'member sees own org logo'); end $$;
select t.expect_error(format($$insert into storage.objects (bucket_id, name) values ('org-assets', '%s/x.png')$$, (select org_a from ids)), '42501', 'author cannot upload logo');

select t.reset();
\echo 'security/workflow tests passed'
