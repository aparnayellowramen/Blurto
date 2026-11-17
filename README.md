# Blurt o

Draw a random concept, learn it in 20 minutes, then explain it out loud in 2.
A static, client-only web app (no backend, no accounts, no dependencies) for 1 to 4 learners sharing one phone.

## Run it

```sh
npm start            # http://localhost:5173
npm start -- --host  # also reachable from a phone on the same Wi-Fi
```

Open `http://localhost:5173/?speed=60` to run every timer 60× faster (20 min → 20 s) when testing a full session.

## Update the topics

The topic sheet is the source of truth. Export it as CSV into the project root, then:

```sh
npm run build        # CSV → data/topics.json, with validation
```

The build fails on a repeated or missing ID, a missing category or topic, or a duplicate topic name, and warns on topics over 3 words.
Never change or reuse an ID: each device's "already seen" history is stored by ID, and new IDs are shuffled into every device's remaining queue.

## Test

```sh
npm test             # queue (no repeats), timers (pause, lock-screen accuracy), topic data
```

## Deploy

Upload the folder to any static host (Netlify, Cloudflare Pages, GitHub Pages). Only these are needed:
`index.html`, `manifest.webmanifest`, `sw.js`, `src/`, `data/`, `icons/`.
Offline support and install as an app need HTTPS (or localhost).

## How it maps to the PRD (MVP, FR-1 to FR-12)

| FR | Where |
| --- | --- |
| 1 Choose 1 to 4 learners | Setup screen, `src/app.js` `viewSetup` |
| 2, 3, 4, 12 Random topic, never repeated, no skip, end state | `src/queue.js`: one Fisher–Yates shuffle per device, saved before the topic shows |
| 5 Framework choice, remembered per learner | `src/frameworks.js`, saved per learner slot |
| 6, 7, 11 Learn / speak timers, pause, end early, lock-safe | `src/timer.js`: stores the end time, not a tick count; sessions survive a reload |
| 8 Handoff with 10-second countdown | `viewHandoff`; speaking order is random each session |
| 9 Framework steps as prompts | Learn cards and Speak prompts |
| 10 Sound and vibration | `src/device.js` (Web Audio, Vibration API, Wake Lock while speaking) |

Not in the MVP (v1.1 in the PRD): learner names, research links, framework how-to cards, end-of-session topic list.
Analytics (Plausible) is not wired up yet.

## Files

```
index.html            page shell
src/app.js            screens, session flow, actions
src/queue.js          no-repeat topic queue
src/timer.js          clock-based timers
src/frameworks.js     the 6 frameworks
src/mascot.js         the monster (its mouth is the "o")
src/device.js         sound, vibration, wake lock
src/storage.js        localStorage with in-memory fallback
src/styles.css        design tokens, light/dark, layout
sw.js                 offline cache (network first)
data/topics.json      built from the CSV, do not edit by hand
scripts/              topic build and dev server
tests/                node:test unit tests
```
