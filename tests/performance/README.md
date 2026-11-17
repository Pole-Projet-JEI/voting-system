# Voting system performance suite

This directory contains k6 API load tests, an event-driven SSE stream test, and read-only vote-result auditing. The suite is restricted to the dedicated local Compose deployment described here. It does not accept the normal API ports or a public hostname.

## Safe local test environment

Prerequisites: Docker Compose, Node.js 22, and k6. Do not run against production or the normal development Compose project.

1. Copy `.env.performance.example` to `.env.performance`; replace every secret with a unique local test value. Choose a new random lowercase hex `TEST_RUN_ID` (16–32 chars) and set `TEST_DB_NAME=voting_performance_test_<same-id>`. Set `TEST_VOTER_CODES_FILE=./.test-data/voter-codes.json`.
2. Create `tests/performance/.test-data/voter-codes.json` as a JSON array of unique, dedicated test codes (each exactly 9 alphanumeric characters). Never use real voter codes. The directory and files are gitignored.
3. Set `SOURCE_REVISION` to `git rev-parse HEAD`, then start only this stack: `docker compose --env-file tests/performance/.env.performance -f tests/performance/docker-compose.test.yml up -d --build`.
4. The dedicated backend image is built from an explicit Dockerfile that copies only server source/package files; it does not copy `server/.env`. Its URI is fixed to the separate Mongo service and the run-specific database. Mongo data/config volumes are named `voting_performance_mongo_data` and `voting_performance_mongo_config`; the API is bound only to `127.0.0.1:3180`. Normal `docker-compose.yml` is unchanged.
5. The application seeds voter rows only when this newly isolated run database is empty, using the explicitly mounted private test-code file. It never clears a database. The session preparer below refuses unknown codes, existing ballots for the target team, a mismatched database, or a mismatched team.
6. Create two fresh pending teams through the test admin UI/API if you intend to run the optional admin transition scenario. For voting, open voting for `TEAM_ID`. Set these IDs locally in `.env.performance`; the team must remain in voting state through session preparation and the vote run.

The backend startup performs its normal bootstrap-admin and seed-if-empty behavior. It is isolated by the unique run database, private code fixture, test-only secrets, separate project/network/volumes, and preflight checks. If startup reports a nonempty collection, it does not reseed; use a new `TEST_RUN_ID` for a clean run. Do not remove volumes or database contents as an automatic test step.

## Target validation and credentials

All run scripts call `preflight.mjs`. It resolves the separate Compose configuration, verifies the project name, loopback-only API binding, test database name, actual running container environment/labels, separate Mongo volume, and a live Mongo connection identity. It writes a 10-minute target receipt in the ignored `.test-data` directory. Every k6 script also requires that receipt, the matching `TEST_RUN_ID`, and the exact allowlisted `BASE_URL=http://127.0.0.1:3180`. Other hosts, including the known public voting host, are rejected.

The preflight is read-only apart from its local receipt. The one exception is the explicit voter session preparation step: it rotates participant session hashes for the dedicated voter rows in the verified run database so the vote benchmark can skip the registration endpoint’s rate limiter. These remain valid signed participant sessions; application authentication middleware is still used. The session file contains raw test codes and cookies and is ignored by git. Keep `.test-data` private and discard it using your local secure-file handling after the run.

`prepare-voters.ps1` records the team counter baseline and creates independent signed sessions. It does not create voters, teams, or votes. It requires the team to be currently voting and every selected test voter to have no vote for that team. Session preparation is an explicit, state-changing operation and must only be run after the local target preflight passes.

## Load profiles

Set `PROFILE=smoke|normal|stress|spike|soak` in `.env.performance`:

| Profile | Schedule | Total duration | Use |
|---|---|---:|---|
| Smoke | Ramp 0→5 over 10s | 10s | Validate a small request flow |
| Normal | Ramp to 20 over 30s, to 50 over 1m, then to 0 over 30s | 2m | Expected concurrent activity model |
| Stress | Ramp to 100 over 1m, to 200 over 1m, then to 0 over 30s | 2m30s | Find bottlenecks |
| Spike | Ramp to 10 over 20s, to 100 over 10s, hold 1m, then ramp down 20s | 1m50s | Sudden activity |
| Soak | Ramp to `SOAK_VUS` over `SOAK_RAMP`, hold for `SOAK_DURATION`, ramp down 30s | Default 13m30s scheduled load | Resource leak/degradation |

