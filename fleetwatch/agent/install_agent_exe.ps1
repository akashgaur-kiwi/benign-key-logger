# Installs the compiled agent.exe (no Python needed on the target PC). Run elevated.
# Place agent.exe, agent_config.ini and CONSENT_NOTICE.txt next to this script first.
#
# Usage:  powershell -ExecutionPolicy Bypass -File install_agent_exe.ps1

$ErrorActionPreference = "Stop"
$InstallDir = "C:\Program Files\FleetWatch"
$Src        = $PSScriptRoot

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Copy-Item "$Src\agent.exe"          $InstallDir -Force
Copy-Item "$Src\agent_config.ini"   $InstallDir -Force
Copy-Item "$Src\CONSENT_NOTICE.txt" $InstallDir -Force -ErrorAction SilentlyContinue

$taskName  = "FleetWatchAgent"
$action    = New-ScheduledTaskAction -Execute "$InstallDir\agent.exe"
$trigger   = New-ScheduledTaskTrigger -AtLogOn
$settings  = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -GroupId "BUILTIN\Users" -RunLevel Limited

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
    -Settings $settings -Principal $principal -Force | Out-Null

if (Test-Path "$InstallDir\CONSENT_NOTICE.txt") { Start-Process notepad.exe "$InstallDir\CONSENT_NOTICE.txt" }
Write-Host "Installed. Starts at next logon. Start now: Start-ScheduledTask -TaskName $taskName"
