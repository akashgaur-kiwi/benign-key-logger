# Removes the FleetWatch agent. Run elevated.
Unregister-ScheduledTask -TaskName "FleetWatchAgent" -Confirm:$false -ErrorAction SilentlyContinue
Remove-Item "C:\Program Files\FleetWatch" -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "FleetWatch agent removed."
