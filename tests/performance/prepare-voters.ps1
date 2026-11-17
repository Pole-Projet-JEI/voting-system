$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\load-env.ps1"
$composeEnvFile = $envFile
& node "$PSScriptRoot\preflight.mjs"
if ($LASTEXITCODE -ne 0) { throw 'Dedicated test environment preflight failed.' }
$output = & docker compose --env-file $composeEnvFile -f "$PSScriptRoot\docker-compose.test.yml" exec --env "TEAM_ID=$env:TEAM_ID" -T backend node /perf/provision-sessions.mjs
if ($LASTEXITCODE -ne 0) { throw 'Voter session provisioning failed.' }
$sessionPath = Join-Path $PSScriptRoot ".test-data\sessions-$($env:TEST_RUN_ID).json"
$output | Set-Content -LiteralPath $sessionPath -NoNewline
Write-Output "Created private, run-scoped authenticated session fixture at $sessionPath"
