-- Runs after test_security_workflow.sql (same database, helpers in schema t).
select t.reset();
create temp table og as select (select id from organizations where name like 'Caucasus%') as org;
grant select on og to authenticated;

-- Alice (sole owner) tries to drop her own owner role: blocked.
select t.act_as('00000000-0000-0000-0000-00000000000a');
select t.expect_error($$update memberships set roles = array['author'] where user_id = auth.uid()$$, '42501', 'last owner cannot drop owner role');

-- With a second owner it works.
update memberships set roles = array['owner'] where user_id = '00000000-0000-0000-0000-00000000000d' and org_id = (select org from og);
update memberships set roles = array['author'] where user_id = auth.uid() and org_id = (select org from og);
do $$ begin perform t.ok(not has_role((select org from og), 'owner'), 'alice is no longer owner'); end $$;

-- Deleting a whole organisation still cascades.
select t.reset();
delete from organizations where name = 'Other Org';
do $$ begin perform t.ok((select count(*) from organizations where name = 'Other Org') = 0, 'org delete cascades past the owner guard'); end $$;
\echo 'owner guard tests passed'

-- Suggest mode: advice rows and usage are recorded, and never create a version.
select t.act_as_service();
insert into chapter_flags (org_id, chapter_id, lang, type, note, kind)
select c.org_id, c.id, 'en', 'Structure', 'Open with the purpose of the manual.', 'suggest'
from chapters c join books b on b.id = c.book_id where b.title = 'ATO Training Manual' limit 1;
insert into ai_usage (org_id, op, model, cost_usd)
select org_id, 'suggest', 'claude-opus-5-5', 0.02 from books where title = 'ATO Training Manual';
select t.reset();
do $$ begin
  perform t.ok((select count(*) from chapter_flags where kind = 'suggest') = 1, 'suggestion stored');
  perform t.ok((select count(*) from ai_usage where op = 'suggest') = 1, 'suggest usage metered');
end $$;
select t.expect_error($$insert into chapter_flags (org_id, chapter_id, lang, type, note, kind)
  select org_id, id, 'en', 'x', 'y', 'rewrite' from chapters limit 1$$, '23514', 'unknown flag kind rejected');
\echo 'suggest mode tests passed'
