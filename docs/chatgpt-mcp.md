# ChatGPT Remote MCP

AI Food Diary exposes a single authenticated Remote MCP endpoint at `/mcp`.
It implements the final MCP `2026-07-28` stateless protocol and rejects legacy
session negotiation, `initialize`, `notifications/initialized`, and
`Mcp-Session-Id`.

## Architecture and trust boundaries

```text
ChatGPT
  -> HTTPS /mcp (protocol metadata + OAuth bearer token)
  -> strict tool schema + central create-only policy
  -> MCP service
  -> explicit repository methods
  -> Prisma transaction
  -> PostgreSQL resource + immutable AiAuditEvent
```

The MCP server never accepts `userId`, `ownerId`, tenant, role, or permission
claims from tool input. Identity comes from the verified OAuth access token and
is checked against the current User row and `tokenVersion` on every request.
All returned resource objects are explicit allowlists; ciphertext, storage
keys, credentials, tokens, internal hostnames, SQL, and stack traces are not
part of tool output.

The official split TypeScript SDK is pinned to
`@modelcontextprotocol/server@2.0.0` with `legacy: "reject"`. Because that SDK
release does not itself reject every request missing the required
`MCP-Protocol-Version` header, `src/lib/mcp/protocol.ts` performs a mandatory
preflight check for all `2026-07-28` headers and `_meta` fields before the SDK
handler runs. This guard must not be removed until an upgraded official SDK is
verified by the protocol regression tests.

## Exposed tools

Read-only tools:

- `list_meals`, `get_meal`, `search_meals`
- `list_saved_foods`, `search_saved_foods`
- `list_water_logs`

Create-only tools:

- `create_meal`
- `create_saved_food`
- `create_water_log`

There is no update, edit, patch, delete, remove, replace, overwrite, upsert,
permission, ownership, SQL, command, restore, or rollback tool. The policy is
default-deny and enforced in the service in addition to the finite registry.
Create operations use generated IDs, unique `(user, AI source, request ID)`
constraints, duplicate detection, and only Prisma `create` calls. They never
use upsert or save-existing semantics.

## OAuth and production setup

The server publishes RFC 9728 protected-resource metadata and OAuth
authorization-server metadata. The authorization-code flow requires PKCE S256,
exact resource audience, exact redirect URI, one-time short-lived codes, and
per-tool least-privilege scopes (`*:read` or `*:create`). The stable ChatGPT
CIMD client metadata URL and connector redirect are enabled by default and
validated server-side.

Set at minimum in production:

```dotenv
MCP_PUBLIC_URL=https://your-domain.example/mcp
MCP_OAUTH_ISSUER=https://your-domain.example
MCP_OAUTH_SECRET=<independent random secret of at least 32 bytes>
MCP_ALLOWED_ORIGINS=https://your-domain.example
```

Then deploy the additive migration and application:

```bash
npm run prisma:deploy
npm run build
```

Production must terminate TLS and must not expose the origin server over plain
HTTP. Keep `MCP_OAUTH_VALIDATE_CIMD=true`. Configure Redis for shared rate
limits in multi-instance deployments; the in-memory fallback is intentionally
per-instance and is only a last-resort limiter.

Connect ChatGPT to `https://your-domain.example/mcp`. Discovery and tool calls
must send `MCP-Protocol-Version: 2026-07-28`, matching `Mcp-Method` (and
`Mcp-Name` where required), and the required protocol metadata under
`params._meta`.

## Audit and human restore

Every successful read, successful create, and failed MCP tool execution appends
an encrypted `AiAuditEvent`. The database trigger rejects UPDATE and DELETE on
that table. AI-created resource rows include creator type, authenticated user,
AI source, request ID, and creation timestamp.

`/api/ai-activity` is a cookie-authenticated Web/App API, not an MCP tool.
Restore requires an explicit confirmation and reason, rechecks ownership, and
compares the exact `updatedAt` version and AI provenance in the delete
predicate. A later human/system/AI edit or attachment therefore produces a
409 conflict rather than a silent overwrite. The original AI event remains;
restore adds STARTED and SUCCEEDED/FAILED compensating audit events.

## Verification and rollback

```bash
npm run test:mcp
npx tsc --noEmit
npm run build
cd mobile && flutter analyze && flutter test
```

The migration is additive. Application rollback is performed by reverting the
application deployment while leaving the new nullable columns/tables in place.
Do not roll back by deleting audit events. The append-only trigger also rejects
`TRUNCATE`, including a cascading full-database wipe; backup/restore procedures
must preserve the audit stream rather than clear it. A schema cleanup, if ever
required, must be a separately reviewed migration after all readers have been
removed and the retention policy has been explicitly approved.

Monitor 401/403/409/429/5xx rates on `/mcp`, `/oauth/*`, and restore routes,
OAuth code redemption failures, MCP latency/timeouts, and failed audit inserts.
