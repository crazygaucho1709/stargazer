# Stargazer Web Interface 🔭✨

Stargazer is a modern web-based control interface for motorized equatorial mounts and CCD/DSLR cameras via INDI (Astroberry).

It provides an intuitive, responsive UI built with Next.js, Chakra UI, and a Python proxy backend to communicate seamlessly with INDI hardware.

## Features

- **Interactive Sky Map**: Point and click to perform GoTo operations with live NexStar position tracking.
- **Mount Control & Tracking**: Manually jog the mount, sync to coordinates, set hardware limits (altitude/azimuth).
- **Auto-Align AI**: Automated alignment sequences using CCD capturing and plate solving.
- **Camera Control & Live View**: Adjust exposure, ISO, and preview live stream from CCD or Canon DSLR cameras.

## Project Structure

- `src/` - Next.js frontend (React, Chakra UI, Zustand).
- `server/` - Python proxy backend (FastAPI, httpx) bridging Next.js to the INDI server.
- `server/tests/` - Backend test suite using pytest.

## Setup & Running Locally

### 1. Python Backend

```bash
cd server
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python main.py
```
The backend will run on `http://127.0.0.1:5005`.

### 2. Next.js Frontend

```bash
nvm use 20
npm install
npm run dev
```
The frontend will be available at `http://localhost:3000`.

## Testing

To run the backend test suite:

```bash
cd server
source venv/bin/activate
pytest tests/
```

## Troubleshooting

| Symptom | Likely Cause | Suggested Fix |
|---|---|---|
| 'Reading INDI…' persists forever | INDI bridge is not connected | Use `ping astroberry.local`, confirm `ASTROBERRY_HOST` in `.env`, run `ssh pi@astroberry.local sudo systemctl restart indiserver` |
| The telescope snaps back to park | The mount’s `CONNECTION` switch is toggled | Ensure no additional scripts (e.g., KStars) are automatically toggling the mount. |
| Live video stalls during calibration | USB bandwidth contention | Reduce capture resolution, or pause the live view while jogging. |

## CI/CD

A GitHub Action is configured in `.github/workflows/test.yml` to run `pytest` on the backend automatically on every push and pull request to the `main` branch.
