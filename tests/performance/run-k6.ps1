param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('auth', 'voting', 'admin', 'statistics', 'sse')]
  [string]$Suite
)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\load-env.ps1"
$composeEnvFile = $envFile
& node "$PSScriptRoot\preflight.mjs"
if ($LASTEXITCODE -ne 0) { throw 'Dedicated test environment preflight failed.' }
$env:TARGET_RECEIPT = ".test-data/target-$($env:TEST_RUN_ID).json"
$env:TEST_VOTERS_FILE = (Join-Path $PSScriptRoot $env:TEST_VOTER_CODES_FILE)
$env:SESSION_FILE = if ($Suite -eq 'voting') { ".test-data/sessions-$($env:TEST_RUN_ID).json" } else { '' }
$env:VOTE_OUTPUT_FILE = ".test-data/vote-output-$($env:TEST_RUN_ID).jsonl"
$scriptPath = "tests/performance/$Suite.js"
$summaryPath = "tests/performance/.test-data/k6-summary-$($env:TEST_RUN_ID)-$Suite.json"
$summaryArgs = @('--summary-trend-stats', 'avg,min,med,max,p(90),p(95),p(99)', '--summary-export', $summaryPath)
$k6Env = @(
  '--env', "BASE_URL=$env:BASE_URL",
  '--env', "TEST_RUN_ID=$env:TEST_RUN_ID",
  '--env', "TEST_DB_NAME=$env:TEST_DB_NAME",
  '--env', "INTEGRATION_COMPOSE_PROJECT=$env:INTEGRATION_COMPOSE_PROJECT",
  '--env', "TARGET_RECEIPT=$env:TARGET_RECEIPT",
  '--env', "TEST_VOTERS_FILE=$env:TEST_VOTERS_FILE",
  '--env', "SESSION_FILE=$env:SESSION_FILE",
  '--env', "VOTE_OUTPUT_FILE=$env:VOTE_OUTPUT_FILE",
  '--env', "TEAM_ID=$env:TEAM_ID",
  '--env', "PROFILE=$env:PROFILE",
  '--env', "VOTING_MODE=$env:VOTING_MODE",
  '--env', "TEST_DUPLICATES=$env:TEST_DUPLICATES",
  '--env', "SSE_VUS=$env:SSE_VUS",
  '--env', "SSE_TIMEOUT=$env:SSE_TIMEOUT",
  '--env', "SSE_EXPECT_LIMIT=$env:SSE_EXPECT_LIMIT",
  '--env', "SSE_MAX_CONNECTIONS=$env:SSE_MAX_CONNECTIONS",
  '--env', "SSE_HEARTBEATS=$env:SSE_HEARTBEATS"
)
if ($Suite -eq 'voting') {
  $out = "tests/performance/.test-data/vote-output-$($env:TEST_RUN_ID).jsonl"
  & k6 run @k6Env @summaryArgs --out "json=$out" $scriptPath
  $k6Code = $LASTEXITCODE
  & docker compose --env-file $composeEnvFile -f "$PSScriptRoot\docker-compose.test.yml" exec --env "TEAM_ID=$env:TEAM_ID" --env "SESSION_FILE=/run/perf/sessions-$($env:TEST_RUN_ID).json" --env "VOTE_OUTPUT_FILE=/run/perf/vote-output-$($env:TEST_RUN_ID).jsonl" -T backend node /perf/verify-votes.mjs
  $auditCode = $LASTEXITCODE
  $diagnosticPath = Join-Path $PSScriptRoot ".test-data\backend-logs-$($env:TEST_RUN_ID)-voting.txt"
  & docker compose --env-file $composeEnvFile -f "$PSScriptRoot\docker-compose.test.yml" logs --no-color --since 2h --tail 5000 backend 2>&1 | Set-Content -LiteralPath $diagnosticPath
  if ($k6Code -ne 0 -or $auditCode -ne 0) { throw "Voting run or read-only database audit failed (k6=$k6Code, audit=$auditCode)." }
} else {
  if ($Suite -eq 'sse') {
    $env:TARGET_RECEIPT = Join-Path $PSScriptRoot ".test-data\target-$($env:TEST_RUN_ID).json"
    $env:SSE_SUMMARY_PATH = Join-Path $PSScriptRoot ".test-data\sse-summary-$($env:TEST_RUN_ID).json"
    & node "$PSScriptRoot\sse-stream.mjs"
    $sseCode = $LASTEXITCODE
    $diagnosticPath = Join-Path $PSScriptRoot ".test-data\backend-logs-$($env:TEST_RUN_ID)-sse.txt"
    & docker compose --env-file $composeEnvFile -f "$PSScriptRoot\docker-compose.test.yml" logs --no-color --since 5m --tail 500 backend 2>&1 | Set-Content -LiteralPath $diagnosticPath
    if ($sseCode -ne 0) { throw 'Incremental SSE stream test failed.' }
    return
  }
  & k6 run @k6Env @summaryArgs $scriptPath
  $k6Code = $LASTEXITCODE
  if ($k6Code -ne 0) { throw "k6 $Suite run failed." }
}
