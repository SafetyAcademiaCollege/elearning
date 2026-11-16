# E-learning AI assistant proxy

The course page's AI assistant used to call Google Gemini directly with an API key
embedded in `index.html`. Anyone could copy that key. This Worker keeps the key on
the server side.

## What to do once

1. **Revoke the old key.** Google Cloud console → APIs & Services → Credentials →
   delete the key that starts `AIzaSyCFbPBP…`. It is in this repository's git
   history, so deleting it from the code is not enough.
2. Create a new Gemini API key and restrict it to the Generative Language API.
3. Cloudflare dashboard → Workers & Pages → Create → Worker, paste `worker.js`, deploy.
4. In the Worker's settings add:
   - secret `GEMINI_API_KEY` = the new key
   - variable `ALLOWED_ORIGINS` = `https://elearning.safetyacademia.ge,https://safetyacademiacollege.github.io`
5. Add a rate-limiting rule for the Worker route (Cloudflare → Security → WAF →
   Rate limiting), e.g. 20 requests per minute per IP, so nobody can run up the bill.
6. Put the Worker URL into `AI_PROXY_URL` near `sendAI()` in `index.html` and publish.

Until step 6 the assistant shows "not configured" instead of failing silently.
