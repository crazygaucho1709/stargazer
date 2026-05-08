---
name: testing-stargazer-app
description: How to run, test, and verify changes against the stargazer Next.js + FastAPI app locally. Covers starting backend/frontend, the 14" viewport sizes the user cares about, the localStorage zustand-storage shape used to switch language and live-view mode without UI clicks, and stable Playwright selectors for the AVIS I.A. card and the bottom-center BRIDGE pill.
---

# Testing the stargazer app

## Layout / repo orientation

- Frontend: Next.js 14 App Router under `src/`. Main page is `src/app/page.tsx`. The two bottom pods on the main page that overflow on 14" displays are the left `LIMITS_CONFIG` and right `METEO_ORACLE` `AstroPod`s.
- Backend: FastAPI app under `server/main.py`, default port `5005`.
- i18n: `src/i18n/translations.ts` exports an `en` and `fr` map keyed by uppercase translation keys; the helper is `t(key, language)`.
- Persisted UI state lives in localStorage under the key `stargazer-storage` with shape `{ state: { liveViewMode, language, config }, version: 0 }` (zustand persist). Setting this and reloading is the most reliable way to put the app into a known state — way easier than clicking the FR/EN toggle or the live-view switch.

## Running locally

```bash
# Backend (port 5005). Uses python3 directly, no venv required for healthcheck.
cd server && python3 main.py > /tmp/backend.log 2>&1 &
curl -s http://localhost:5005/health   # -> {"status":"ok","indi_connected":false,...}

# Frontend (port 3000)
npm run dev > /tmp/frontend.log 2>&1 &
sleep 12  # next dev needs ~10s for first compile
curl -s -o /dev/null -w '%{http_code}' http://localhost:3000   # -> 200
```

Port 5005 returning `mount_connected:false` is fine for layout testing — the
frontend renders all pods regardless. The reconnect loop will spam
`Connection failed: [Errno 65] No route to host` in the backend log; ignore it
for layout work.

## Lint and typecheck

Both must pass before opening a PR:

```bash
npm run lint        # next lint
npx tsc --noEmit
```

## Viewport sizes the user actually has

The user's primary screen is a **Macbook 14" at native default scaling**
which gives a CSS viewport of **1512×945**. This is the resolution to
optimize for. Other sizes I've validated in this repo:

| Viewport | What it represents | Bottom pods fit no-scroll? |
|---|---|---|
| 1728×1117 | Macbook 14" "more space" scaling | yes |
| 1512×945  | Macbook 14" native (the user's actual screen) | yes |
| 1440×900  | Older / smaller 14" laptops | needs ~73px column-internal scroll |
| 1366×768  | External monitors / netbooks | needs ~205px column-internal scroll |

The right column (`METEO_ORACLE`) is the long one. The left column
(`LIMITS_CONFIG`) fits everywhere.

## Putting the app into a known state without clicks

```python
# In Playwright, set the persisted store BEFORE reload:
await page.evaluate(
    """(lang) => window.localStorage.setItem('stargazer-storage', JSON.stringify({
        state: { liveViewMode: 'NASA', language: lang, config: {} },
        version: 0
    }))""",
    'fr',  # or 'en'
)
await page.reload(wait_until='networkidle', timeout=30000)
await asyncio.sleep(4)  # give weather fetch + AVIS card a moment
```

`liveViewMode` values that exist: `NASA` (Aladin sky map), `CANON` (placeholder
until the LIVE button is clicked), and others. For pure layout work, `NASA`
is the safest because it doesn't poll the backend.

## Stable selectors

### AVIS I.A. card (works in EN and FR)

The small absolute-positioned badge above the card carries the translated
label. Match either FR or EN:

```js
const badges = Array.from(document.querySelectorAll('p, span, div'))
    .filter(e => {
        const t = (e.textContent || '').trim();
        return (t === 'AVIS I.A.' || t === 'A.I. ADVICE') && e.children.length === 0;
    });
```

Then walk up to the parent that has the `<button>` (`LANCER SÉQUENCE` / `START SEQUENCE`). Inside the card:
- The **title** is a `<p>` with computed `font-size: 13px` (gold `var(--astro-gold)`, weight 700).
- The **description** is the next `<p>` with computed `font-size: 11px`.

### BRIDGE pill

The bottom-center status pill is a `.astro-panel` whose textContent contains
`BRIDGE_UP` or `BRIDGE_DOWN`. Filter on text length < ~80 chars to avoid
matching ancestor containers:

```js
const panels = Array.from(document.querySelectorAll('.astro-panel'));
const pill = panels.find(pa => {
    const t = pa.textContent || '';
    return (t.includes('BRIDGE_UP') || t.includes('BRIDGE_DOWN')) && t.length < 120;
});
```

The pill is `position="absolute" left="50%" transform="translateX(-50%)"`. Its
rect cx should equal viewport.width / 2 within ±5px. Don't measure the
`BRIDGE_UP` text node — it's left-aligned inside the pill and gives a
misleading off-center reading.

### Side columns

Both side columns carry the `.hud-scroll` class and have `overflowY: auto`. To
see whether layout fits without column-scroll at a given viewport:

```js
const rightCol = document.querySelectorAll('.hud-scroll')[1];
console.log({
    overflowsBy: rightCol.scrollHeight - rightCol.clientHeight,
    rect: rightCol.getBoundingClientRect(),
});
```

`overflowsBy <= 30` at 1512×945 is the target (the small leftover is
cosmetic AVIS card bottom padding, the button itself is visible).

## Gotchas

- `panel.getBoundingClientRect().bottom` can exceed the viewport height even
  when the panel is fully visible to the user, because the panel lives inside
  an `overflow:auto` column that clips it. Always check
  `button.rect ⊂ column.rect` not `button.rect ⊂ viewport.rect`.
- The runner self-hosted CI on this repo only triggers on push to `main`. PRs
  show 0 checks. That is expected — don't wait on `git_pr_checks` past one
  empty result.
- I cannot push to `main` directly (Devin policy). The user merges via the
  GitHub UI; the resulting push to `main` triggers the `Deploy Stargazer`
  GitHub Action which runs the deploy script on the Mac Mini.
- The user's Macbook 14" sits in the Tahiti timezone, so deploy windows on
  their evening = early UTC the next day. Not relevant to testing but
  occasionally affects when deploys complete.
