# FleetWatch agent installer — run once per PC in an elevated PowerShell (Run as Administrator).
# Registers a scheduled task that starts the agent at every user logon.
#
# Usage:  powershell -ExecutionPolicy Bypass -File install_agent.ps1

$ErrorActionPreference = "Stop"
$InstallDir = "C:\Program Files\FleetWatch"
$Src        = $PSScriptRoot

Write-Host "Installing FleetWatch agent to $InstallDir ..."

# 1. Copy files
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Copy-Item "$Src\agent.py"         $InstallDir -Force
Copy-Item "$Src\agent_config.ini" $InstallDir -Force
Copy-Item "$Src\requirements.txt" $InstallDir -Force
Copy-Item "$Src\CONSENT_NOTICE.txt" $InstallDir -Force -ErrorAction SilentlyContinue

# 2. Find Python (requires Python 3.10+ installed for all users, or use a bundled exe)
$py = (Get-Command pythonw.exe -ErrorAction SilentlyContinue).Source
if (-not $py) { $py = (Get-Command python.exe -ErrorAction SilentlyContinue).Source }
if (-not $py) { throw "Python not found. Install Python 3.10+ (All Users) first, or deploy the PyInstaller .exe build." }

# 3. Install dependencies
Write-Host "Installing Python dependencies ..."
& python.exe -m pip install --quiet -r "$InstallDir\requirements.txt"

# 4. Register a scheduled task that runs at logon for any user
$taskName = "FleetWatchAgent"
$action   = New-ScheduledTaskAction -Execute $py -Argument "`"$InstallDir\agent.py`""
$trigger  = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
# Runs in the interactive user's context so it can read the active window.
$principal = New-ScheduledTaskPrincipal -GroupId "BUILTIN\Users" -RunLevel Limited

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
    -Settings $settings -Principal $principal -Force | Out-Null

Write-Host "Done. The agent will start at the next logon."
Write-Host "To start it now:  Start-ScheduledTask -TaskName $taskName"

# 5. Show the consent notice once (so monitoring is disclosed)
if (Test-Path "$InstallDir\CONSENT_NOTICE.txt") {
    Start-Process notepad.exe "$InstallDir\CONSENT_NOTICE.txt"
}
