#!/bin/bash

MODE=${1:-dev}

if [[ "$MODE" != "dev" && "$MODE" != "ngrok" && "$MODE" != "prod" ]]; then
    echo "Usage: ./start.sh [dev|ngrok|prod]"
    echo "  dev   — local only, dev database (http://localhost:5173)"
    echo "  ngrok — expose via ngrok, dev database"
    echo "  prod  — local, production database"
    exit 1
fi

# Select env files based on mode
if [[ "$MODE" == "prod" ]]; then
    BACKEND_ENV=".env"
    FRONTEND_ENV=".env.prod"
    echo "⚠️  WARNING: You are about to connect to the PRODUCTION database!"
    echo "Type 'I really want to work on the production db' to confirm:"
    read -r confirmation
    if [[ "$confirmation" != "I really want to work on the production db" ]]; then
        echo "Aborted."
        exit 1
    fi
    echo "Confirmed. Starting with PRODUCTION database..."
else
    BACKEND_ENV=".env.dev"
    FRONTEND_ENV=".env.dev"
    echo "🧪 Using DEV database"
fi

# Check env files exist
if [[ ! -f "backend/$BACKEND_ENV" ]]; then
    echo "Error: backend/$BACKEND_ENV not found"
    exit 1
fi
if [[ ! -f "frontend/$FRONTEND_ENV" ]]; then
    echo "Error: frontend/$FRONTEND_ENV not found"
    exit 1
fi

# Copy the correct frontend env to .env.local (what Vite reads)
cp "frontend/$FRONTEND_ENV" frontend/.env.local
echo "Loaded frontend env from frontend/$FRONTEND_ENV"

# Kill leftover processes
echo "Cleaning up old processes..."
pkill -f "uvicorn main:app" 2>/dev/null
pkill -f "vite" 2>/dev/null
sleep 1

# Set up log directory
LOG_DIR="logs"
mkdir -p "$LOG_DIR"
FRONTEND_LOG="$LOG_DIR/frontend.log"
BACKEND_LOG="$LOG_DIR/backend.log"

# Truncate old logs
> "$FRONTEND_LOG"
> "$BACKEND_LOG"

echo ""
echo "📝 Logs:"
echo "   Frontend → $FRONTEND_LOG"
echo "   Backend  → $BACKEND_LOG"
echo "   (tail -f logs/frontend.log  |  tail -f logs/backend.log)"
echo ""

# Start frontend — always log to file
(cd frontend && npm run dev -- --host >> "../$FRONTEND_LOG" 2>&1) &

# Start backend — always log to file
(cd backend && source .venv/bin/activate && set -a && source "$BACKEND_ENV" && set +a && uvicorn main:app --reload >> "../$BACKEND_LOG" 2>&1) &

if [[ "$MODE" == "ngrok" ]]; then
    echo "Starting ngrok tunnel..."
    echo "App available at: https://delicious-overheat-headway.ngrok-free.dev"
    echo ""
    ngrok http --config=ngrok.yml --url=https://delicious-overheat-headway.ngrok-free.dev 5173
else
    echo "Open http://localhost:5173"
    echo "Press Ctrl+C to stop all processes."
    echo ""
    # Wait for background jobs; exit cleanly on Ctrl+C
    trap "echo ''; echo 'Stopping...'; pkill -f 'uvicorn main:app'; pkill -f 'vite'; exit 0" INT
    wait
fi