Soak defaults are 30 VUs, 1 minute ramp-up, and 12 minutes steady-state. Profiles explicitly set zero graceful-stop/ramp-down delay, so the scheduled durations are the load schedule duration; setup and teardown add their own time. These are harness profiles, not claims about production capacity. For voting, the profile peak must match `VOTER_SESSION_COUNT` (or a larger explicit `REQUIRED_VUS`); there is one prepared identity and one initial vote per VU. The VU parks after its request to avoid repeat votes. Consequently, voter arrival ramps with VU creation; no session is reused to fill a larger ramp. The script fails setup when the fixture does not contain exactly the required distinct sessions.

Initial thresholds are provisional: p95 < 1s, p99 < 2s, HTTP failure rate < 2%, and checks/data consistency > 99%. Tune `P95_MS`, `P99_MS`, and `FAILURE_RATE` for the deployment. Vote success and response correctness have stricter thresholds. Rate-limited or duplicate business responses use explicit expected-status callbacks and separate checks/metrics.

## Run commands (PowerShell)

First set the values in `.env.performance`. The scripts load those values, run the preflight, and use only the dedicated target.

```powershell
.\tests\performance\run-k6.ps1 auth
.\tests\performance\run-k6.ps1 voting
.\tests\performance\run-k6.ps1 admin
.\tests\performance\run-k6.ps1 statistics
.\tests\performance\run-k6.ps1 sse
```

The `voting` wrapper also runs the read-only database audit against the k6 JSON-lines output. The audit must pass as well as k6 thresholds for the wrapper to return success.

### Authentication and rate-limit modes

The backend allows five registrations per 15 minutes per client IP and three admin logins per 15 minutes. Authentication tests deliberately respect these limits; they do not silently disable or override them.

```powershell
$env:AUTH_MODE = 'concurrent'; $env:AUTH_VUS = '5'
.\tests\performance\run-k6.ps1 auth

$env:AUTH_MODE = 'rate-limit'
.\tests\performance\run-k6.ps1 auth

$env:AUTH_MODE = 'invalid-code'
.\tests\performance\run-k6.ps1 auth
```

Concurrent auth is capped at five one-shot VUs, each with a different code. Rate-limit mode sends five valid registrations and a sixth valid-code request from one VU; it expects 201 for the first five, then 429 with retry metadata. Run it against a fresh dedicated backend process (or wait 15 minutes) so earlier requests have not consumed the in-memory IP bucket. Invalid-code mode is a separate one-request check. None of these is a high-VU auth benchmark; the backend limit is the tested behavior.

### Voting benchmark and negative cases

For the benchmark, set `TEAM_ID`, `PROFILE`, and `VOTER_SESSION_COUNT` to the selected profile peak. Set `TEST_RUN_ID` and the matching `TEST_DB_NAME` before bringing up the test stack. Prepare sessions, then run voting:

```powershell
.\tests\performance\prepare-voters.ps1
.\tests\performance\run-k6.ps1 voting
```

Every initial request verifies HTTP 200, `voted: true`, and the submitted `vote` value. `TEST_DUPLICATES=true` sends one alternate vote from the same session after each successful vote and expects the duplicate rejection to preserve the original choice. To exercise independent negative cases, set `VOTING_MODE=negative` and `VOTER_SESSION_COUNT=4`, then recreate the dedicated backend with the updated `.env.performance`, prepare a fresh run database/team fixture, and run the same preparation and voting commands. The four isolated VUs test unauthenticated request, invalid vote value, malformed team ID, and a valid vote followed by a duplicate request. For negative mode, the read-only auditor expects only the duplicate-test voter to have one recorded vote.

