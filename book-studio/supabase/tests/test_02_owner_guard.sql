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
