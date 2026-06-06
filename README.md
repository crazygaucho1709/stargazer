| Symptom | Likely Cause | Suggested Fix |
|---|---|---|
| The calibrator modal does not open after clicking the button | JavaScript error in the modal component, or the modal component not exported | Verify the import path is correct, check for console errors, ensure the modal component exports a default or named component as used |
| ‘Reading INDI…’ persists forever and the position remains '---' | InDI bridge is not connected, hostname cannot be resolved, network partition | Use `ping astroberry.local` or the IP address, confirm `ASTROBERRY_HOST` in the backend `.env`, run `raspi restart_indi()` manually via SSH if needed |
| The telescope moves but snaps back to park after a few seconds | The mount’s `CONNECTION` switch or `TELESCOPE_PARK` is toggled by another process | Ensure no additional scripts (e.g., KStars, Ekos) are automatically toggling the mount. Check `/etc/indiserver/conf.d/*.conf` for auto-connection settings |
| Live video stalls during calibration | USB bandwidth contention or the capture thread hogging the A/D conversion | Reduce capture resolution (`small`, `medium`), or pause the live view while jogging. Consider throttling the webcam frame rate in the backend. |
| Camera connection drops inadvertently | USB cable intermittent or the Raspberry Pi resets the camera module | Check cable integrity, use a powered USB hub, monitor the Pi’s `dmesg` for `usb` errors. |
| Calibration points are recorded incorrectly | RA/Dec conversion applied after record but the telescope is not fully parked | Call `self._safe_connect_device` twice after each jog, or insert `time.sleep(0.5)` after each jog command. |

**Quick One‑line Commands**
| Command | Purpose |
|----------|---------|
| `ssh pi@astroberry.local raspi restart_indi` | Restart the INDI server on the Pi. |
| `raspi restart_indi` | Trigger a remote restart via the `raspi` helper (if available). |
| `raspi status` | View the last status blob from the Pi. |
| `watch -n 1 curl -s http://localhost:5005/api/indi/mount/status | jq .` | Live polling of mount status. |
| `nvm use 20` | Switch to Node.js 20 for the Next.js client build. |