The provisioner writes `sessions.json` with the run ID, test database/team, baseline counters for every team, all-voter baseline yes/no ballot totals for the target team, baseline ballots for each selected test voter, identity mapping, and intended choice. k6 emits only run ID, voter index, outcome, and choice tags to `vote-output.jsonl`—not raw voter codes or cookies. The auditor checks that each expected outcome and successful-vote metric is present exactly once, each accepted identity has exactly the expected target-team ballot, rejected identities have no changed ballots, all voter records are independently scanned to count target-team yes/no ballots, those totals match the team counters, every other team counter remains unchanged, and the aggregate counter delta equals successful submissions. It performs queries only and prints PASS/FAIL with the run ID. It does not expose an application endpoint or write to MongoDB. The local test Mongo has no external port; the auditor runs inside the isolated backend container. The code performs read-only queries, though the isolated local Mongo service does not enforce a separate read-only database principal.

Use a new run ID/database and a fresh team for each benchmark. The audit detects missing attempts or unexpected responses rather than accepting a partial run. It does not delete any run data.

### Admin and statistics

Dashboard/admin reads authenticate once in k6 setup, extract `adminToken` from k6’s structured cookie object, and verify that cookie against `/api/admin/teams` before starting. The token is shared among read VUs; the scripts do not log out or change passwords. For state-transition testing, set `ADMIN_TRANSITIONS=true`, `TEAM_ID` and `NEXT_TEAM_ID` to two fresh pending test teams, and ensure no team is currently presenting. A single VU serially selects, attempts a conflicting presenter switch, starts voting, and completes the presentation. It verifies response bodies and `/api/admin/teams` state after each operation, including exactly one presenter before completion and zero afterward. This mutates fixture state; run only on the dedicated test database. Concurrent selection tests are not implemented.

`/api/admin/teams` is the implemented aggregate endpoint; there is no separate statistics route. `statistics.js` validates response structure and numeric counters during concurrent reads. Exact consistency is established by the post-vote audit, not an operator-entered total.

### SSE stream test

The k6 extension was evaluated with k6 2.4.0 and its resolved `xk6-sse` v0.2.0 module. The extension's client object did not expose either documented JavaScript event-handler method in the runtime, so the harness uses `sse-stream.mjs`, a Node.js incremental `fetch()`/`ReadableStream` client. It launches all configured connections concurrently, parses frames as bytes arrive, validates HTTP 200 and `text/event-stream`, receives the initial `connected` event, and keeps accepted streams open until the configured server heartbeat comments arrive. It then cancels each reader and confirms capacity release with a follow-up streamed connection. No fixed sleep is used to infer stream activity. The JSON summary records request/status counts, event/heartbeat counts, connection and stream latency distributions, timeouts, server errors, unexpected disconnects, check pass rate, cleanup results, and the capacity probe. For explicit cap tests it validates the 503 response body as well as status.

Set `SSE_HEARTBEATS` to the number of heartbeat comments required before a planned close (default 1); expected duration follows the configured server heartbeat interval. Set `SSE_TIMEOUT` longer than the expected heartbeat interval plus 5 seconds. For a connection-cap probe, set `SSE_EXPECT_LIMIT=true`, `SSE_MAX_CONNECTIONS` to the backend cap, and `SSE_VUS` above it, on an otherwise quiet dedicated instance. The test expects exactly the allowed number of 200 streams and 503 responses with the expected JSON message for excess attempts. The endpoint has no event ID or server timestamp; replay de-duplication and server-clock delivery latency remain unsupported. There is no public server-side connection-count endpoint; backend logs show accepted connection counts, and the post-close capacity probe verifies that the server releases at least one slot.

## Endpoint inventory (checked against backend source)

