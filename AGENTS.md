## Agent skills

### Issue tracker

Issues and specs live as GitHub issues in `barnabyg/growOrDie`, operated with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` at the repo root plus `docs/adr/`. See `docs/agents/domain.md`.

### GitHub

Sandboxed `gh auth status` failures are inconclusive because the host user's credentials may be unavailable to the sandbox. Continue through the host-keyring route; do not initiate `gh auth login` from that evidence alone.

- Prefer the connected GitHub app for supported repository, issue, pull-request, comment, and label operations.
- When `gh` or authenticated remote Git is required, request narrowly scoped execution outside the sandbox so it can use the host credential store.
- Keep credentials in the host keyring. Full Access, persisted `GH_TOKEN`/`GITHUB_TOKEN`, and `gh auth login --insecure-storage` are not authentication workarounds.