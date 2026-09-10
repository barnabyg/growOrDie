# Grow or Die

Manage an agriculture-based country year by year: grow the population while
surviving food shortfalls, random Events, and changing export prices.

## Install and run

Use Git and Node.js **24.13.0 or later within major version 24**, with npm.
From a terminal:

```sh
git clone https://github.com/barnabyg/growOrDie.git
cd growOrDie
npm ci
npm run build
npm start
```

Open http://127.0.0.1:8000. On native Windows PowerShell use `npm.cmd` and
`npx.cmd` in place of `npm` and `npx`. Stop the server with Ctrl+C.
The server is for local development and binds only to loopback; see
[local server and static hosting](docs/local-server.md).

## Play a Turn

A new run starts with 1,000 people and 400 prepared hectares out of 2,000 arable
hectares under the default configuration. Each Turn has two decisions:

1. **Plan production and investment.** Cultivation costs seeds each year;
   fertilizer adds cost and multiplies Yield on the chosen hectares. Preparing
   land costs money once and makes it available for future cultivation.
   Technologies are one-off purchases whose benefits start next Turn. The
   preview includes mandatory upkeep for retained food and blocks unaffordable
   commitments. Select **Resolve harvest** to commit the plan.
2. **Allocate the actual Surplus.** The game reveals one Event, Harvest,
   Consumption/Famine, available Surplus, and the applicable Export price.
   Choose how much food to keep within the affordable Storage range, then
   confirm allocation. Surviving old food must stay stored; the permitted
   remainder of new food is exported automatically. Upkeep uses the current
   Budget; tax and export revenue fund the next Turn along with unspent coins.

For a first attempt at the default settings, cultivate and fertilize all 400
prepared hectares. That costs 2,000 coins before Storage upkeep and produces
1,600 tons before Events, against 1,000 tons of Consumption. Weather can still
cause a shortfall. Keeping food provides a buffer but costs upkeep; exporting
provides money instead. Storage has no capacity limit.

Meeting Consumption grows population. A shortfall causes Famine and population
loss; no food means total Famine. **Score** records peak population, and doubling
milestones are celebrated. **Collapse** ends play below half the starting
population, including zero; there is no fixed winning population.

Progress saves after harvest commitment and allocation. Reloading during
allocation preserves the rolled outcome. The latest report returns on reload;
expand history entries to inspect earlier outcomes. **Restart run** asks for
confirmation before replacing the run, including a pending harvest. Storage
failures show a warning and Retry and pause further advances. Legacy summaries
remain readable without invented details; see [saved games and recovery](docs/saves.md).

## Development and checks

After `npm ci`, install the browser used by verification:

```sh
npx playwright install chromium
npm run verify
```

On a Linux host missing browser system libraries, use
`npx playwright install --with-deps chromium` (system package installation may
require administrator access). `npm run verify` is the complete non-mutating
check: formatting, lint, types, static analysis, unit/HTTP/browser tests,
dependency/security/package checks, and a fresh build. It requires registry
access for the vulnerability audit. See [verification](docs/verification.md)
for the live dashboard and focused commands.

Balance settings live in `src/config.ts`; purchase descriptions and effects read
those settings. The simulation is deterministic for a given state, plan, seed,
and configuration. All four Event probabilities are explicit, finite values
between 0 and 1, summing to 1 within floating-point tolerance; invalid settings
throw rather than silently changing the shock probability.

The two-decision Turn, responsive layout, outcome history, storage-failure
recovery, and configuration-driven descriptions are implemented. Open issues
in the [tracker](https://github.com/barnabyg/growOrDie/issues) describe remaining
work; the app has no backend, accounts, multiplayer, or cloud synchronization.
Use [CONTEXT.md](CONTEXT.md) for terminology, [ADRs](docs/adr/) for decisions,
and [AGENTS.md](AGENTS.md) for contributor guidance.