| Method/path | Auth and required input | Success | Failure | Load suitability |
|---|---|---|---|---|
| POST `/api/register` | Public; JSON `{code}`; exactly 9 alphanumeric chars | 201 `{status:"succeeded"}`; sets signed HttpOnly `connectionCookie` | 400 malformed/unknown code; 429 registration limit | Auth tests only; each successful registration replaces that voter’s active session |
| GET `/api/isconnected` | Optional signed participant cookie | 200 `{connected:boolean}` | 500 DB error | Read/auth check |
| GET `/api/currentteam` | Public | 200 `{teamID,teamName,description,state}` or null team fields/message | 500 | Read |
| POST `/api/vote/:id` | Participant cookie; ObjectId path; `{vote:"yes"|"no"}` | 200 `{voted:true,message:"Vote recorded successfully",vote}` | 400 invalid vote/ID, inactive team, duplicate; 401 unauthenticated; 404 voter missing; 500 transaction failure | Yes, one unique prepared session per VU |
| GET `/api/hasvoted` | Participant cookie | 200 `{hasVoted,teamId,vote,votedAt}` or no-presenter message | 401 auth; 500 | Read |
| GET `/api/sendvote` | Public SSE; no body | 200 event stream, initial `{"connected":true}` frame, `: heartbeat` at configured interval | 503 `{message:"SSE connection limit reached"}`; 500 before headers | Long-lived probe only in built-in k6 script |
| POST `/api/admin/login` | Public; `{username,secretKey}` | 200 `{success:true,admin:true,mustChangePassword,message}`; `adminToken` cookie | 400 missing key; 401 invalid credentials; 429 admin limit; 500 | One setup login per script |
| GET `/api/admin/auth` | Admin cookie optional | 200 `{authenticated:true,admin:true,username,mustChangePassword}` | 401 missing/invalid/expired/revoked token | Read |
| POST `/api/admin/logout` | Admin cookie optional | 200 `{success:true,message}`; clears cookie | 500 revocation error | Low volume; revokes that token |
| POST `/api/admin/password` | Admin cookie; `{currentPassword,newPassword}` | 200 `{success:true,mustChangePassword:false}`; sets new token cookie | 400 weak/missing password; 401 bad password or missing auth; 403 invalid/revoked auth; 500 | Excluded; credential mutation |
| GET `/api/admin/teams` | Admin cookie | 200 `{count,teams}` with team counters/state | 401 missing auth; 403 invalid/expired/revoked auth; 500 | Dashboard reads |
| GET `/api/admin/presenting` | Admin cookie | 200 `{presenting:false,team:null}` or `{presenting:true,team}` | 401 missing auth; 403 invalid/expired/revoked auth; 500 | Dashboard read |
| POST `/api/admin/presenting` | Admin cookie; `{teamId}` | 200 `{success,message,team}` | 400 missing ID/already presented/another presenter active; 404 team missing; 401 missing auth; 403 invalid/revoked auth; 500 cast/transaction error | Stateful; serialize |
| POST `/api/admin/presenting/voting` | Admin cookie; no body | 200 `{success,message,team}` | 400 no active presenter; 401 missing auth; 403 invalid/revoked auth; 500 | Stateful; serialize |
| DELETE `/api/admin/presenting` | Admin cookie; no body | 200 `{success,message,team}` or no-presenter message | 401 missing auth; 403 invalid/revoked auth; 500 | Stateful; serialize |
| POST `/api/admin/team` | Admin cookie; `{teamName,description?}` | 201 `{success,message,team}` | 400 missing name; 409 duplicate name; 401 missing auth; 403 invalid/revoked auth; 500 | Excluded; creates fixture data |
| PUT `/api/admin/team/:id` | Admin cookie; `{teamName?,description?}`; at least one nonempty field | 200 `{success,message,team}` | 400 no fields; 404 missing team; 409 duplicate name; 401 missing auth; 403 invalid/revoked auth; 500 invalid ID/other error | Excluded; mutates fixture |
| DELETE `/api/admin/team/:id` | Admin cookie; ObjectId path | 200 `{success,message,team}` | 400 currently presenting/already presented; 404 missing team; 401 missing auth; 403 invalid/revoked auth; 500 invalid ID/other error | Excluded; destructive |

The admin middleware returns 401 when no cookie is supplied and 403 when a token is invalid, expired, or revoked. Browser/admin cookies are not used to bypass server auth; the scripts send the returned cookie to protected routes.

## Limitations

- k6 cannot verify recorded ballots by response alone; a dedicated test Mongo database and matching private session fixture are prerequisites for the required post-run audit.
- Authentication throughput is deliberately bounded by the implemented registration rate limit (five requests per IP per 15 minutes). No test-only security override exists.
- Admin login is limited to three attempts per IP per 15 minutes; repeated script setup logins may require waiting or restarting the dedicated backend.
- SSE uses the Node.js streaming alternative because the resolved k6 extension did not expose its documented client event API. Automatic reconnect and server-clock delivery latency are not tested; the endpoint has no event ID or timestamp.
- The admin transition test is serialized. Concurrent conflicting admin state changes are intentionally not generated.
- Default thresholds are starting values, not production capacity claims.
