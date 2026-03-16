$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $repoRoot

if (!(Test-Path ".\\logs")) {
  New-Item -ItemType Directory -Path ".\\logs" | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$logFile = ".\\logs\\pipeline-worker-$timestamp.log"

$env:APP_ENV = "production"
$env:APP_ROLE = "worker"

py .\pipeline\worker.py *>> $logFile
