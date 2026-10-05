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
   Technologies are one-off purchases whose benefits start next Turn; click
   anywhere on a Technology card to select it. The
   preview includes mandatory upkeep for retained food and blocks unaffordable
   commitments. Select **Resolve harvest** to commit the plan. If the ordinary
   forecast falls short of Consumption, the button turns to a warning such as
   **Resolve with 250 t shortfall**; resolving is still allowed.
   From Year 2, cultivation and fertilization start at the previous Year's
   values, reduced if needed to fit prepared land and the Budget (fertilizer is
   dropped before cultivation). Preparation and Technologies start at zero.
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

The Field journal interface pairs sliders with exact number inputs. **All prepared**
and **All cultivated** are shortcuts; the first-Year suggestion fills both without
committing the plan. Live food and Budget meters show the tradeoffs: one food bar
shows Harvest and opening Storage against a Consumption marker, shading any
shortfall, and the Drought outcome is always shown beneath it. Each
production input shows the most hectares affordable with the rest of the plan,
marks the unaffordable part of its slider, and explains an overspend beside the
field that caused it. Expand
**Weather scenarios** for ordinary, Drought, and Flood food balances. These are
possible outcomes, not a forecast of the hidden Event; they include opening
Storage, Flood losses, and currently owned Technologies. Purchases and newly
prepared land improve future Turns only.

The illustrated country distinguishes prepared, cultivated, and unprepared land.
Changing production shows a labelled plan preview; a committed Harvest shows the
actual cultivation and weather. Parcels and settlement buildings are visual
representations of the aggregate state, not extra regions or rules. Faded houses
show Population lost since its peak. Owned Technologies add landmarks. The next doubling Milestone has a population meter.

The header shows the Year, Population with its latest change, Storage and
Budget, plus a one-line status saying what to do next. Score appears beside the
Milestone meter; the export price appears during allocation. After resolving, a
single **Opening values** note marks the header as this Year's opening resources,
separate from the actual outcome. Allocation shows food kept, automatic Export income, upkeep, and the
next-Year Budget together. Allocation opens at the minimum Storage, so surplus
is exported unless you choose to keep it. **Keep minimum** respects surviving
old food; **Keep maximum** respects the affordable range. Each shows the food it
keeps and the resulting next-Year Budget before you choose. Allocation and the
Year report each lead with one headline: the Population change (such as
**+50 people**), or the shortfall in tons during Famine, followed by the Famine
outcome in words. The Event appears once beneath it, and the other figures share
one readable stat row. Detailed accounting is under **Harvest, Event & Budget details**.
Earlier outcomes remain in the **Country chronicle**, a table of Year, Event,
Harvest, Population change and Budget, newest first, with Famine Years labelled
in text. Collapse replaces planning
with a run summary and a confirmed **Start a new run** action. The summary
states the cause using the final Year's Harvest, stored food and Consumption,
names the final Year's Event only when one occurred, and gives the run length in
Years and the Score; Milestone progress is hidden. The header keeps the final
Year played. On mobile, the
current decision appears before a compact landscape. Optional synthesized sound
starts off in every tab and can be muted immediately; animations respect reduced
motion. See [interface checks](docs/field-journal-ui.md) for manual examples.

Meeting Consumption grows population. A shortfall causes Famine and population
loss; no food means total Famine. **Score** records peak population, and doubling
milestones are celebrated. **Collapse** ends play below half the starting
population, including zero; there is no fixed winning population.

Progress saves after harvest commitment and allocation. Reloading during
allocation preserves the rolled outcome. The latest report returns on reload;
the Country chronicle summarises earlier outcomes. **Restart run** asks for
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
The reproducible policy results and hands-on observations are recorded in the
[balance and strategic-depth study](docs/balance-playtests.md).

The two-decision Turn, Field journal interface, responsive layout, outcome
history, storage-failure recovery, and configuration-driven descriptions are
implemented. Open issues
in the [tracker](https://github.com/barnabyg/growOrDie/issues) describe remaining
work; the app has no backend, accounts, multiplayer, or cloud synchronization.
Use [CONTEXT.md](CONTEXT.md) for terminology, [ADRs](docs/adr/) for decisions,
and [AGENTS.md](AGENTS.md) for contributor guidance.
