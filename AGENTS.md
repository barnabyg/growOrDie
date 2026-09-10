## Agent skills

### Issue tracker

Issues and specs live as GitHub issues in `barnabyg/growOrDie`, operated with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` at the repo root plus `docs/adr/`. See `docs/agents/domain.md`.

### Verification and guidance locations

Before changing executable code, read [docs/verification.md](docs/verification.md)
for this repository's canonical checks, prerequisites, and dashboard behavior.
Update player documentation when supported behavior changes.

Session-supplied global guidance may reference `agent-guidance/verification.md`,
`agent-guidance/verification-dashboard.md`, or `agent-guidance/investigation.md`.
Those are host-managed resources, not files shipped by this repository. On the
maintainer's Windows host they are under `C:/Users/bob/.codex/agent-guidance/`.
If unavailable elsewhere, report that limitation and follow the repository's
checked-in guidance and applicable session instructions; do not invent the
missing external policy.
