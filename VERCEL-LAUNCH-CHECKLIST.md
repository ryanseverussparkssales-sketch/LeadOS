# RogueOS — Vercel Launch Checklist
**Complete these steps in order. ~45 minutes total.**

---

## STEP 1 — Test the local build first (5 min)
```bash
cd "C:\Users\Ryan\Lead Os\RogueOS\rogueos-mvp"
npm run build
```
Fix any TypeScript or compile errors before pushing. A successful local build means Vercel will build cleanly.

---

## STEP 2 — Run the final SQL migration in Supabase (2 min)
In Supabase SQL Editor, run this one line:
```sql
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS dashboard_layout JSONB;
```

---

## STEP 3 — Enable Supabase Realtime (3 min)
Go to Supabase Dashboard → Database → Replication → Tables
Enable Realtime on:
- `voicemails`
- `missed_calls`
- `contacts`
- `tasks`

---

## STEP 4 — Verify `.gitignore` protects secrets (1 min)
```bash
# Should NOT appear in git status
cat .gitignore | grep env
```
Make sure `.env.local` is listed. Never commit it.

---

## STEP 5 — Push to GitHub (5 min)
```bash
git add -A
git commit -m "Production-ready build"
git push origin main
```

---

## STEP 6 — Create Vercel project (5 min)
1. Go to vercel.com → New Project → Import from GitHub
2. Select your RogueOS repo
3. **CRITICAL:** Set framework to **SvelteKit** (not Next.js)
4. Build command: `npm run build`
5. Output directory: `.vercel/output`
6. Do NOT deploy yet — set env vars first (Step 7)

---

## STEP 7 — Add ALL environment variables in Vercel (10 min)
In Vercel → Project Settings → Environment Variables, add every variable below.
Set all to **Production** (and Preview if you want staging).

### Required — app will break without these:
| Variable | Where to find it |
|---|---|
| `PUBLIC_SUPABASE_URL` | Supabase → Settings → API |
| `PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API |
| `SUPABASE_SERVICE_KEY` | Supabase → Settings → API → service_role key |
| `TWILIO_ACCOUNT_SID` | Twilio Console → Account Info |
| `TWILIO_AUTH_TOKEN` | Twilio Console → Account Info |
| `TWILIO_APP_SID` | Twilio Console → Voice → TwiML Apps |
| `GROQ_API_KEY` | console.groq.com → API Keys |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys |
| `VAULT_ENCRYPTION_KEY` | **Copy from your `.env.local`** — the 64-char hex key |

### Check your `.env.local` for the exact values — copy them exactly.

---

## STEP 8 — Get your Vercel URL, then update CSRF (3 min)
After adding env vars, Vercel will show your URL (e.g. `rogueos-mvp.vercel.app`).

Update `svelte.config.js` → `trustedOrigins`:
```js
csrf: {
    trustedOrigins: [
        '*.vercel.app',          // covers all Vercel preview deployments
        'your-custom-domain.com', // add if you have a custom domain
    ],
},
```
Commit and push this change. Vercel will auto-redeploy.

---

## STEP 9 — Update Supabase Auth settings (2 min)
In Supabase → Authentication → URL Configuration:
- **Site URL:** `https://your-app.vercel.app`
- **Redirect URLs:** Add `https://your-app.vercel.app/**`

---

## STEP 10 — Update Twilio webhook URLs (5 min)
In Twilio Console, update all webhook URLs from ngrok to your Vercel URL:

| Webhook | URL to set |
|---|---|
| Voice (TwiML App) | `https://your-app.vercel.app/api/twilio/voice` |
| Call Status | `https://your-app.vercel.app/api/twilio/status` |
| Recording | `https://your-app.vercel.app/api/twilio/recording` |
| Incoming calls (phone numbers) | `https://your-app.vercel.app/api/phone/incoming` |

---

## STEP 11 — Deploy and smoke test (5 min)
1. Trigger a deployment in Vercel (or it auto-deploys on push)
2. Open the production URL
3. Test: **Login → Dashboard loads → Make one test call → Check notifications → Open Financials → Open Contacts**
4. Check Vercel Function Logs for any 500 errors

---

## STEP 12 — Post-launch (optional but recommended)
- Set up a **custom domain** in Vercel → Domains (update Supabase + Twilio URLs again)
- Add `VAULT_ENCRYPTION_KEY` rotation reminder to your calendar (rotate every 90 days)
- Enable Vercel **Speed Insights** and **Web Analytics** (free tier)
- Set up **Vercel Cron** to run `/api/sequences/advance` daily for email sequence advancement

---

## Quick reference — env var checklist
```
□ PUBLIC_SUPABASE_URL
□ PUBLIC_SUPABASE_ANON_KEY
□ SUPABASE_SERVICE_KEY
□ TWILIO_ACCOUNT_SID
□ TWILIO_AUTH_TOKEN
□ TWILIO_APP_SID
□ GROQ_API_KEY
□ ANTHROPIC_API_KEY
□ VAULT_ENCRYPTION_KEY        ← from your .env.local
```

---

## If the build fails on Vercel
Common causes:
- Missing env var → check Vercel function logs for "Cannot read properties of undefined"
- TypeScript error → run `npm run build` locally first
- `SUPABASE_SERVICE_KEY` name mismatch → verify it matches exactly what's in `src/lib/server/supabase.ts` line 3
