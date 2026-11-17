# ATLAS

A complete Project, Task, Workforce, and Organizational management platform —
a fully self-contained, offline-first HTML application.

## Quick start

Open [`delivery/Atlas.html`](delivery/Atlas.html) directly in any modern browser
(Chrome, Edge, Firefox — desktop or mobile). No server, installation, or internet
connection required.

- Default interface: Persian (RTL) with the Jalali calendar
- Secondary: English (LTR) with the Gregorian calendar
- Demo accounts (after loading demo data): `admin` / `pm.user` / `team.lead` / `employee` — password `atlas1234`

## Repository layout

| Path | Description |
|---|---|
| `delivery/` | Final deliverables: `Atlas.html`, `Atlas-patch1`, `Atlas-User-Guide-FA.pdf`, `Atlas-QA-Report.pdf`, `README.txt` |
| `src/` | Modular application source (JS modules, CSS themes) |
| `build.mjs` | Build script — inlines everything into `dist/Atlas.html` and builds `dist/Atlas-patch1.json` |
| `patches/patch1/` | Source of the initial patch package |
| `tests/` | Playwright-based browser test suite (5 rounds, 120 checks) + saved results |
| `tools/` | PDF generators, fonts, utilities |

## Building

```bash
node build.mjs   # produces dist/Atlas.html and dist/Atlas-patch1.json
```

## Testing

```bash
node tests/round1-functional.mjs          # ... rounds 2-5 similarly
```

See `delivery/Atlas-QA-Report.pdf` for the full QA report: 120/120 checks passed
across 5 test rounds in a real Chromium browser.
