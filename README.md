# elearning

Safety Academia e-learning platform (`index.html`).

## 5 Whys Investigator (`5whys.html`)

A guided root cause analysis tool for OSH incident and near-miss investigations:
incident details, problem statement, why chain with evidence, root cause tests,
CAPA plan built on the hierarchy of controls, and a printable report.

- Works with no setup. Built-in checks flag blame language ("human error",
  "careless", "didn't follow procedure"), vague or unsupported answers, and
  root causes that don't point at the management system.
- Investigations are saved in the browser (localStorage). Export/import as JSON
  to back up or share.
- The optional AI coach calls `api/five-whys.js`, a Vercel serverless function
  that keeps the Anthropic API key on the server.

### Turning on the AI coach

1. Import this repo into Vercel (Framework preset: Other). `5whys.html` and
   `api/five-whys.js` deploy together.
2. In Vercel > Project > Settings > Environment Variables add:
   - `ANTHROPIC_API_KEY` = your key from console.anthropic.com
   - `ALLOWED_ORIGINS` (optional) = comma-separated sites allowed to call the
     API, e.g. `https://elearning.safetyacademia.ge`. Set this if the page is
     hosted somewhere other than the Vercel project.
3. Redeploy. The "AI coach" pill in the page header turns green when the
   endpoint answers.
4. If the page is hosted elsewhere (e.g. the main site), open **AI settings**
   in the page and set the endpoint to
   `https://<your-project>.vercel.app/api/five-whys`.

The function uses Claude Opus 5.5 with structured JSON output. "Ask AI coach"
on a single why costs about 2-4 US cents; a full "Draft with AI" review about
5-15 cents (estimates at current API prices; check your Anthropic console).
