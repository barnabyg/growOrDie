# Field journal interface

The interface presents each year as a country journal: plan production, reveal
the harvest, allocate food, then read the year report. The landscape, food
outlook, Technology cards, milestones and optional sound make the existing game
easier to read. The simulation, two-stage turn, prices, purchase timing and v1
save format are unchanged. The artwork and sound are generated locally; no
external assets or services are required.

## Playing

Panels are flat: each one is a single panel level whose subsections (food
outlook, Technologies, spending, allocation totals) are grouped by headings and
dividers rather than by tinted boxes, and Technology cards and the Milestone
banner are outlined, not filled. Headings carry no eyebrow labels that repeat
them. Each panel keeps at most one short helper line, marked `.helper`: the
Technologies timing ("One-off · effects start next Year") in the plan and the
Storage range in allocation ("500 t–1,460 t affordable · 500 t of old food must
stay"), which carries only decision information: the affordable range and any
mandatory minimum, with the upkeep rate beside the Storage label. The general
explanations (fertilizer and weather, the forecast being an estimate until the
Event is rolled, mandatory Storage upkeep in plan spending, Technology timing
and landmarks, the Storage and export trade-off, export of new Harvest only,
and reloading a committed Harvest) live in How to play.

The plan reads top to bottom: production (cultivate, fertilize, prepare) and
the food outlook, then Technologies, then the spending summary and Resolve
harvest. Every investment is visible, and reachable by keyboard, before the
Year is committed.

Each Technology card shows its name and cost on one line and a single benefit
line derived from configuration, such as "50% less Storage upkeep". A status
line appears only when it differs from the default: Owned, Selected, or the
coins still needed, such as "Need 1,800 coins more". The whole card is the
click target; a real checkbox inside it keeps keyboard and screen-reader
access, with the name as its label and cost, benefit and status as its
description. Owned cards cannot be toggled.

Production sliders and exact number inputs stay in sync. Shortcuts cultivate or
fertilize all available land; the first-year suggestion selects both. Later
Years open with the previous Year's cultivation and fertilization, derived from
the latest saved outcome and clamped to prepared land and the Budget left after
mandatory upkeep (fertilizer is reduced before cultivation). Legacy
summary-only history keeps the old default: cultivate all, fertilize none.
When the ordinary forecast shows a shortfall, Resolve harvest switches to a
warning style that states it, for example "Resolve with 250 t shortfall".
Spending
and the food outlook update before resolving. The outlook compares ordinary,
drought and flood harvests against Consumption, including opening Storage and
food destroyed by floods. It uses only Technology already owned at the start of
the year. Newly prepared land and newly purchased Technology help next year.
These scenarios describe possible outcomes, rather than predicting the event.
A single food bar shows Harvest and opening Storage with a Consumption marker;
any shortfall up to the marker is shaded in the danger colour. Labelled values
beneath the bar identify each part, and the bar's accessible description states
available food, Consumption and the balance. The drought outcome is always
visible; the full scenario table stays in the Weather scenarios disclosure.

Cultivate, Fertilize and Prepare each show the most hectares affordable while
keeping the other current choices, including mandatory Storage upkeep and
selected Technology; reducing cultivation also reduces fertilization. A red
band under each slider marks the unaffordable range, which remains reachable.
When the plan exceeds the Budget, the overspend message appears under the most
recently changed input that exceeds its maximum (or under every such input),
is linked to it for assistive technology, and the summary error remains. When
selecting a Technology is what took the plan over Budget, the message ("Over
Budget by 1,000 coins") appears on that card instead, linked to its checkbox,
and the production fields show none; deselecting the card clears it.

The country shows cultivated, prepared and unprepared shares, weather, a growing
village and owned Technology landmarks. Its parcels illustrate aggregate
hectares; they do not introduce separate fields to manage. Each legend swatch
is drawn like its land: striped crops (tinted by drought or flood), bare
prepared soil, and pale land with a tree for unprepared hectares. Each house
stands for up to 500 people; faded houses show Population lost since its peak,
and the caption says so when any appear. The landmark line below the Milestone
meter appears only once a Technology is owned. Loading or reloading shows the saved
country without animating; later changes still animate unless reduced motion is
set. Editing production shows a labelled planning preview. Allocation and
completed reports show the actual resolved year; older saves without
cultivation data say Unknown.

The resource header answers where you are and what you have: Year, Population
with the latest Year's change, Storage and Budget. A one-line status describes
the next action; there is no step indicator, because the turn has only two
decisions and the active panel already shows which one is due. Score sits with
the Milestone meter and the export price with the allocation results. Headings
and captions avoid repeating the current Year, so it appears at most twice on
screen. During allocation, one "Opening values" note marks the header values as
this Year's opening resources. The allocation panel shows actual Population,
Consumption and surplus, then previews retained Storage, exports, income, upkeep
and the next Budget. The Storage choice opens at the minimum (surviving old food
that must stay), and Keep minimum and Keep maximum each show their Storage and
next Budget. Invalid
storage entries hide those totals until corrected.

Allocation and completed reports share one outcome presentation
(`src/outcome.ts`). A single headline leads with the key number: the
Population change ("+50 people"), or during Famine the food shortfall in tons
("400 t shortfall"). Beneath it the Famine outcome is written out (No famine,
Partial famine or Total famine), so Famine never relies on colour alone.
Allocation states the Event once, with its icon, as supporting context. The
remaining figures sit in a shared stat row at a readable size: Population,
Harvest, Consumption, Surplus and export price during allocation; Population,
peak, Storage and Budget in the Year report. Completed reports put detailed
accounting behind an expandable disclosure.
Previous years remain in the Country chronicle, which continues the country
column beneath the landscape on desktop. While planning, the latest Year report
spans both desktop columns above the country and the plan, and the first-year
suggestion sits beside the plan heading, so neither column is left mostly
empty; after Collapse the report follows the Collapse summary. Small screens
keep their order. It is a compact table of Year, Event,
Harvest, Population change and the Budget carried forward, newest Year first.
Famine Years are labelled in text (Partial famine, Total famine, plus Collapse)
with a warning sign as well as colour. Legacy summary-only entries show their
recorded summary as the Event and Unknown for figures they never stored.
Before the first Harvest the chronicle says "Your first Harvest will begin the
story."; that line disappears as soon as a Harvest is committed, including
while its allocation is still pending.

Informational text is never smaller than 13 px at the default root size
(`--text-small`). Serif headings and the outcome headline use lining figures,
so "Year 1" and "+50 people" sit evenly beside the system-font figures. Number
inputs are light wells in light mode (darker wells in dark mode) with a border
of at least 3:1 contrast against their panel, so they read as editable.

All screens share one formatter (`src/format.ts`): money always shows coins
with correct plurals, rates read like 10.00 coins/t or 3 coins/ha, food
uses t and land uses ha. Famine reads No famine, Partial famine or Total
famine, and player-facing text counts Years rather than Turns. The flood
outlook mentions lost Storage only when some would be lost. After Collapse
the header keeps the final Year played.

Milestones track the highest Population reached. Collapse replaces production
and Technology controls with the final outcome and a restart action. Its
summary states the cause in the final Year's food figures, for example
"Partial famine: Harvest 200 t and 73 t stored against 1,277 t needed.
Population fell from 1,277 to 273, below half the starting 1,000.", or, for a
total famine, that no one could be fed. Stored food is the opening Storage that
survived any flood. The final Year's Event appears only when one occurred. The
run length in Years and the Score follow; Milestone progress is hidden because
there is nothing left to plan. Restart run is a danger-styled action at the
foot of the page, away from routine controls. It and Collapse's Start a new run
open the same in-page confirmation dialog, which states that the current run
(its Year and Population, any chronicle and any Harvest awaiting allocation)
will be replaced. The dialog traps focus, opens on Keep playing, and Escape or
Keep playing cancels without changing the run or a pending allocation. Focus
returns to the button that opened it, or to the plan heading when that button
is gone after a restart, or to Retry when the new run could not be saved. On
small screens the
current decision appears before the compact landscape. The interface follows
the system's light/dark and reduced-motion settings. Sound starts off. The
header's Sound toggle keeps the stable label "Sound" and shows its state with
the icon, an On/Off tag and `aria-pressed`; its setting lasts for the current
page only.

## Manual checks

Use Node.js 24.13 or later within major version 24. After `npm.cmd ci` and
`npm.cmd run build`, start `npm.cmd start` and open http://127.0.0.1:8000. To avoid
existing progress, use a disposable browser profile or a new loopback origin:
set `$env:PORT='0'` before starting and open the printed address.

1. Start a fresh game. Cultivating 400 ha without fertilizer forecasts 800 t
   against 1,000 t Consumption: a 200 t shortfall, shaded at the end of the
   food bar up to the Consumption marker, and the warning-styled button reads
   "Resolve with 200 t shortfall". Choose the first-year suggestion; the button
   returns to "Resolve harvest". Cultivation and fertilization should both read
   400 ha, spending should be 2,000 coins and ordinary surplus should be 600 t,
   with no shaded shortfall. Without expanding anything, the drought line should
   read 800 t Harvest and a 200 t shortfall. Expand weather scenarios: flood
   should yield 960 t with a 40 t shortfall.
2. Operate production controls by pointer and keyboard. Sliders and number
   inputs should agree; reducing cultivation should also limit fertilization.
   With the suggested plan, each production input should show its affordable
   maximum: 400 ha to cultivate, 400 ha to fertilize and 33 ha to prepare.
   Preparing 100 ha should mark the slider beyond 33 ha in red, show "Over
   Budget: at most 33 ha is affordable with the rest of this plan." directly
   below Prepare new land, keep the summary error and disable Resolve. A screen
   reader should announce that message with the preparation input, and the
   slider should still reach 1,600 ha. The preparation note should say the new
   land is available next year. Reset preparation to zero before continuing;
   the inline message should disappear. Still with the suggested plan, select
   High-yield seeds: its card should read "Over Budget by 1,000 coins", no
   production field should show a message, the summary error should remain and
   Resolve should be disabled. A screen reader should announce the message with
   the checkbox, which is marked invalid. Deselect it; the message should
   disappear.
3. Check that Technologies sit between production and the spending summary,
   and that tabbing from the production controls reaches every Technology
   before Resolve harvest. Each card should show name and cost on one line,
   one benefit line, and no status until it is selected, unaffordable or
   Owned. Click the card's padding or benefit text to select a Technology; it
   should read Selected, and cards the remaining Budget cannot cover should
   show the coins still needed. Its cost should change spending
   but its benefit should not change this year's forecast. Resolve an affordable
   plan: the event and actual food totals should appear, while one note marks
   the header as opening values. Reload
   during allocation; the event and storage limits should remain identical.
   Finish the year: the Technology becomes Owned, its landmark appears, and the
   following year's forecast includes its benefit.
4. With the ordinary fixture below (seed 5), cultivate and fertilize 400 ha,
   prepare zero and buy no Technology. The allocation headline should read
   "+50 people" over "No famine", with "No event" stated once beneath it; with
   300 ha unfertilized instead it reads "400 t shortfall" over "Partial
   famine". Allocation should open at 0 t kept,
   exporting 600 t with a next Budget of 12,200 coins. Keep minimum should read
   0 t kept and 12,200 coins; Keep maximum should read 600 t kept and 5,600
   coins. Reload: the same default should return. Retain 200 t. The preview
   and saved report should agree: export 400 t, income 4,000 coins, upkeep 200 coins, next Budget
   10,000 coins and Population 1,050. Reload and check the report and chronicle.
   Year 2 should open with 400 ha cultivated and fertilized, preparation and
   Technologies at zero, and a plain "Resolve harvest" button. Setting
   fertilizer to 0 should show "Resolve with 50 t shortfall" in the warning
   style (800 t plus 200 t Storage against 1,050 t); the button stays enabled.
   Restore 400 ha and edit inputs to check the label updates live.
5. Use seed 29 with opening Storage of 2,000 t. The same production plan should
   reveal a flood: 500 t destroyed, 960 t harvested and 1,460 t surplus. Minimum
   retention should be 500 t. Entering 499 should disable confirmation and hide
   stale preview totals. Retaining 600 t should export 860 t for 8,600 coins,
   charge 600 coins upkeep and leave a next Budget of 14,200 coins.
6. Resolve a fresh game with zero cultivation. Collapse should take focus and
   replace planning and Technology controls. The header should still show
   Year 1, the run length should read 1 Year and the report should say Total
   famine. The summary should read "Total famine: Harvest 0 t and 0 t stored
   against 1,000 t needed. No one could be fed, so the population reached
   zero.", show no Event line, show Score 1,000 and hide Next Milestone. For
   the below-half cause, use seed 5 with `save.state.population = 1277`,
   `save.state.highestPopulation = 1300` and `save.state.storageTons = 73`, then
   cultivate 100 ha without fertilizer: expect "Harvest 200 t and 73 t stored
   against 1,277 t needed" and a fall from 1,277 to 273. Seed 43 with 200 t
   Storage and the same plan adds a Flood line. Start a new run: an in-page
   dialog should say the run and its chronicle of 1 Year will be replaced, with
   focus on Keep playing. Tab and Shift+Tab should stay inside the dialog. Press
   Escape: the outcome remains and focus returns to Start a new run. Confirm a
   restart and expect Year 1 with an empty chronicle and focus on the plan
   heading. Resolve a harvest, enter a Storage amount, then use Restart run at
   the foot of the page and choose Keep playing; the allocation and the entered
   amount should remain.
7. Check 320, 390, 760 and 1,280 px widths, normal and doubled text size, and
   light/dark appearance. Expect wrapping without horizontal scrolling. With
   reduced motion enabled, expect no reveal or landscape animation. Reloading
   any screen should show the correct village immediately, without houses
   fading out. Compare each legend swatch with the parcels it names. Enable
   sound, complete a year and mute it; sound should be optional and should not
   block play when browser audio is unavailable. The Sound toggle should read
   "Sound" in both states, with a crossed-out speaker and Off tag when muted and
   a filled On tag when enabled; a screen reader should announce it as a
   pressed or not-pressed toggle button. Shortcut actions should look
   like rounded, outlined chips: tinted on hover, a gold ring on keyboard focus,
   and a dashed grey outline when unavailable. No panel should contain a
   tinted box (Technology cards, food outlook, allocation totals and the
   Milestone banner sit directly on the panel), no heading should carry an
   uppercase eyebrow, and How to play should explain fertilizer, the forecast,
   Storage upkeep, Technologies and exports. After a few Years, the Country
   chronicle table should list the newest Year first, label any Famine Year in
   text with a warning sign, and fit at 320 px; with doubled text it may scroll
   inside its own box but never widens the page.
8. On a fresh run the chronicle shows "Your first Harvest will begin the
   story."; resolve a Harvest and the line should be gone during allocation,
   after a reload and once the Year is finished. Check that no informational
   text (field details, affordable maximums, legend, Technology benefits,
   chronicle, commit bar) looks smaller than the body text's small size, that
   "Year 1" and "+50 people" use full-height figures, and that number inputs
   look like editable fields with a clear border in light and dark mode. At
   390 px, no label should touch the slider or input below it on the plan,
   allocation or report screens.

For deterministic checks, use the developer console on the disposable page:

```js
const { newSave, persist } = await import("/dist/persistence.js");
const save = newSave(5); // use 29 for the flood fixture
// save.state.storageTons = 2000; // enable for the flood fixture
persist(save);
location.reload();
```

## Automated coverage and limits

`tests/outlook.test.ts` compares forecasts with real simulation outcomes under
ordinary, drought and flood events, including tuned configuration, owned
Technology and delayed purchases, plus the food bar's segment and marker
positions. `tests/carryover.test.ts` covers the carried
plan's derivation, clamping and legacy fallback. `tests/affordability.test.ts`
checks each input's affordable maximum against the Resolve gate.
`tests/overspend.test.ts` covers which production inputs or Technology card
carry the overspend message.
`tests/e2e/journal.spec.js` checks the carried plan and shortfall warning,
controls, affordable maximums and inline overspend messages on production
fields and Technology cards,
forecasts without save mutations, the food bar's description and 3:1 non-text
contrast in light and dark mode, allocation accounting and reloads, purchase
timing, Technology placement and keyboard order within the plan, landmarks,
milestones, Collapse summaries for total famine, a fall below half and a
flood (cause, Event line, Score, hidden Milestone progress, restart), mobile dark mode, reduced motion, unavailable audio, and
the four-resource header with its opening-values note and at most two visible
mentions of the current Year at 390 and 1,280 px. `tests/header.test.ts` covers
the header text, Population change and status; `tests/collapse.test.ts` covers
the Collapse summary's cause sentence for both causes, flood-surviving Storage,
the Event line and the legacy fallback. `tests/chronicle.test.ts` covers
chronicle rows, including legacy summary-only entries, and
`tests/e2e/game.spec.js` checks the table with a mixed history at 320 px. `tests/outcome.test.ts` covers
the outcome headline (Population change or Famine shortfall) against resolved
Harvests, and `tests/e2e/journal.spec.js` checks both outcome screens' headline,
single Event mention, shared stat sizes and focus. `tests/technology.test.ts`
covers Technology benefit lines under default and tuned configuration and the
card status rules, and the journal browser suite checks whole-card toggling,
locked Owned cards, the checkbox's accessible name and description, and AA
contrast of cost and status text in light and dark mode. `tests/restart.test.ts`
covers the Restart dialog's warning text; `tests/e2e/game.spec.js` checks the
dialog's placement, danger style, accessible name and description, focus
trap, Escape, focus return and absence of native browser dialogs, and the
journal checks cover the Sound toggle's stable name, On/Off tag and
`aria-pressed`. `tests/format.test.ts` covers
units, rates and plurals; `tests/e2e/copy.spec.js` fails if raw identifiers or
Turn wording appear on plan, allocation, report, chronicle or Collapse screens.
`tests/e2e/layout.spec.js` also checks that shortcut actions render as bordered
chips with AA contrast in light and dark mode, distinct hover and dashed
disabled states, and targets of at least 24 px (fine pointer) or 44 px (coarse
pointer). `tests/e2e/country.spec.js` checks that legend swatches match the
drawn land and weather tint, faded houses are explained, a reload starts no
landscape transitions, and the desktop chronicle sits beneath the country,
with columns that end within 400 px of each other on every screen;
`tests/landscape.test.ts` covers the house counts. `tests/e2e/panels.spec.js`
checks that no tinted container sits inside another on the plan, allocation,
report and Collapse screens in light and dark mode, that no eyebrow labels
remain, that each panel shows at most one helper line (counting the allocation
Storage range) while How to play covers the removed explanations, and that no
label butts against the Cultivate field at 390 px in Year 2. `tests/e2e/polish.spec.js` checks that no visible text
on the plan, allocation and report screens renders below 13 px at 1,280 and
390 px, that serif text containing digits renders lining figures (measured
from the digit glyphs' ink, not the computed style), that number inputs are
not darker than their panel in light mode and have a border of at
least 3:1 against it in light and dark mode, that no label row touches the
next control below it at 390 px on the plan, allocation and report screens,
and that the chronicle's empty state hides once a Harvest is committed, across
a reload. Existing game, persistence
and layout checks remain in place.
Run `npm.cmd run verify` for the canonical full gate.

Browser automation checks behavior and layout, but cannot judge sound quality or
art direction. Physical touch devices, speaker output and browser engines other
than Chromium still need manual testing.
