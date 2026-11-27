# Hosting the demo console

The web console in `web/` is a static React app. It has two modes:

- **Demo mode** (default): reads `web/public/fixtures/demo.json`, generated from the
  eval corpus and rogue-agent scenario. Approve/Reject are disabled and no backend is
  required. This is what is deployed publicly.
- **Live mode**: set `VITE_DEMO_MODE=false` and point `VITE_API_BASE` at the local
  Express dashboard (`http://localhost:3000/api`). A bearer token entered in the
  header is held in memory only and is required before decisions can be made.

## Local development

```bash
npm run dev:dashboard   # terminal 1: API at localhost:3000
npm run dev:web         # terminal 2: Vite proxy for /api
npm run fixture:web     # regenerate the demo fixture
npm run build:web       # output: dist/web
```

## Static deployment

GitHub Pages is configured in `.github/workflows/pages.yml` and deploys on every push
to `main`. Enable Pages with "GitHub Actions" as the source in repository settings.
The workflow builds with `VITE_BASE=./` and `VITE_DEMO_MODE=true`. Relative asset
paths are deliberate: GitHub Pages serves this repository at `/Permiscope/` (capital
P), and an absolute lowercase base would 404 the JS, CSS and fixture.

Cloudflare Pages is also supported manually:

- Build command: `npm ci && npm run fixture:web && npm run build:web`
- Output directory: `dist/web`
- Environment variables: `VITE_DEMO_MODE=true`, `VITE_BASE=/`

Never deploy live mode publicly: it would expose approval parameters without TLS and
requires a token plus authenticated access.
