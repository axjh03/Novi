# Novi web portal and access backend

A separate Next.js app containing the monochrome landing page, management portal, and JSON backend used by the Electron app. Prisma 6 and SQLite provide a runnable sample database. No registration endpoint is exposed.

## Local setup

From the repository root (use `npm.cmd` if PowerShell blocks npm scripts):

```sh
npm --prefix webapp install
npm run web:setup
npm run web:dev
# A second terminal, for Electron:
npm run dev
```

Open http://localhost:3000. Setup creates `webapp/.env.access` with generated secrets and passwords, migrates a separate `prisma/access.db`, and seeds sample accounts. It preserves existing `.env`, `prisma/dev.db`, legacy records, and local desktop history. Running setup again preserves passwords and license assignments.

| Identity | Username | Password source |
| --- | --- | --- |
| Administrator | `admin` | `ADMIN_PASSWORD` in `.env.access` |
| Standalone owner | `standalone` | `DEMO_PASSWORD` |
| Corporation | `corporation` | `DEMO_PASSWORD` |
| Sub-corporation | `subcorp` | `DEMO_PASSWORD` |
| Standalone desktop | `standalone.desktop` | `DEMO_PASSWORD` |
| Sub-corporation desktop | `studio.desktop` | `DEMO_PASSWORD` |

These passwords are generated locally, never committed or displayed in the sign-in page. Desktop accounts are eligible only in Electron. The other four identities sign in through the portal. Seeded owners have no real provider keys: add your provider credential and a model ID before using AI.

## Account rules

```text
Administrator (one)
├── Standalone owner
│   └── Licensed desktop accounts → one active device each
└── Corporation
    └── Sub-corporations
        └── Licensed desktop accounts → one active device each
```

| Role | Creates | Manages API keys | Desktop eligible |
| --- | --- | --- | --- |
| Admin | All other account types | No | No |
| Standalone | Own licensed accounts | Own keys | No |
| Corporation | Own sub-corporations | Own keys | No |
| Sub-corporation | Own licensed accounts | Own keys | No |
| Licensed account | None | Read-only inherited connections | Yes |

The admin can edit usernames/names, suspend/reactivate accounts, reset anyone's password (including their own), and delete account branches. Corporations can reset passwords for their sub-corporations and licensed desktop descendants; sub-corporations can reset passwords for their licensed desktop accounts. Deletion is permanent soft deletion: descendants and licenses are disabled, sessions revoked, and historical assignments retained. Roles and parent relationships cannot be changed. Search by username, filter by type/parent, or inspect the expandable organization tree with online devices. The admin can end device sessions from the user list.

## Licenses and purchase requests

Keys are generated with cryptographic randomness in `XXXX-XXXX-XXXX-XXXX` format. A license is issued to a standalone or sub-corporation owner and permanently bound when that owner creates a desktop account. Each licensed account has one license. Database constraints and triggers prevent reassignment, owner changes, key changes, deletion, and revival of terminated licenses. **Use migrations, not `prisma db push`, because the triggers and partial unique admin index are part of the migration.**

Admin renewal accepts days, calendar months, or calendar years; it extends from the later of now and the current expiry. Month/year extensions clamp to the last valid calendar day. Termination is irreversible. The portal shows expiry, remaining days, assignment, and current status.

The license inventory groups by owner by default, with assigned/unassigned views, owner/account/status filters, and search across keys, names, and usernames. Sort by owner, assigned account, expiry, or issue date. Pagination shows 20 rows by default (50/100 optional); filtering and sorting apply to the full authorized inventory before pagination. License data still comes from the existing workspace state endpoint.

Activity shows only account and license changes, including password resets and licenses issued through approved requests. Sign-ins, sessions, API keys, and unfulfilled requests are excluded from the view; audit records are retained. Its admin-only endpoint filters the complete history before returning 20 events per page, with event type, inclusive date/time range, and newest/oldest ordering. Date inputs use the browser's local time zone and include the entire ending minute.

Purchases use admin-approved requests with quantity and term. Approval atomically issues the requested licenses; a request cannot be fulfilled twice. This implementation does not charge cards or imply a successful payment. Automated checkout requires a payment provider, pricing, and verified payment webhooks.

## Sessions and JWTs

Passwords use bcrypt with cost 12, a 12-character minimum, and a 72-byte maximum. Usernames are case-insensitive. Failed sign-in attempts are throttled in the database (10 attempts per username per 15 minutes).

