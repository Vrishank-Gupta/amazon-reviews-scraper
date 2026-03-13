$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$taskName = "AmazonVocPipelineWorker"
$powershell = "$env:WINDIR\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"
$scriptPath = Join-Path $repoRoot "ops\\windows\\start_pipeline_worker.ps1"

$action = New-ScheduledTaskAction -Execute $powershell -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Runs the Amazon VOC Windows pipeline worker at user logon" -Force

Write-Host "Registered scheduled task: $taskName"
