# Phase 0 — Secret Rotation Checklist

**Why:** `.env.local` (Supabase service_role, Twilio auth token, a GitHub PAT, Anthropic/Groq keys,
`VAULT_ENCRYPTION_KEY`) sits in plaintext on disk. It is gitignored (not in history), but it should be
treated as **potentially exposed** — rotate anything that may have been shared, synced, or screen-shared.

> ⚠️ `VAULT_ENCRYPTION_KEY` is special: rotating it makes existing encrypted vault rows (password-vault /
> api-key-vault) **undecryptable**. Do that one LAST and only with the re-encryption plan below.

## Rotate (in this order)

- [ ] **GitHub PAT (`ghp_…`)** — GitHub → Settings → Developer settings → Personal access tokens → revoke the old one, create a new fine-scoped token. Update wherever it's used (CI / local git). *Highest blast radius — do first.*
- [ ] **Supabase `service_role` key** — Supabase → Project Settings → API → "Reset service_role". Update `SUPABASE_SERVICE_KEY` in Vercel env + local `.env.local`. (Anon key + URL don't need rotating.)
- [ ] **Twilio Auth Token** — Twilio Console → Account → API keys & tokens → rotate the primary Auth Token (use the secondary-token swap so live calls don't drop). Update `TWILIO_AUTH_TOKEN` in Vercel + local. **Note:** the new webhook signature check uses this token — update it everywhere before/with the swap.
- [ ] **Anthropic API key** — console.anthropic.com → API keys → roll. Update `ANTHROPIC_API_KEY`.
- [ ] **Groq API key** — console.groq.com → roll. Update `GROQ_API_KEY` (or drop it — `groq-sdk` is unused; Groq is called via raw fetch in `lib/server/ai.ts`).
- [ ] **`VAULT_ENCRYPTION_KEY`** — LAST. See re-encryption note below.

## After rotating

- [ ] Update **Vercel → Project → Settings → Environment Variables** (Production + Preview) for each.
- [ ] Update local `.env.local`.
- [ ] Redeploy (`vercel deploy --prod`) so the running functions pick up new values.
- [ ] Confirm `.env.local` is still gitignored: `git check-ignore .env.local` → should print the path.
- [ ] Verify `CREDENTIALS-STATUS.md` (tracked in git) contains **no live secret values** — it's committed.

## VAULT_ENCRYPTION_KEY re-encryption (only if rotating it)

Encrypted columns in `password_vault` / `api_key_vault` are AES-encrypted with the current key
(`lib/server/crypto.ts`). To rotate without data loss:
1. Add the new key as `VAULT_ENCRYPTION_KEY_NEW` alongside the old.
2. Run a one-off script: decrypt each row with the old key, re-encrypt with the new, write back.
3. Promote `VAULT_ENCRYPTION_KEY_NEW` → `VAULT_ENCRYPTION_KEY`, remove the temp var, redeploy.
If you have no encrypted rows yet, just swap the key and skip re-encryption.

## New env vars introduced in Phase 0 (Twilio webhook signing)

- `TWILIO_SKIP_SIGNATURE_CHECK` *(optional, default off)* — set to `true` ONLY as a temporary rollout
  escape hatch if signature validation falsely rejects legitimate Twilio requests (e.g. URL mismatch).
  Re-enable (unset) as soon as the URL issue is resolved.
- `TWILIO_WEBHOOK_BASE_URL` *(optional)* — e.g. `https://lead-os-livid.vercel.app`. Set this if signature
  validation fails due to proxy host/protocol differences; the verifier will try it as the canonical URL.
