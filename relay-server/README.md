# RogueOS — ConversationRelay AI Voice Agent

A standalone WebSocket server that runs a Claude-powered **voice qualification agent**
over Twilio [ConversationRelay](https://www.twilio.com/docs/voice/conversationrelay).
It must run **separately** from the SvelteKit app — Vercel serverless functions can't
hold a persistent WebSocket.

## Flow
```
/api/twilio/conversation-relay/start   (authed: places the call via Twilio REST)
        │
        ▼
Twilio dials the contact ──► GET/POST /api/twilio/conversation-relay  (SvelteKit, returns TwiML)
        │                         └─ <Connect><ConversationRelay url="wss://relay…?token=…">
        ▼
relay-server (THIS service)  ◄══ WebSocket ══►  Twilio  (STT ⇄ TTS)
        │  setup → prompt(loop) → text replies → end{handoffData}
        │  Claude qualification loop; on hang-up → writes transcript+outcome to Supabase
        ▼
/api/twilio/conversation-relay/action  (SvelteKit: transfer-to-human or hangup)
```

## Deploy (Railway / Render / Fly / any Node host)
This is a normal long-running Node service (not serverless). Example:

```bash
cd relay-server
npm install
npm start          # listens on $PORT (default 8080), exposes /health
```

- **Railway/Render**: new service from this folder, start command `npm start`, set env vars below. Both give you a public `wss://` URL automatically.
- **Fly.io**: `fly launch` in this dir; expose the internal port.
- The host must serve **`wss://`** (TLS) — Twilio rejects `ws://`.

## Env vars — relay-server
| Var | Required | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | Claude key |
| `SUPABASE_URL` | ✅ | your `https://<project>.supabase.co` |
| `SUPABASE_SERVICE_KEY` | ✅ | service-role key (writes the call transcript/outcome) |
| `RELAY_SHARED_SECRET` | ✅ | must MATCH the app's value; authenticates the WS upgrade |
| `RELAY_MODEL` | – | default `claude-haiku-4-5-20251001` |
| `PORT` | – | host usually sets this |
| `RELAY_VALIDATE_SIGNATURE` | – | `true` to also validate Twilio's `X-Twilio-Signature` on the handshake |
| `TWILIO_AUTH_TOKEN` | if validating | required when `RELAY_VALIDATE_SIGNATURE=true` |
| `RELAY_PUBLIC_WSS_URL` | – | exact `wss://…?token=…` Twilio calls; set this if signature validation fails behind a proxy |

## Env vars — SvelteKit app (Vercel)
| Var | Required | Notes |
|---|---|---|
| `RELAY_WS_URL` | ✅ | the deployed server, e.g. `wss://rogue-relay.up.railway.app` |
| `RELAY_SHARED_SECRET` | ✅ | same value as the relay server |
| `RELAY_WELCOME_GREETING` | – | first thing the agent says |
| `RELAY_TTS_VOICE` / `RELAY_TTS_PROVIDER` | – | e.g. ElevenLabs voice; defaults to Twilio's |
| `RELAY_STT_PROVIDER` | – | transcription provider override |
| `RELAY_HANDOFF_NUMBER` | – | E.164 number to transfer to when the agent hands off to a human |
| `TWILIO_PHONE_NUMBER` | ✅ | default caller-ID for outbound AI calls |
| `PRACTICE_CALLS_ENABLED` | – | `true` to enable AI **practice** calls (reps rehearse). Off by default. |
| `RELAY_PRACTICE_GREETING` | – | first words the AI buyer says when the rep answers (default `Hello?`) |

## Practice mode (rep training)
The same relay also powers **AI practice calls**: a rep rehearses their pitch against an
AI that role-plays a buyer persona, then gets coached.

```
/api/twilio/practice/start  (authed; gated by PRACTICE_CALLS_ENABLED + Pro tier)
        │  places a call to the rep's own browser client
        ▼
Twilio rings the rep ──► /api/twilio/conversation-relay?mode=practice&persona=…  (TwiML)
        ▼
relay-server  (mode=practice → AI plays the buyer persona, never qualifies)
        │  on hang-up → Claude generates coaching feedback (score + tips)
        ▼
calls row: call_type='practice', outcome='practice', summary=<coaching>
```
- **Gating is server-side:** the start endpoint returns `503` if `PRACTICE_CALLS_ENABLED!=='true'`
  and `402` for free-tier accounts. The phone UI only shows the Practice card when the tier allows it.
- **Personas:** `default`, `skeptical_cfo`, `busy_owner`, `friendly_noncommittal`, `gatekeeper`
  (passed as `?persona=`). Add more in `PERSONAS` in `server.js`.

## Use it
```bash
# place an AI-qualification call (authed — send the user's Supabase bearer token)
curl -X POST https://lead-os-livid.vercel.app/api/twilio/conversation-relay/start \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"phone_number":"+16125550123"}'
```
The agent qualifies the prospect, books a callback, or hands off to a human; the
transcript + outcome land on the `calls` row (visible in the dialer/phone history).

## Notes & hardening
- **Auth:** the WS upgrade is gated by `RELAY_SHARED_SECRET` in the URL. For stricter
  security, additionally validate the `X-Twilio-Signature` header on the upgrade request.
- **Latency:** v1 generates each reply fully before speaking (simple + correct). To cut
  perceived latency, stream Claude tokens as `{type:'text', token, last:false}` and mark
  the final token `last:true` (see Twilio's streaming-mode docs) — guard the `<<END>>`
  marker so it's never spoken.
- **Cost:** ConversationRelay bills per minute on top of Claude + STT/TTS. Use a cheap,
  fast model (Haiku) for the loop.
- **Compliance:** AI voice calls are subject to TCPA/consent + (in some states) AI-disclosure
  rules. Keep the greeting honest and respect Do-Not-Call (the start endpoint already blocks DNC).