JWTs use HS256, an explicit issuer, an 8-hour expiry, and separate `portal` / `desktop` audiences. JWT subjects and session IDs are checked against the database on every authenticated backend request; roles and access are taken from live records. The web token is in an HttpOnly, SameSite=Strict cookie (Secure in production). Mutations require JSON and validate browser Origin. Tokens are never kept in browser localStorage. Desktop JWTs stay in Electron main and use OS encrypted storage for restart recovery.

A unique nullable `activeSlot` in `AccessSession` atomically reserves each desktop account. Password-only login cannot replace a live session, even with the same device identifier. Electron sends a heartbeat every 20 seconds. A session with no heartbeat for 90 seconds loses its lease, so another device may sign in; until one does, the same session can resume after a network outage. Sign-out and normal app exit release it. Admin resets, suspension, deletion, termination, and session revocation invalidate access. Active desktop work stops at the next validation/heartbeat (up to roughly 20 seconds plus network timeout); new sends validate before contacting the provider. An unreachable server never ends a desktop session. Sessions require sign-in again after 8 hours; there is no unlimited refresh-token lifetime or offline license mode.

## API management

Owners can add multiple keys per provider, rename/rotate/remove them, and specify a model. Available providers: OpenAI, Anthropic, Gemini, and Kimi (Moonshot AI). Keys saved for retired providers are no longer delivered to desktop accounts. API secrets use AES-256-GCM with a separate 32-byte server key. Portal responses contain metadata and the last four characters only.

Standalone desktop accounts inherit the standalone owner's keys. Sub-corporation desktop accounts inherit both sub-corporation and parent corporation keys. Credentials are delivered over the authenticated desktop API into Electron main-process memory; the renderer receives only nickname, owner, provider, model, and availability. Settings has separate General and API management tabs. Desktop users can enable/disable connections and select one active connection; they cannot add/edit/delete owner keys or change destinations. Changes sync on heartbeat or Refresh. This is a managed credential distribution design; a server-side inference gateway would be needed if secrets must never reach the user's machine.

## Backend endpoints

All paths use `/api/control/`. Success responses are `{ data: ... }`, failures `{ error: string }` with an appropriate HTTP status.

| Endpoint | Methods | Purpose |
| --- | --- | --- |
| `login` | POST | Username/password, portal role or desktop audience/device metadata |
| `logout` | POST | Revoke current session |
| `state` | GET | Authorized portal account tree, licenses, devices, requests, masked keys |
| `activity` | GET | Admin account/license audit history; `page`, `event`, `sort=asc\|desc`, `from`/`to` as ISO timestamps with time zone; 20 per page |
| `desktop` | GET | Validate license, renew heartbeat, return inherited credentials to main |
| `accounts` | POST | Create authorized account; desktop creation binds license atomically |
| `accounts/:id` | PATCH, DELETE | Admin edit, password reset, status, permanent branch deletion |
| `licenses` | POST | Admin issuance |
| `licenses/:id` | PATCH | Admin renewal or termination |
| `sessions/:id` | DELETE | Admin force logout |
| `credentials` | POST | Owner key creation |
| `credentials/:id` | PATCH, DELETE | Owner key update/removal |
| `requests` | POST | License purchase request |
| `requests/:id` | PATCH | Admin approve/fulfill or reject |

Legacy `/api/v1/*` prototype endpoints return 410 through `src/proxy.ts`. Their source and database tables remain for deliberate data migration; old local/legacy accounts are not silently granted new permissions. The new schema uses `AccessAccount`, `AccessLicense`, `AccessSession`, `ManagedCredential`, `LicenseRequest`, `AccessAudit`, and `LoginThrottle`.

## Deployment and checks

For a fresh deployment, copy `.env.example` to `.env.access` or provide environment variables, set unique `ACCESS_JWT_SECRET` and `ACCESS_ENCRYPTION_KEY`, set `ADMIN_PASSWORD`, disable `SEED_DEMO`, and set `PORTAL_ORIGIN` to the external HTTPS origin. Do not run the local demo setup against production. Keep the encryption key backed up with the database; changing it makes existing API credentials unreadable. JWT secret rotation invalidates sessions. The seed does not overwrite existing passwords.

```sh
npm run db:generate
npm run db:deploy
npm run db:seed
npm run build
npm start
npm run typecheck
npm run test:access
```

Use persistent storage for SQLite and back up the database. This sample deployment targets one persistent application host. A multi-host deployment needs a shared database and equivalent constraints/migrations for that database. The desktop launch environment must set `NOVI_ACCESS_URL` to the server's HTTPS origin. No live payment processing or paid-provider smoke call is included.

The access integration test uses an isolated temporary database and covers role/tenant isolation, single admin, immutable bindings, concurrent desktop login, crash lease recovery, session revocation, API inheritance, purchase fulfillment, deletion, and calendar renewal.
