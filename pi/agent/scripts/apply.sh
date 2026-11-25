#!/usr/bin/env bash
# Installs the launchd agent that runs the Pi session clean-up every
# Sunday at 04:00. Safe to rerun: bootout then bootstrap replaces the
# existing agent.
set -euo pipefail

self="$(cd "$(dirname "$0")" && pwd)"
CLEAN="$self/clean-sessions.sh"
chmod +x "$CLEAN"

AGENT_ID="com.lamiphil.pi-clean-sessions"
AGENT_PLIST="$HOME/Library/LaunchAgents/$AGENT_ID.plist"
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$AGENT_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$AGENT_ID</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$CLEAN</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Weekday</key><integer>0</integer>
    <key>Hour</key><integer>4</integer>
    <key>Minute</key><integer>0</integer>
  </dict>
  <key>RunAtLoad</key><false/>
  <key>StandardOutPath</key><string>/tmp/$AGENT_ID.log</string>
  <key>StandardErrorPath</key><string>/tmp/$AGENT_ID.log</string>
</dict>
</plist>
EOF
launchctl bootout "gui/$(id -u)/$AGENT_ID" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$AGENT_PLIST"

echo "Installed $AGENT_ID (Sun 04:00)."
