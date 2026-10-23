#!/usr/bin/env bash
# ========================================================
#   DOS AI Chatbot - Launcher Script
# ========================================================
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

# 1. Compile AICHAT.EXE if not already built
if [ ! -f "bin/AICHAT.EXE" ]; then
    echo "[Launcher] Compiling AICHAT.EXE..."
    make
fi

# 2. Check if Gateway is running on port 5000
GATEWAY_PID=""
if ! nc -z 127.0.0.1 5000 2>/dev/null; then
    echo "[Launcher] Starting AI Gateway server in background..."
    python3 gateway/ai_gateway.py --port 5000 &
    GATEWAY_PID=$!
    # Wait for gateway to bind port
    sleep 1
else
    echo "[Launcher] Gateway is already running on port 5000."
fi

# 3. Cleanup handler to terminate spawned gateway upon exit
cleanup() {
    if [ -n "$GATEWAY_PID" ]; then
        echo "[Launcher] Stopping background AI Gateway (PID: $GATEWAY_PID)..."
        kill "$GATEWAY_PID" 2>/dev/null || true
    fi
}
trap cleanup EXIT INT TERM

# 4. Launch DOSBox Staging
echo "[Launcher] Launching DOSBox Staging..."
flatpak run io.github.dosbox-staging \
    --conf "$DIR/dosbox_chat.conf" \
    --working-dir "$DIR"

echo "[Launcher] Session finished."
