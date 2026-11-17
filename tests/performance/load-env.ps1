$envFile = if ($env:PERFORMANCE_ENV_FILE) { (Resolve-Path $env:PERFORMANCE_ENV_FILE).Path } else { Join-Path $PSScriptRoot '.env.performance' }
if (-not (Test-Path -LiteralPath $envFile)) { throw 'Copy .env.performance.example to .env.performance and fill in unique local test values.' }
foreach ($line in Get-Content -LiteralPath $envFile) {
  $trimmed = $line.Trim()
  if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
  $parts = $trimmed -split '=', 2
  if ($parts.Count -ne 2) { continue }
  [Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim().Trim('"').Trim("'"), 'Process')
}
$expectedDbs = @("voting_performance_test_$($env:TEST_RUN_ID)", "voting_integration_test_$($env:TEST_RUN_ID)")
if ($env:TEST_DB_NAME -notin $expectedDbs) { throw 'TEST_DB_NAME must match TEST_RUN_ID using an allowlisted test database prefix.' }
$env:INTEGRATION_COMPOSE_PROJECT = $env:INTEGRATION_COMPOSE_PROJECT ?? 'voting-performance-test'
$env:API_PORT = $env:API_PORT ?? '3180'
$env:BASE_URL = "http://127.0.0.1:$($env:API_PORT)"
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
