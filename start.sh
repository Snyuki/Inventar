#!/bin/bash

MODE=${1:-dev}

if [[ "$MODE" != "dev" && "$MODE" != "ngrok" ]]; then
    echo "Usage: ./start.sh [dev|ngrok]"
    echo "  dev   — local only (http://localhost:5173)"
    echo "  ngrok — expose via ngrok tunnel"
    exit 1
fi

# Kill any leftover processes from previous runs
echo "Cleaning up old processes..."
pkill -f "uvicorn main:app" 2>/dev/null
pkill -f "vite" 2>/dev/null
sleep 1

# Start frontend in background
(cd frontend && npm run dev -- --host) &

if [[ "$MODE" == "ngrok" ]]; then
    (cd backend && source .venv/bin/activate && uvicorn main:app --reload) &
    echo "Starting ngrok tunnel..."
    ngrok http --url=https://delicious-overheat-headway.ngrok-free.dev 5173
else
    echo "Dev mode — open http://localhost:5173"
    (cd backend && source .venv/bin/activate && uvicorn main:app --reload)
fi