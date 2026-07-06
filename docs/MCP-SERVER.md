# RogueOS MCP Server

`POST /api/mcp` is a Model Context Protocol server (Streamable-HTTP transport, protocol `2025-03-26`).
Any MCP client — Guppy, Claude Desktop, Claude Cowork — can operate the CRM through it.

## Tools

| Tool | Scope | Does |
|---|---|---|
| `search_contacts` | read | Find contacts by name/company/email/phone → ids |
| `pipeline_summary` | read | Weighted forecast (overall / month / quarter) + won actuals |
| `todays_agenda` | read | Tasks due + today's appointments |
| `list_appointments` | read | Upcoming appointments (N days) |
| `create_contact` | write | Create contact (dedupes by phone/email) |
| `log_call` | write | Log a call outcome against a contact (DNC honored) |
| `create_task` | write | Task/reminder, optional contact link + due-in-hours |
| `create_appointment` | write | Book an appointment at an ISO datetime |
| `add_deal` | write | Create a pipeline deal |

All tools are tenant-scoped to the token owner's effective agency account. Rate limit: 240 req/min per identity+IP.

## Auth

1. RogueOS → Settings → API Tokens → create a token.
   - Scopes: `["read"]` for a read-only assistant, `["read","write"]` for full operation.
   - The `ldo_…` value is shown once. **Treat it like a password — it authenticates the whole API, not just MCP.**
2. Send it as `Authorization: Bearer ldo_…` on every request.

## Connecting from Guppy

Workspace → Tools → MCP servers → Add:
- **Command or URL:** `https://<your-deployment>/api/mcp`
- **Env:** `MCP_BEARER=ldo_…`

Guppy auto-detects the URL as a remote (Streamable-HTTP) server. Its models can then call the
tools conversationally from any surface ("what's my pipeline this month", "log that call as
appointment set", "book Tuesday 3pm with the lead from yesterday").

## Connecting from Claude (Desktop / Cowork)

Add a custom connector with the same URL; supply the bearer token when prompted
(or via an `Authorization` header field if the client exposes one).

## Protocol details (for other client implementations)

- JSON-RPC 2.0 over POST; responses are `application/json` (no SSE streams).
- `initialize` → `serverInfo`, `capabilities.tools`, and a `Mcp-Session-Id` header
  (stateless server — the session id is optional on subsequent calls).
- Notifications (requests without `id`) → `202` empty body.
- `tools/call` errors return `result.isError: true` with a text explanation
  (protocol-level errors use standard JSON-RPC `error` objects).
- `GET /api/mcp` → 405 (no server-push stream); `DELETE` → 200 no-op.

## Local testing

```bash
TOKEN=ldo_...
curl -s https://<deployment>/api/mcp -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'
curl -s https://<deployment>/api/mcp -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
curl -s https://<deployment>/api/mcp -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"pipeline_summary","arguments":{}}}'
```
