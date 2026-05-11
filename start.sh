#!/bin/bash
cd backend && source .venv/bin/activate && uvicorn main:app --reload &
cd frontend && npm run dev -- --host &
ngrok http --url=https://delicious-overheat-headway.ngrok-free.dev 5173