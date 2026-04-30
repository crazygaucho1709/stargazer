#!/bin/bash
# Stargazer Backend Launcher
# Runs on Mac Mini M4

echo "--- Starting Stargazer Backend (Fat Server) ---"

# Move to script directory
cd "$(dirname "$0")"

# Check for virtual environment
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

source venv/bin/activate

echo "Updating dependencies..."
pip install -r requirements.txt

echo "Launching FastAPI server on port 5005..."
python main.py
