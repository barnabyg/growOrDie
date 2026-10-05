# Field journal interface

The interface presents each year as a country journal: plan production, reveal
the harvest, allocate food, then read the year report. The landscape, food
outlook, Technology cards, milestones and optional sound make the existing game
easier to read. The simulation, two-stage turn, prices, purchase timing and v1
save format are unchanged. The artwork and sound are generated locally; no
external assets or services are required.

## Playing

Production sliders and exact number inputs stay in sync. Shortcuts cultivate or
fertilize all available land; the first-year suggestion selects both. Spending
and the food outlook update before resolving. The outlook compares ordinary,
drought and flood harvests against Consumption, including opening Storage and
food destroyed by floods. It uses only Technology already owned at the start of
the year. Newly prepared land and newly purchased Technology help next year.
These scenarios describe possible outcomes, rather than predicting the event.

Cultivate, Fertilize and Prepare each show the most hectares affordable while
keeping the other current choices, including mandatory Storage upkeep and
selected Technology; reducing cultivation also reduces fertilization. A red
band under each slider marks the unaffordable range, which remains reachable.
When the plan exceeds the Budget, the overspend message appears under the most
recently changed input that exceeds its maximum (or under every such input),
is linked to it for assistive technology, and the summary error remains.

The country shows cultivated, prepared and unprepared shares, weather, a growing
village and owned Technology landmarks. Its parcels illustrate aggregate
hectares; they do not introduce separate fields to manage. Editing production
shows a labelled planning preview. Allocation and completed reports show the
actual resolved year; older saves without cultivation data say Unknown.

During allocation, the resource header explicitly labels the opening values.
The allocation panel shows actual Population, Consumption and surplus, then
previews retained Storage, exports, income, upkeep and the next Budget. Invalid
storage entries hide those totals until corrected. Completed reports lead with
the outcome and put detailed accounting behind an expandable disclosure.
Previous years remain in the Country chronicle.

Milestones track the highest Population reached. Collapse replaces production
and Technology controls with the final outcome and a restart action. Restarting
a progressed or pending game still requires confirmation. On small screens the
current decision appears before the compact landscape. The interface follows
the system's light/dark and reduced-motion settings. Sound starts off and can be
enabled or muted from the header; its setting lasts for the current page only.

## Manual checks

Use Node.js 24.13 or later within major version 24. After `npm.cmd ci` and
`npm.cmd run build`, start `npm.cmd start` and open http://127.0.0.1:8000. To avoid
existing progress, use a disposable browser profile or a new loopback origin:
set `$env:PORT='0'` before starting and open the printed address.

1. Start a fresh game. Cultivating 400 ha without fertilizer forecasts 800 t
   against 1,000 t Consumption: a 200 t shortfall. Choose the first-year
   suggestion. Cultivation and fertilization should both read 400 ha, spending
   should be 2,000 coins and ordinary surplus should be 600 t. Expand weather
   scenarios: drought should yield 800 t with a 200 t shortfall; flood should
   yield 960 t with a 40 t shortfall.
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
   the inline message should disappear.
3. Select a Technology. Its cost should change spending but its benefit should
   not change this year's forecast. Resolve an affordable plan: the event and
   actual food totals should appear, while header values say Opening. Reload
   during allocation; the event and storage limits should remain identical.
   Finish the year: the Technology becomes Owned, its landmark appears, and the
   following year's forecast includes its benefit.
4. With the ordinary fixture below (seed 5), cultivate and fertilize 400 ha,
   prepare zero and buy no Technology. Retain 200 t. The preview and saved report
   should agree: export 400 t, income 4,000 coins, upkeep 200 coins, next Budget
   10,000 coins and Population 1,050. Reload and check the report and chronicle.
5. Use seed 29 with opening Storage of 2,000 t. The same production plan should
   reveal a flood: 500 t destroyed, 960 t harvested and 1,460 t surplus. Minimum
   retention should be 500 t. Entering 499 should disable confirmation and hide
   stale preview totals. Retaining 600 t should export 860 t for 8,600 coins,
   charge 600 coins upkeep and leave a next Budget of 14,200 coins.
6. Resolve a fresh game with zero cultivation. Collapse should take focus and
   replace planning and Technology controls. Cancel a restart and check the
   outcome remains; confirm a restart and expect Year 1 with an empty chronicle.
   Repeat cancellation while allocation is pending to check preservation there.
7. Check 320, 390, 760 and 1,280 px widths, normal and doubled text size, and
   light/dark appearance. Expect wrapping without horizontal scrolling. With
   reduced motion enabled, expect no reveal or landscape animation. Enable
   sound, complete a year and mute it; sound should be optional and should not
   block play when browser audio is unavailable.

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
Technology and delayed purchases. `tests/affordability.test.ts` checks each
input's affordable maximum against the Resolve gate. `tests/e2e/journal.spec.js`
checks controls, affordable maximums and inline overspend messages,
forecasts without save mutations, allocation accounting and reloads, purchase
timing, landmarks, milestones, Collapse, mobile dark mode, reduced motion and
unavailable audio. Existing game, persistence and layout checks remain in place.
Run `npm.cmd run verify` for the canonical full gate.

Browser automation checks behavior and layout, but cannot judge sound quality or
art direction. Physical touch devices, speaker output and browser engines other
than Chromium still need manual testing.
