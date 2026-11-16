# Running Book Studio

## Routine admin (SQL editor in the Supabase dashboard)

Change an organisation's plan (e.g. a pilot partner converting on an invoice):

```sql
update organizations set plan_id = 'team', subscription_status = 'active'
where name = 'Caucasus Flight Academy';
```

Give one organisation a different AI allowance without changing its plan:

```sql
update organizations set ai_budget_override_usd = 25 where name = '...';
-- back to the plan default:
update organizations set ai_budget_override_usd = null where name = '...';
```

AI spend this month, per organisation:

```sql
select o.name, round(sum(u.cost_usd), 2) as usd, count(*) as calls
from ai_usage u join organizations o on o.id = u.org_id
where u.created_at >= date_trunc('month', now())
group by o.name order by usd desc;
```

Cost per finished book (to check pricing):

```sql
select b.title, round(sum(u.cost_usd), 2) as usd
from ai_usage u join books b on b.id = u.book_id
group by b.title order by usd desc;
```

Plan limits and prices live in the `plans` table and can be edited there. Stripe
prices are set in Stripe.

## When something goes wrong

| Symptom | Where to look |
|---|---|
| AI buttons fail | Dashboard → Edge Functions → `ai` → Logs. Check the Anthropic Console for spend limit or key problems. |
| "AI allowance used" | Expected when an organisation hits its monthly budget. Raise it with `ai_budget_override_usd` if agreed. |
| Invitations don't arrive | Authentication → Emails: check SMTP settings and the provider's logs. |
| Subscription not reflected | Stripe → Developers → Webhooks → endpoint → recent deliveries. Failed deliveries can be resent. |
| Someone locked out of an organisation | `select * from memberships where org_id = ...`; the last owner can't be removed by design. |

## Backups and restore

Supabase Pro takes daily backups (kept 7 days). Point-in-time recovery is an add-on;
consider it once paying customers depend on the service.

Once a quarter, test a restore: Dashboard → Database → Backups → restore into a **new**
project, then check that books and versions are present. Note the date in your
operations log; partners may ask.

## Changing AI models or prices

Set `DRAFT_MODEL`, `ADAPT_MODEL`, `CHECK_MODEL` or `BLUEPRINT_MODEL` with
`supabase secrets set`; no redeploy is needed for the change to apply on the next cold
start, but redeploying `ai` makes it immediate. When Anthropic changes prices, update
`supabase/functions/_shared/pricing.ts` so metering stays accurate, run `npm test` in
`app/`, and redeploy `ai`.

## Data protection

Sub-processors to list in your privacy notice and DPA: Supabase (hosting, EU region),
Cloudflare (web hosting/CDN), Anthropic (AI processing), Stripe (payments), and your
email provider. AI requests contain chapter text, linked source excerpts and glossary
terms. Check Anthropic's current data-retention and data-region terms before promising
partners EU-only processing.

Deleting an organisation (`delete from organizations where id = ...`) removes all its
books, versions, sources, usage and audit records. Export its books first if the
contract requires handing data back.
