$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\load-env.ps1"
$env:SOURCE_REVISION = (git rev-parse HEAD).Trim()
& node "$PSScriptRoot\preflight.mjs"
if ($LASTEXITCODE -ne 0) { throw 'Dedicated test environment preflight failed.' }

$webSession = $null
$loginBody = @{ username = $env:ADMIN_USERNAME; secretKey = $env:ADMIN_PASSWORD } | ConvertTo-Json -Compress
$login = Invoke-RestMethod -Uri "$($env:BASE_URL)/api/admin/login" -Method Post -ContentType 'application/json' -Body $loginBody -SessionVariable webSession
if (-not $login.success -or -not $webSession) { throw 'Test admin login failed while preparing the isolated voting fixture.' }

$teamName = "performance-$($env:PROFILE)-$($env:TEST_RUN_ID)"
$teamBody = @{ teamName = $teamName; description = "Isolated $($env:PROFILE) voting benchmark" } | ConvertTo-Json -Compress
$created = Invoke-RestMethod -Uri "$($env:BASE_URL)/api/admin/team" -Method Post -WebSession $webSession -ContentType 'application/json' -Body $teamBody
if (-not $created.success -or $created.team._id -notmatch '^[a-f0-9]{24}$') { throw 'Unable to create a fresh test team in the isolated run database.' }
$teamId = [string]$created.team._id

$presentBody = @{ teamId = $teamId } | ConvertTo-Json -Compress
$presenting = Invoke-RestMethod -Uri "$($env:BASE_URL)/api/admin/presenting" -Method Post -WebSession $webSession -ContentType 'application/json' -Body $presentBody
if (-not $presenting.success -or [string]$presenting.team._id -ne $teamId) { throw 'Unable to select the fresh benchmark team.' }
$voting = Invoke-RestMethod -Uri "$($env:BASE_URL)/api/admin/presenting/voting" -Method Post -WebSession $webSession
if (-not $voting.success -or [string]$voting.team._id -ne $teamId -or $voting.team.state -ne 'voting') { throw 'Unable to open voting for the fresh benchmark team.' }

$envPath = Join-Path $PSScriptRoot '.env.performance'
$lines = foreach ($line in (Get-Content -LiteralPath $envPath)) {
  if (($line -split '=', 2)[0] -eq 'TEAM_ID') { "TEAM_ID=$teamId" } else { $line }
}
[IO.File]::WriteAllLines($envPath, [string[]]$lines, [Text.UTF8Encoding]::new($false))
Write-Output "Prepared fresh voting team for PROFILE=$($env:PROFILE), VOTER_SESSION_COUNT=$($env:VOTER_SESSION_COUNT), TEAM_ID=$teamId"
