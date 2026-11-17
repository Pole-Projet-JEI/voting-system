$envFile = Join-Path $PSScriptRoot '.env.performance'
if (-not (Test-Path -LiteralPath $envFile)) { throw 'Copy .env.performance.example to .env.performance and fill in unique local test values.' }
foreach ($line in Get-Content -LiteralPath $envFile) {
  $trimmed = $line.Trim()
  if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
  $parts = $trimmed -split '=', 2
  if ($parts.Count -ne 2) { continue }
  [Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim().Trim('"').Trim("'"), 'Process')
}
$expectedDb = "voting_performance_test_$($env:TEST_RUN_ID)"
if ($env:TEST_DB_NAME -ne $expectedDb) { throw 'TEST_DB_NAME must be voting_performance_test_<TEST_RUN_ID>.' }
$env:BASE_URL = 'http://127.0.0.1:3180'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
