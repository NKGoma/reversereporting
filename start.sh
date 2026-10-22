#!/bin/bash
# Reverse Reporting lokal starten: prüft Ollama und Gemma, startet einen Webserver
# nur für diesen Rechner (127.0.0.1) und öffnet die App im Browser.
# Auf dem Mac: start.command doppelklicken (ruft dieses Skript auf).

cd "$(dirname "$0")" || exit 1
PORT="${RR_PORT:-8080}"
MODEL="${RR_MODEL:-gemma3:27b}"
OLLAMA="http://127.0.0.1:11434"
URL="http://localhost:$PORT/"

bold() { printf "\n\033[1m%s\033[0m\n" "$1"; }
pause() { if [ -t 0 ]; then read -r -p "Enter drücken zum Schließen … " _; fi; }
up() { curl -s -o /dev/null --max-time 2 "$OLLAMA/api/tags"; }
open_url() { if command -v open >/dev/null 2>&1; then open "$1"; elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$1" >/dev/null 2>&1; else echo "Bitte im Browser öffnen: $1"; fi; }

bold "Reverse Reporting · läuft komplett auf diesem Gerät"

# 1. Ollama installiert?
[ -x /Applications/Ollama.app/Contents/Resources/ollama ] && PATH="/Applications/Ollama.app/Contents/Resources:$PATH"
if ! command -v ollama >/dev/null 2>&1; then
  echo "Ollama ist nicht installiert. Download: https://ollama.com/download"
  echo "Ohne Ollama läuft die App trotzdem – nur ohne Gemma (Regel-Engine)."
  NO_OLLAMA=1
fi

# 2. Ollama läuft?
if [ -z "$NO_OLLAMA" ] && ! up; then
  echo "Starte Ollama …"
  if [ -d /Applications/Ollama.app ]; then open -a Ollama; else nohup ollama serve >/tmp/rr-ollama.log 2>&1 & fi
  for _ in $(seq 1 30); do up && break; sleep 1; done
  up || echo "Ollama antwortet nicht. Im Terminal prüfen: ollama serve"
fi

# 3. Modell vorhanden?
if [ -z "$NO_OLLAMA" ] && up; then
  if ollama list 2>/dev/null | awk 'NR>1 {print $1}' | grep -q "^${MODEL}"; then
    echo "Modell $MODEL ist da."
  else
    echo "Das Modell $MODEL fehlt (einmaliger Download, ca. 17 GB)."
    read -r -p "Jetzt herunterladen? [J/n] " answer
    case "$answer" in
      n|N) echo "Ohne Gemma läuft nur die Regel-Engine." ;;
      *) ollama pull "$MODEL" ;;
    esac
  fi
fi

# 4. Analyse-Dienst (Python, liefert auch die App aus) – nur für diesen Rechner
if curl -s -o /dev/null --max-time 2 "$URL"; then
  echo "Die App läuft schon auf $URL"
  open_url "$URL"
  exit 0
fi
[ -x "$HOME/.local/bin/uv" ] && PATH="$HOME/.local/bin:$PATH"
if ! command -v uv >/dev/null 2>&1; then
  echo "Für die Archiv-Analyse wird 'uv' gebraucht (Python-Umgebung, einmalig ca. 30 MB)."
  read -r -p "Jetzt installieren? [J/n] " answer
  case "$answer" in
    n|N) ;;
    *) curl -LsSf https://astral.sh/uv/install.sh | sh && PATH="$HOME/.local/bin:$PATH" ;;
  esac
fi
if command -v uv >/dev/null 2>&1; then
  echo "Starte den Analyse-Dienst (beim ersten Mal werden die Python-Pakete geladen) …"
  (cd server && uv sync -q) || { echo "Python-Pakete konnten nicht installiert werden."; pause; exit 1; }
  # caffeinate (macOS): Mac schläft nicht ein, solange der Dienst läuft – lange Gemma-Läufe brechen sonst ab
  KEEP=""; command -v caffeinate >/dev/null 2>&1 && KEEP="caffeinate -is"
  $KEEP uv run --project server uvicorn rr.api:app --app-dir server --host 127.0.0.1 --port "$PORT" >/tmp/rr-web.log 2>&1 &
  WEB=$!
else
  echo "Ohne uv: nur die App im Browser (ohne Archiv-Analyse-Dienst)."
  if ! command -v python3 >/dev/null 2>&1 || ! python3 -c "pass" >/dev/null 2>&1; then
    echo "python3 fehlt. Auf dem Mac einmalig im Terminal: xcode-select --install"
    pause; exit 1
  fi
  python3 -m http.server "$PORT" --bind 127.0.0.1 >/tmp/rr-web.log 2>&1 &
  WEB=$!
fi
echo "$WEB" > .rr-web.pid
trap 'kill "$WEB" 2>/dev/null; rm -f .rr-web.pid' EXIT INT TERM
for _ in $(seq 1 60); do curl -s -o /dev/null --max-time 1 "$URL" && break; sleep 0.5; done
curl -s -o /dev/null --max-time 2 "$URL" || { echo "Der Dienst startet nicht – Details: /tmp/rr-web.log"; tail -5 /tmp/rr-web.log; pause; exit 1; }

# Empfohlen: Embedding-Modell für bessere Gruppen (klein, ca. 600 MB)
if [ -z "$NO_OLLAMA" ] && up && ! ollama list 2>/dev/null | awk 'NR>1 {print $1}' | grep -q "^embeddinggemma"; then
  echo "Tipp: Mit 'ollama pull embeddinggemma' (ca. 600 MB) werden die Story-Gruppen genauer."
fi

# 5. Browser öffnen
open_url "$URL"
bold "Läuft: $URL"
echo "Dieses Fenster offen lassen. Beenden: ctrl-c oder stop.command."
wait "$WEB"
