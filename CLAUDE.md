# Stargazer — Project Memory

## Projet
Interface web de contrôle astronomique pour monture équatoriale motorisée et caméras CCD/DSLR via INDI (Astroberry).

**Utilisateur :** Matt (matthieu@hightest.nc)

## Stack technique

### Frontend (`src/`)
- **Framework :** Next.js 14.2.0 (App Router)
- **UI :** Chakra UI + Emotion + Framer Motion
- **État global :** Zustand (avec `persist` middleware)
- **Langage :** TypeScript
- **Port dev :** 3001 (0.0.0.0)

### Backend (`server/`)
- **Framework :** FastAPI (Python)
- **Port :** 5005
- **Fichier principal :** `server/main.py`
- **Dépendances clés :** fastapi, uvicorn, paramiko, rawpy, astropy, opencv-python, numpy, pillow, psutil
- **Version backend :** `2026-05-17-V1`

### Infrastructure
- **INDI server :** Astroberry (Raspberry Pi) via SSH/TCP
  - Host par défaut : `astroberry.local`
  - Port INDI : 7624
  - SSH : port 22, user `astroberry`
- **Stockage captures :** `/Volumes/Data2/captures` (HDD externe) avec fallback local `server/captures/`
- **Process manager :** PM2 (`ecosystem.config.js`)
- **Déploiement :** `deploy.sh`

## Structure `src/`

```
src/
├── app/
│   ├── page.tsx              # Page principale (dashboard)
│   ├── observatory/page.tsx  # Vue observatoire
│   └── api/                  # Routes API Next.js (ai, astroberry, control, hardware, indi, logs, mount, proxy)
├── components/
│   ├── telescope/            # TelescopeControls, AutoAlignWizard, AutofocusWizard, CalibrationWizard, JogPad, MountCalibration, ObjectFinder, ObservationSuggestions, SkyDome, TargetSelector
│   ├── camera/               # CameraControls, CaptureAndStack
│   ├── ai/                   # AIAssistant
│   ├── viewport/             # SkyMap, InteractiveSkyMap, LiveView
│   ├── layout/
│   └── ui/                   # AstroPod, ConfigurationMenu, GlobalLoader, NotificationCenter, SessionIndicator
├── store/
│   ├── useStargazerStore.ts  # Store principal (état mount, caméra, config, session)
│   └── useSessionStore.ts
├── hooks/                    # useEnvironmentData, etc.
├── i18n/                     # Traductions (en/fr)
├── lib/                      # sessionMachine, observatoryMachine, notificationService
├── services/
├── data/
└── theme/
```

## Architecture état (Zustand store)

**Config utilisateur :** aiKey, astroberryUrl, driverInstance, baudRate, autoTracking, slewSpeed, captureFormat, sensorCooling, aiFocus, exposureTime, isoGain, frameCount, dithering, liveStacking, aiColorization, latitude, longitude

**État temps réel :** ra, dec, alt, az, zoom, isConnected, captureProgress, stackingProgress, hfr, detectedCcd, detectedMount

**Machines d'état :** sessionMachine (SessionState/SessionEvent), observatoryMachine (ObservatoryState/ObservatoryEvent, SubsystemHealth)

**Live view :** mode `"NASA"` ou `"CANON"`

## Fonctionnalités principales
1. **Carte du ciel interactive** — GoTo par clic, tracking position NexStar en temps réel
2. **Contrôle monture** — Jog directionnel, sync coordonnées, limites alt/az
3. **Auto-Align AI** — Séquence d'alignement automatique (capture CCD + plate solving)
4. **Caméra / Live view** — Exposition, ISO, flux live CCD ou Canon DSLR
5. **Stacking** — `stacking_worker.py`
6. **Framing** — WebSocket (`framing.py`)
7. **Métriques** — `server/metrics.py`

## Fichiers notables
- `server/astroberry.py` — Client SSH Raspberry Pi (paramiko)
- `server/framing.py` — Router WebSocket framing
- `server/metrics.py` — Métriques backend
- `server/log_config.py` — Logging JSON structuré
- `stacking_worker.py` — Worker d'empilement d'images (racine)
- `indi_bridge.py` — Bridge INDI (racine)
- `captures/` — Images capturées (JPG streams)
- `scripts/` — Scripts utilitaires

