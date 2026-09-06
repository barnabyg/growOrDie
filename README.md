# Grow or Die

A web-based simulation game in which you manage an agriculture-based country year by year: allocate the annual budget, survive random events and a volatile export market, and grow the population. See `CONTEXT.md` for domain language and `docs/adr/` for architectural decisions.

## Playing (walking skeleton)

```
npm install
npm run build   # compiles src/ to dist/
npm start       # serves the game at http://localhost:8000
```

The page starts a new run from the baseline (population 1,000; 2,000 ha arable with 400 ha prepared). Choose how many prepared hectares to cultivate, resolve the year, and read the report. Progress auto-saves to `localStorage`; use **Restart run** to start over.

## Development

```
npm test        # vitest: drives the turn-resolution seam headlessly
npm run typecheck
```

The simulation core (`src/simulation.ts`) is pure and deterministic given a seed; all balance numbers live in the single config block in `src/config.ts`.
