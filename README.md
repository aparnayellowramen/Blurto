# Blurt o

**Learn it in 20. Explain it in 2.**

Blurt o draws you one random concept, gives you 20 minutes to learn it, then 2 minutes to explain it out loud using a proven speaking framework. Play alone or with up to 3 friends, passing one phone around.



https://github.com/user-attachments/assets/e8e59f60-ace5-4e09-a565-40a1a4c00c60



---

## The problem

People take in more information than ever, yet most of us struggle to explain what we've learned clearly when asked on the spot. Three things get in the way:

1. **Choosing what to learn.** An open-ended "learn something" stalls before it starts.
2. **Never putting learning into your own words.** Reading feels like progress, but understanding only shows up when you have to explain.
3. **Freezing or rambling when speaking.** Without a structure, even a well-understood idea comes out tangled.

## The solution

One short, structured loop that fixes all three:

| Step | What happens | Why it works |
|---|---|---|
| **Draw** | One tap gives each learner a random topic from 3,000 concepts in 26 categories. No skips, no repeats. | Removes choice paralysis. The surprise is part of the fun. |
| **Pick a framework** | Choose one of 6 speaking frameworks; its steps become your outline. | Gives structure before research starts, so learning has a purpose. |
| **Learn (20:00)** | One shared timer. Research however you like. | Short enough to start today, long enough to get the gist. |
| **Speak (2:00 each)** | Pass the phone. The framework steps show as big prompts while you talk. | Explaining out loud is where understanding is tested and built. |

A session takes about **22 minutes solo** and **28 minutes for 4 people**.

**What a win looks like:** *"I did 5 sessions this week and can now explain 5 new concepts at dinner."*

## Who it's for

| User | Use case |
|---|---|
| Solo learner | A daily or weekly habit: learn a concept, then explain it out loud. |
| Pair of friends | Each draws a topic, both research, then they take turns speaking and listening. |
| Small group of 3 or 4 | The same, for a study group, family or team. |
| Speaking practiser | Drills one framework for a week, then moves on to the next. |

## Key product decisions

- **No skips, no repeats.** You get what you draw. A topic never comes up twice on the same device, and going back can't be used to re-roll one.
- **One phone, no account.** Up to 4 learners share one device. Nothing personal leaves it.
- **Works offline.** It installs like an app and runs without a connection once loaded.
- **Explaining, not opinions.** The 6 frameworks are chosen for explaining a concept: What / So What / Now What, PREP, Past / Present / Future, SCQA, Feynman, and Problem / Solution / Benefit.
- **No feedback in v1.** No recording, ratings or AI coaching yet. We first want to prove the 20 + 2 format itself is something people finish and come back to.
- **Delight is a feature.** A fluffy 3D monster (the "o" in the logo) bounces on launch, reacts to each phase and cheers at the end, to make a learning habit feel like play.

## What's shipped

**v1 (MVP): complete**

- [x] Choose 1 to 4 learners
- [x] Random topic per learner from 3,000, never repeated on the device, no skipping
- [x] 6 frameworks, with each learner's last choice remembered
- [x] Shared 20-minute learn timer, 2-minute speak timer per learner, pause and end early
- [x] Handoff screen with a 10-second get-ready countdown and random speaking order
- [x] Framework steps shown as prompts while learning and speaking
- [x] Sound and vibration at the end of each timer; screen stays on while speaking
- [x] Timers stay accurate when the phone locks; a session survives a reload
- [x] A clear end state when every topic has been used

**Beyond the original scope**

- [x] Real-time 3D monster with soft fur, plus a jumping intro that scrolls into the app
- [x] Soft lavender design with frosted glass, consistent across every screen, light and dark
- [x] Back button on the topic screens (without allowing re-rolls)
- [x] Floating 3D background
- [x] Accessibility: keyboard use, screen-reader announcements for timer milestones, reduced-motion support

## How we'll measure success

| Metric | Definition | Target, first 3 months |
|---|---|---|
| **Completion rate** (headline) | Sessions where every learner finishes speaking ÷ sessions started | 60% or more |
| **Week-4 retention** | Devices with a session in week 4 ÷ devices with a first session in week 1 | 20% or more |
| Drop-off point | Where unfinished sessions end: drawing, learning, handoff or speaking | Track; guides fixes |
| Multi-learner share | Sessions with 2+ learners ÷ all sessions | Track |
| Framework spread | Share of sessions using each framework | No framework under 5% |

Completion rate is the headline because v1 has no feedback loop: finishing is the clearest signal that the format works.

> ⚠️ **Not measurable yet.** Privacy-friendly, cookieless analytics (such as Plausible) is not wired up. This is the first item on the roadmap.

## Roadmap

**Next (v1.1)**
- Analytics for the metrics above
- Optional learner names ("Priya, you're up")
- Quick research links for each topic (Wikipedia, YouTube, web)
- A short how-to card with an example for each framework
- End-of-session summary listing the topics covered

**Later (not committed)**
- Feedback on the talk: recording or self-checks
- Accounts, so "never repeat" works across devices
- Play across separate phones

## Open questions and risks

- **Name and domain:** check that the *blurto* domain and the *Blurt o* name are available before launch.
- **Performance on real phones:** the 3D monster has only been tested on desktop hardware so far. Lower-end phones automatically get lighter fur and fall back to a flat monster if WebGL is unavailable.
- **First-load size:** the 3D engine adds about 690 KB the first time the app opens (cached after that).
- **iPhone home-screen icon:** iOS needs a PNG icon; only an SVG ships today.

---

## For engineers

A static, client-only web app: no backend and no build step for the app itself. The only libraries (three.js and the Fredoka font) are bundled in `vendor/`.

```sh
npm start              # http://localhost:5173
npm start -- --host    # also reachable from a phone on the same Wi-Fi
npm test               # unit tests: no-repeat queue, timers, topic data
npm run build          # rebuild data/topics.json from the topic CSV (with validation)
```

Add `?speed=60` to the URL to run every timer 60× faster when testing a full session.

**Deploy:** upload to any static host (Netlify, Cloudflare Pages, GitHub Pages). The app needs `index.html`, `manifest.webmanifest`, `sw.js`, `src/`, `data/`, `icons/` and `vendor/`. Offline support and installing as an app need HTTPS.

**Topics:** the topic sheet is the source of truth; export it as CSV into the project root and run `npm run build`. Never change or reuse a topic ID: each device's "already seen" history is stored by ID.

**Where things live**

```
src/app.js          screens, session flow, the intro
src/queue.js        no-repeat topic queue
src/timer.js        clock-based timers (accurate when the phone locks)
src/frameworks.js   the 6 speaking frameworks
src/monster3d.js    3D monster, fur shader and floating background (three.js)
src/mascot.js       flat monster, shown while 3D loads or without WebGL
src/device.js       sound, vibration, wake lock
src/styles.css      design tokens, layout, light and dark
sw.js               offline cache
data/topics.json    built from the CSV; don't edit by hand
```

**Third-party:** [three.js](https://threejs.org) (MIT) and the [Fredoka](https://fonts.google.com/specimen/Fredoka) font (SIL Open Font License, licence in `vendor/fonts/`), both bundled locally for offline use.