## Tests
- Backend : pytest dans `server/tests/`
- CI/CD : GitHub Actions (`.github/workflows/test.yml`) sur push/PR vers `main`
- Fichiers test à la racine : `test_*.py`, `test_*.js`

## Internationalisation
- Langues supportées : `"en"` | `"fr"`
- Fichiers i18n dans `src/i18n/`

## Règles architecturales (non négociables)

Ces règles s'appliquent à toute modification du code. Les vérifier **avant** de commencer à coder, pas après.

### Jog manuel — règle ABSOLUE, au-dessus de toutes les autres

**Hors GoTo autonome, aucun slew ne doit exister sans un doigt sur une touche de déplacement.**
Appui = la monture bouge. Relâchement = elle s'arrête. Rien d'autre.

C'est la régression qui revient à presque chaque nouvelle implémentation depuis
le début du projet. Elle a coûté une course de 260° le 5 août 2026, limites
d'axes pourtant actives.

Interdits, sans exception ni circonstance atténuante :
- **STOP conditionnel.** Un ordre d'arrêt est TOUJOURS exécuté et transmis à la
  monture, quel que soit son `jog_id`, son horodatage, ou l'état interne du
  backend. C'est la cause exacte de l'incident : `Ignoring out-of-order STOP
  request ... jog_id is not active`. Le filtrage par identifiant ne sert qu'à la
  comptabilité, jamais à supprimer l'arrêt.
- **Sémantique par impulsions ou par course** : pulses de maintien qui
  réémettent le mouvement, plafonds de déplacement, temporisations qui
  entretiennent le slew. Le maintien ne doit jamais *produire* du mouvement,
  seulement l'autoriser à continuer.
- Un watchdog est admis **uniquement** comme filet en cas de client mort. Jamais
  comme mécanisme d'entretien du mouvement.

Avant toute modification du chemin de jog, vérifier que (1) le relâchement
produit un arrêt inconditionnel, (2) aucune logique ne peut réémettre un
mouvement après un relâchement.

### Hooks — source unique de vérité
- Toute logique réseau partagée entre ≥ 2 composants → hook dans `src/hooks/`
- Hooks existants à réutiliser obligatoirement : `useJog`, `useGoTo`, `useLiveView`, `useCapture`, `useMountCoords`
- Avant de créer un nouveau `fetch` dans un composant : grep `src/hooks/` pour vérifier qu'il n'existe pas déjà

### Temps réel — SSE/WS avant polling
- Si une donnée change fréquemment (coords, progression, état) → SSE ou WebSocket, jamais `setInterval` + `fetch`
- `setInterval` dans un composant React = red flag à signaler immédiatement

### Erreurs — zéro silence
- `catch` vide ou `catch { return false }` interdit
- `console.error` interdit — toujours `notification.error()` avec `source:` et `description:`
- Chaque exception doit produire un message visible pour l'utilisateur

### Duplication — détection proactive
- Avant d'implémenter une fonctionnalité : `grep -r "nom_de_la_logique" src/` pour détecter l'existant
- Si la même séquence fetch+parse apparaît dans > 1 fichier → refactoriser en hook avant de continuer

### TypeScript
- `npx tsc --noEmit` doit passer à zéro erreur après chaque changement non trivial
- Aucun `any` implicite, aucun `@ts-ignore` sans commentaire expliquant pourquoi

### Performance
- Requête > 2s au niveau du backend : chercher la cause (SSH, IERS download, INDI timeout) avant d'augmenter les timeouts
- Les timeouts ne sont pas des solutions

## Audit hebdomadaire automatique

Une tâche planifiée tourne chaque lundi matin pour détecter la dérive :
- `grep -r "console\.error\|console\.log" src/` → doit retourner 0 résultat
- `grep -rn "setInterval" src/components/` → tout résultat est un bug potentiel
- `grep -rn "catch.*{}" src/` → silences à corriger
- `npx tsc --noEmit` → 0 erreur obligatoire
- Chercher les `fetch(` dans les fichiers `.tsx` hors `src/hooks/` et `src/app/api/`

## Règles architecturales (non négociables)
- Toute logique réseau partagée entre ≥2 composants → hook dans src/hooks/
- Zéro polling HTTP si un SSE/WS est possible
- Zéro console.error — toujours notification.error()
- Avant tout nouveau composant : grep pour détecter si la logique existe déjà
