-- "Suggest" mode: the AI advises on the author's own text without writing it.
-- Advice is stored alongside consistency-check flags, distinguished by kind.

alter table public.chapter_flags
  add column kind text not null default 'check' check (kind in ('check', 'suggest'));

alter table public.ai_usage drop constraint ai_usage_op_check;
alter table public.ai_usage
  add constraint ai_usage_op_check check (op in ('blueprint', 'draft', 'adapt', 'check', 'suggest'));
