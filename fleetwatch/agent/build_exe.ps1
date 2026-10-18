# Build a single agent.exe so you can deploy to PCs that have no Python installed.
# Run on ONE Windows machine with Python 3.10+; ship the resulting dist\agent.exe.
#
# Usage:  powershell -ExecutionPolicy Bypass -File build_exe.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "Installing build dependencies ..."
python -m pip install --quiet --upgrade pip pyinstaller -r requirements.txt

Write-Host "Building agent.exe (windowed, no console) ..."
# --noconsole hides the terminal; --name sets the exe name.
pyinstaller --onefile --noconsole --name agent `
    --hidden-import win32timezone `
    agent.py

Write-Host ""
Write-Host "Done -> dist\agent.exe"
Write-Host "Deploy dist\agent.exe together with agent_config.ini and CONSENT_NOTICE.txt."
Write-Host "Then register it with install_agent_exe.ps1 on each PC."
