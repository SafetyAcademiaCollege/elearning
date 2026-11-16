# Deploying Book Studio

You need about two hours. Do the steps in order. Nothing secret goes into the
repository or into chat: keys are entered only in the Supabase, Cloudflare and Stripe
dashboards or the Supabase CLI.

## 1. Accounts

| Service | Plan | Why |
|---|---|---|
| Supabase | Pro (about $25/month) | Database, auth, storage, functions. The free tier pauses idle projects. |
| Cloudflare | Free | Hosts the web app |
| Anthropic Console | Pay as you go | AI. Set a monthly spend limit (e.g. $70) under Limits. |
| Stripe | Free until you charge | Subscriptions. Can wait until after the pilot. |

## 2. Supabase project

1. Create a project. **Region: Central EU (Frankfurt).** Save the database password in
   your password manager.
2. Install the CLI on your computer (`npm i -g supabase`), then from `book-studio/`:

   ```bash
   supabase login
   supabase link --project-ref YOUR-PROJECT-REF
   supabase db push                    # applies supabase/migrations
   ```

3. Auth settings (Dashboard → Authentication):
   - **Sign-ups: disabled** (people join only by invitation).
   - URL configuration → Site URL: `https://studio.safetyacademia.ge` (your app URL).
     Redirect URLs: `https://studio.safetyacademia.ge/**`.
   - Emails: Supabase's built-in mailer is rate-limited and meant for testing. Before
     the pilot, add custom SMTP (Authentication → Emails → SMTP), e.g. Resend or
     Postmark, sending from an address on your own domain. Edit the "Invite user"
     template so it names Book Studio and Safety Academia.
4. Function secrets:

   ```bash
   supabase secrets set ANTHROPIC_API_KEY=...        # from the Anthropic Console
   supabase secrets set APP_URL=https://studio.safetyacademia.ge
   # Billing (can be added later):
   supabase secrets set STRIPE_SECRET_KEY=... STRIPE_WEBHOOK_SECRET=... \
     STRIPE_PRICE_STARTER=price_... STRIPE_PRICE_TEAM=price_...
   ```

5. Deploy the functions:

   ```bash
   supabase functions deploy ai
   supabase functions deploy team
   supabase functions deploy billing
   supabase functions deploy stripe-webhook --no-verify-jwt
   ```

   Until the Stripe secrets are set, the billing functions return an error and the
   Settings page shows it; everything else works.

## 3. Make yourself platform admin

1. Dashboard → Authentication → Users → **Invite user** with your own email. Accept the
   invitation and set a password at `/welcome`.
2. SQL editor:

   ```sql
   insert into platform_admins (user_id)
   select id from auth.users where email = 'you@safetyacademia.ge';
   ```

## 4. Web app on Cloudflare Pages

1. Cloudflare → Workers & Pages → Create → Pages → connect the GitHub repository.
2. Build settings:
   - Root directory: `book-studio/app`
   - Build command: `npm ci && npm run build`
   - Output directory: `dist`
   - Environment variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (Supabase
     Dashboard → Settings → API; both are public values) and `NODE_VERSION=22`.
3. Single-page routing: the repository already contains `app/public/_redirects`.
4. Custom domain: add `studio.safetyacademia.ge` and create the CNAME it asks for.

## 5. Stripe (when you start charging)

1. Products → create **Book Studio Starter** (€59/month) and **Book Studio Team**
   (€179/month). Copy each price id into the `STRIPE_PRICE_*` secrets.
2. Developers → Webhooks → add endpoint
   `https://YOUR-PROJECT-REF.supabase.co/functions/v1/stripe-webhook` for
   `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`. Put its signing
   secret into `STRIPE_WEBHOOK_SECRET`.
3. Settings → Billing → Customer portal: allow plan switching between the two prices
   and cancellation.
4. Test the whole flow in Stripe test mode first, with test keys.

## 6. First organisation

Sign in, open **Admin**, create the organisation with plan **Pilot** and the partner
contact's email as owner. They get an invitation email. Then run the
[smoke test](SMOKE-TEST.md) yourself on a test organisation before the first partner
logs in.
