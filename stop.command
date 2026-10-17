#!/bin/bash
# Reverse Reporting beenden: Webserver stoppen und Gemma aus dem Arbeitsspeicher nehmen.
cd "$(dirname "$0")" || exit 1
MODEL="${RR_MODEL:-gemma3:27b}"
if [ -f .rr-web.pid ]; then kill "$(cat .rr-web.pid)" 2>/dev/null; rm -f .rr-web.pid; echo "Webserver beendet."; fi
[ -x /Applications/Ollama.app/Contents/Resources/ollama ] && PATH="/Applications/Ollama.app/Contents/Resources:$PATH"
if command -v ollama >/dev/null 2>&1; then ollama stop "$MODEL" 2>/dev/null && echo "$MODEL aus dem Speicher genommen."; fi
echo "Fertig."
