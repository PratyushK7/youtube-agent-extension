#!/bin/bash
# Move to the project directory
cd "/Users/pratyushkumar/.gemini/antigravity/youtube"

echo "🚀 YT-to-AI STRATEGIST: Initializing Sequence..."

# KILL existing process on 3005 to ensure a clean restart
echo "🧹 Clearing existing server instances on port 3005..."
lsof -ti :3005 | xargs kill -9 2>/dev/null

echo "📦 Installing/Verifying Dependencies..."
npm install

echo "🔥 Launching Server..."
node server.js
