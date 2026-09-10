# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root: the glossary of domain terms (Turn, Event, Arable land, Budget, Famine, ...).
- **`docs/adr/`**: read ADRs that touch the area you're about to work in. Current decisions:
  - `0001-annual-turn-model.md` — production commitment followed by post-harvest allocation
  - `0002-unlimited-food-storage.md` — unlimited storage capacity, upkeep per ton
  - `0003-static-web-app-localstorage.md` — static web app, state in localStorage

If a referenced domain document is missing, report the missing path and use the implementation and issue specification to identify the unresolved question.

## File structure

Single-context repo:

```
/
├── CONTEXT.md
└── docs/adr/
    ├── 0001-annual-turn-model.md
    ├── 0002-unlimited-food-storage.md
    └── 0003-static-web-app-localstorage.md
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0002 (unlimited food storage), but worth reopening because…_
