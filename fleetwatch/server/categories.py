"""
App classification for productivity reporting.

Each process name (lower-cased, without path) maps to a category.
Edit these lists to match how YOUR company works — e.g. if designers live in
Photoshop, keep it 'productive'; if Slack is a distraction for your team, move it.

Categories: 'productive' | 'unproductive' | 'neutral'
Anything not listed here counts as 'neutral' (you can reclassify later).
"""

PRODUCTIVE = {
    # Office / docs
    "winword.exe", "excel.exe", "powerpnt.exe", "outlook.exe", "onenote.exe",
    "wps.exe", "et.exe", "wpp.exe", "soffice.bin", "acrobat.exe", "acrord32.exe",
    # Dev / IT
    "code.exe", "devenv.exe", "pycharm64.exe", "idea64.exe", "sublime_text.exe",
    "windowsterminal.exe", "cmd.exe", "powershell.exe", "wsl.exe", "putty.exe",
    "git-bash.exe", "docker desktop.exe",
    # Business / comms tools
    "teams.exe", "ms-teams.exe", "zoom.exe", "slack.exe", "anydesk.exe",
    "quickbooks.exe", "tally.exe", "sap.exe", "chrome.exe", "msedge.exe",
    "firefox.exe",  # browsers are neutral-leaning-productive; refine by site if needed
    # Design
    "photoshop.exe", "illustrator.exe", "figma.exe", "afdesign.exe", "blender.exe",
}

UNPRODUCTIVE = {
    # Games
    "steam.exe", "epicgameslauncher.exe", "leagueclient.exe", "valorant.exe",
    "csgo.exe", "minecraft.exe", "roblox.exe", "battle.net.exe",
    # Entertainment / streaming apps
    "spotify.exe", "vlc.exe", "netflix.exe", "wmplayer.exe",
    # Personal chat
    "whatsapp.exe", "telegram.exe", "discord.exe",
}


def categorize(app: str) -> str:
    a = (app or "").lower().strip()
    if a in PRODUCTIVE:
        return "productive"
    if a in UNPRODUCTIVE:
        return "unproductive"
    return "neutral"
