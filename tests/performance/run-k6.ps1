param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('auth', 'voting', 'admin', 'statistics', 'sse')]
  [string]$Suite
)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\load-env.ps1"
& node "$PSScriptRoot\preflight.mjs"
if ($LASTEXITCODE -ne 0) { throw 'Dedicated test environment preflight failed.' }
$env:TARGET_RECEIPT = '.test-data/target.json'
$env:TEST_VOTERS_FILE = '.test-data/voter-codes.json'
$env:SESSION_FILE = '.test-data/sessions.json'
$scriptPath = "tests/performance/$Suite.js"
if ($Suite -eq 'voting') {
  $out = 'tests/performance/.test-data/vote-output.jsonl'
  & k6 run --out "json=$out" $scriptPath
  $k6Code = $LASTEXITCODE
  & docker compose --env-file "$PSScriptRoot\.env.performance" -f "$PSScriptRoot\docker-compose.test.yml" exec --env "TEAM_ID=$env:TEAM_ID" -T backend node /perf/verify-votes.mjs
  $auditCode = $LASTEXITCODE
  if ($k6Code -ne 0 -or $auditCode -ne 0) { throw "Voting run or read-only database audit failed (k6=$k6Code, audit=$auditCode)." }
} else {
  & k6 run $scriptPath
  if ($LASTEXITCODE -ne 0) { throw "k6 $Suite run failed." }
}
