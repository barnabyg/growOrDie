# Verification

## Policy and scope

Issue #25 updates the historical #1 decision to omit automated UI tests for v1. The user authorized completing #25 on 9 September 2026. Browser interaction checks are now required for critical workflows because isolated simulation tests missed disagreements between displayed costs, saved state and actual charges. This policy keeps the deterministic simulation tests and adds Chromium checks through the real page, loopback HTTP server and browser storage.

Tests cover production, allocation bounds, discounts, purchase timing, food conservation after floods, deterministic weather and price shocks, event tints, save/reload, Collapse and restart. Coverage also includes completed-report history and reload continuity, legacy summaries, responsive layouts with enlarged text, storage-access failures and retries, and configuration-driven Technology labels.

Use Node.js 24.13 or later within major version 24, then install the locked tools and Chromium:

```sh
npm ci
npx playwright install chromium
npm run verify
```

On native Windows, use `npm.cmd` and `npx.cmd`. Linux CI installs Chromium's operating-system dependencies with `npx playwright install --with-deps chromium`.

`npm run verify` is the canonical non-mutating quality gate. It stops at the first failure, preserving its exit code, in this order:

1. Prettier formatting check.
2. Biome style and complexity lint.
3. TypeScript compilation/type checking.
4. Biome correctness, suspicious-code, security, performance and accessibility analysis.
5. Vitest unit/integration tests followed by Playwright Chromium browser tests.
6. Dependency-tree validation, npm vulnerability audit at low severity, Secretlint scan, and package manifest/lockfile integrity checks.
7. A fresh temporary compilation and static package module validation.

Prettier owns formatting; Biome's formatter is disabled to avoid competing rules. Lint warnings fail verification. Tool versions are exact pins in package.json and the npm lockfile. Generated output and installed dependencies are excluded from source formatting and secret scanning; authored source, tests, scripts, documentation and the lockfile are checked. There are no source diagnostic baselines or suppressions. Dependency auditing requires access to the npm registry and fails if unavailable.

## Live dashboard

Local full verification automatically prints `TEST_DASHBOARD_URL=http://127.0.0.1:<port>`. Each run chooses a free port, so concurrent worktrees cannot contend for a fixed port. Open that exact URL while the command runs. It shows gate status, native Vitest/Playwright per-test outcomes, elapsed time, failed tests and bounded recent terminal output. The dashboard is read-only and binds only to loopback.

Run verification in a background-capable terminal and open the URL immediately. Dashboard binding and reporter failures fall back to terminal output without changing verification results. Set `VERIFY_DASHBOARD=0` to disable the server; `CI=true` also disables it. In PowerShell, set `$env:VERIFY_DASHBOARD='0'` before the command and remove it afterward with `Remove-Item Env:VERIFY_DASHBOARD`.

A final JSON report is written under `verification-results/<timestamp>-<process>/report.json`. The live server closes after completion. Temporary browser traces and compilation directories are isolated per run; failure-artifact location is printed. These generated files are ignored by Git. A report-write failure does not change verification results.

## Focused checks and CI

`npm test -- tests/<name>.test.ts` runs focused unit tests without a dashboard. `npm run test:all` freshly compiles the game in an isolated temporary directory and runs all unit, HTTP and browser tests. `npm run test:e2e` runs browser tests against existing `dist/`, so use `npm run build` first when invoking it separately. The canonical command always uses a fresh compilation.

GitHub Actions runs the canonical command on Ubuntu and Windows after a clean `npm ci`, and uploads the verification report even on failure. Browser tests run headlessly with one worker and an independently allocated loopback game server. The verification command never repairs files or rewrites tracked build output. Apply any formatter fixes separately during development, then run verification again.

## Deterministic fixtures and manual checks

The browser suite creates a fresh context and a loopback server on an allocated port. It writes only a disposable v1 fixture to that origin, then performs actions through the page. It uses the production simulation rather than mocking harvest results.

| Fixture                    | Run seed | Opening change   | Expected result                                                                                                     |
| -------------------------- | -------- | ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| Ordinary allocation        | 5        | None             | 400 ha cultivated/fertilized yields 1,600 t; retaining 200 t exports 400 t and charges 200 coins upkeep             |
| Flood conservation         | 29       | 2,000 t stored   | 500 t destroyed, 960 t harvested, 1,000 t consumed; 600 t retained plus 860 t exported conserves all surviving food |
| Irrigated drought          | 0        | Irrigation owned | 1,200 t harvest and 25% yield loss                                                                                  |
| Price shock                | 3        | None             | Event appears before allocation and persists through reload                                                         |
| Drought then ordinary year | 4        | None             | Brown tint survives both reload boundaries, then returns to green                                                   |
| Flood then ordinary year   | 43       | None             | Blue tint survives both reload boundaries, then returns to green                                                    |
| Technology timing          | 5        | 6,000 coins      | Purchase High-yield seeds: 1,600 t in purchase year, 2,400 t next year                                              |

Unless stated otherwise, cultivate and fertilize 400 ha, prepare zero and buy no technologies. Browser tests also cover unaffordable storage, owned cost discounts, Granary upkeep and Collapse/restart. Fixed numerical assertions provide an independent accounting check; reload assertions verify that the same durable outcome is reused.

For manual reproduction, build (`npm.cmd run build` on Windows), set `PORT` to an unused port, and run `npm.cmd start`. Use a fresh disposable origin so existing progress is untouched. In that test page's developer console:

```js
const { newSave, persist } = await import("/dist/persistence.js");
persist(newSave(4)); // use 43 for flood followed by an ordinary year
location.reload();
```

Resolve with the plan above, reload during allocation, finish the year, and reload again. Expect brown for drought or blue for flood throughout; the following ordinary harvest clears the tint. #19's manual checks on 9 September 2026 confirmed both settled colors. These transitions and accessible cultivation captions are now automated.

Silhouette shape quality and perceived animation smoothness still require visual inspection. #18's manual check on 9 September 2026 confirmed empty, partial and full cultivation fills plus the legacy-save fallback; the analytical country test checks area rather than height. See [mobile layout verification](mobile-layout.md) and [save recovery](saves.md) for the implemented behavior and remaining manual-testing limitations.

For the dashboard, start `npm.cmd run verify`, open its printed `TEST_DASHBOARD_URL` while it runs, and check the active stage, test count, failures, elapsed time and terminal output. A failing gate must stop later gates and preserve its exit code. The focused observer tests exercise this failure path, independent ports, reporter write failure, process observer failure and dashboard binding failure. Close the browser after the command completes; final evidence remains in the JSON report.

`npm test` is a lightweight unit/HTTP command; its HTTP module-serving test requires a prior build when run outside `test:all`. Use the canonical command or `npm run test:all` for a fresh compilation automatically. Local sandboxed environments can set `PLAYWRIGHT_BROWSERS_PATH` to an ignored writable directory when installing and running Chromium. CI uses the standard Playwright cache and does not need that override.
