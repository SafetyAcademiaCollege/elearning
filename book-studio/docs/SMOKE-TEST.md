# Launch smoke test

Run this on the live deployment with a test organisation and three test accounts
before the first partner logs in. Allow 45 minutes. Tick each line.

The database rules, exports and AI prompt handling are covered by automated tests,
but the app has not yet been exercised end to end against a live Supabase project
with real email and the real AI. This checklist covers that.

## Accounts and access
- [ ] Admin → create "Test ATO" (Pilot plan), owner = test account A. Invitation email arrives, link opens `/welcome`, password can be set.
- [ ] As A: Team → invite B as author and C as reviewer + approver. Both receive emails.
- [ ] Sign-up from the login page is impossible (sign-ups disabled).
- [ ] Create a second organisation with owner D. D cannot see Test ATO's books (open a Test ATO book URL as D: "not found").

## Writing
- [ ] As B: New book from the **ATO Training Manual** template, EN + KA. Eight chapters appear with Georgian titles.
- [ ] Type in chapter 1 (EN). "Saved" appears; reload the page and the text is still there.
- [ ] Sources & glossary: add a source with an excerpt and two glossary terms. Link the source to chapter 1.
- [ ] **Draft with AI** on chapter 2 (EN): text streams in, the chapter pill turns "AI".
- [ ] Switch to KA, **Adapt from English**: Georgian text streams in and reads naturally (ask a Georgian speaker to judge it).
- [ ] **Check consistency**: flags appear under Review.
- [ ] History: compare two versions, restore an older one.
- [ ] Blueprint from notes on an empty book adds chapters.

## Workflow
- [ ] As B: submit chapter 1. Editing is now blocked.
- [ ] As C: request changes with a note; B sees the note under Review, edits, resubmits.
- [ ] As C: accept, then approve. Chapter shows "Rev 0" and is locked.
- [ ] As C: open a new revision with a reason; approve again → "Rev 1". Activity shows every step.

## Exports
- [ ] DOCX opens in Word; update fields (F9) fills the contents. Georgian displays.
- [ ] PDF: cover with logo (upload one in Settings first), record of revisions, list of effective chapters, Georgian renders, page numbers correct.
- [ ] EPUB opens in Apple Books or Calibre.
- [ ] SCORM zip uploads to a Moodle test course; completing a chapter marks it complete.

## Limits and billing
- [ ] Settings shows AI usage; temporarily set `ai_budget_override_usd = 0.01` for Test ATO and confirm AI buttons explain the allowance is used. Reset it.
- [ ] (Stripe test mode) Choose Team → Checkout → pay with 4242 4242 4242 4242 → back in Settings the plan is Team and status active. Manage billing opens the portal.

## Phone
- [ ] On a phone, sign in, open a chapter, read and comment. (Writing is designed for desktop.)
