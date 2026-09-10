# Balance and strategic-depth study

This study addresses issue #26 against the balance configuration at commit
`33a0ecb`. It records evidence; it does not change the balance. The economy and
interaction correctness fixes through issues #10, #12, #17, #21, and #22 were
already present when the study was run on 10 September 2026.

## Method

The automated study runs six deterministic policies for 40 Turns on run seeds
`0`, `3`, `4`, `29`, `43`, `100`, `250`, `999`, `2026`, and `12345`. It uses the
production/allocation boundary (`beginTurn` and `finishTurn`), including
affordability and Storage bounds, rather than calling the lower-level simulation
with impossible plans.

Run it from a clean checkout with Node.js 24.13 or later:

```powershell
npm.cmd ci
npm.cmd run build
node scripts/balance-study.js > balance-study.json
```

The JSON contains the aggregate table, every seed/policy result, the first three
opening plans, Technology purchase years, and the following measures:

- **Survival:** Turns completed before Collapse, capped at 40.
- **Peak population:** the game's Score.
- **Milestone:** the first Turn that reaches a population of 2,000.
- **Bad Event absorbed:** a Drought or Flood that does not reduce population.
- **Recovered:** after a population-reducing Drought or Flood, population returns
  to at least its pre-Event value within five Turns.
- **Storage upkeep:** cumulative upkeep paid, excluding the export income forgone
  by retaining food.

These policies are intentionally simple and inspectable, not optimal agents:

| Policy              | Production and investment                                                                                              | Allocation                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Reserve             | Fully fertilize; buy Irrigation, Granary, High-yield seeds, then cost and trade Technologies; prepare up to 25 ha/Turn | Retain up to one year's population |
| Reserve, no Storage | Same plan as Reserve, as a Storage counterfactual                                                                      | Export every optional ton          |
| Growth              | Fully fertilize; prepare up to 100 ha before buying land, yield, cost, defensive, and trade Technologies               | Export every optional ton          |
| Export              | Fully fertilize; buy yield/cost/trade Technologies before preparing up to 50 ha                                        | Export every optional ton          |
| Lean                | Fertilize only enough for 5% growth in an ordinary Turn; prepare up to 50 ha before Technologies                       | Retain a quarter-year reserve      |
| No Technology       | Fully fertilize and prepare up to 50 ha; never buy Technology                                                          | Export every optional ton          |

For a concrete opening, seed 43 produced these first three plans. Entries are
`cultivated/fertilized/prepared hectares; purchase; stored tons`:

| Policy        | Year 1                   | Year 2                | Year 3                          |
| ------------- | ------------------------ | --------------------- | ------------------------------- |
| Reserve       | 400/400/0; Irrigation; 0 | 400/400/25; none; 340 | 425/425/25; Granary; 601        |
| Growth        | 400/400/33; none; 0      | 433/433/28; none; 0   | 461/461/100; Land survey; 0     |
| Export        | 400/400/33; none; 0      | 433/433/28; none; 0   | 461/461/50; High-yield seeds; 0 |
| Lean          | 400/125/47; none; 0      | 447/0/27; none; 11    | 474/0/50; none; 174             |
| No Technology | 400/400/33; none; 0      | 433/433/28; none; 0   | 461/461/50; none; 0             |

## Automated outcomes

| Policy              | Reached 40 Turns | Mean peak population | Mean final Budget | First milestone, mean Turn | Bad-Event outcomes                | Mean Storage upkeep |
| ------------------- | ---------------: | -------------------: | ----------------: | -------------------------: | --------------------------------- | ------------------: |
| Reserve             |            10/10 |                6,415 |         1,051,605 |                       16.9 | 121 absorbed + 5 recovered / 126  |              54,072 |
| Reserve, no Storage |            10/10 |                5,709 |         1,234,160 |                       16.9 | 110 absorbed + 11 recovered / 126 |                   0 |
| Growth              |            10/10 |                5,722 |         3,175,594 |                       19.2 | 116 absorbed + 10 recovered / 126 |                   0 |
| Export              |            10/10 |                5,722 |         2,441,576 |                       19.2 | 116 absorbed + 10 recovered / 126 |                   0 |
| Lean                |             8/10 |                3,148 |           815,047 |                       28.1 | 90 absorbed + 1 recovered / 103   |               6,949 |
| No Technology       |            10/10 |                4,766 |           906,900 |                       19.3 | 97 absorbed + 23 recovered / 126  |                   0 |

The two Lean failures were seeds 0 and 29. Both collapsed below half the starting
population after Turn 2 with a peak population of 1,000. Every other run reached
the horizon, and every horizon survivor reached the first growth milestone.

### Investment, Storage, and Technology

The opening creates a real investment-versus-survival constraint. Fully
fertilizing 400 ha and buying Irrigation spends the entire 4,000-coin opening
Budget. Even after a successful harvest, no money remains for Storage upkeep in
that allocation. Land-first policies instead prepare only 33 ha in the opening
because that is the most their remaining 2,000 coins can fund.

Storage had measurable defensive value in the matched Reserve comparison. It
raised mean peak population by 706 (12.4%) and absorbed 11 more bad Events. It
did not change survival or average first-milestone timing in this sample, and it
reduced mean final Budget by 182,555 before counting its 54,072 mean upkeep
separately. Retention therefore trades cash for a higher population ceiling, but
the cash sacrifice does not threaten the mature Reserve economy.

Technology also had measurable value without being necessary for survival. The
Export policy and its No-Technology control use the same full-input, 50-ha
expansion shape. Technology raised mean peak population from 4,766 to 5,722 and
mean final Budget from 906,900 to 2,441,576. It increased immediately absorbed
bad Events from 97 to 116. Nevertheless, the no-Technology control survived all
ten seeds and reached the first milestone at almost the same mean time (19.3
versus 19.2).

The configured discounts have understandable long-run break-even points:

- Land survey costs 2,000 and saves 30 coins per prepared hectare, so it repays
  after about 67 ha.
- Fertilizer works costs 2,500 and saves 1.5 coins per fertilized hectare-Turn,
  so it repays after about 1,667 hectare-Turns.
- Granary costs 2,500 and saves 0.5 coin per stored ton-Turn, so it repays after
  5,000 ton-Turns.
- At a 10-coin export price, Trade routes adds 2 coins per exported ton and
  repays after 1,500 exported tons.

All are reachable in the studied policies. High-yield seeds and Irrigation are
primarily food-security and Score purchases rather than pure cost discounts.

### Dominance and milestones

No policy dominated across every reported objective. Reserve earned the highest
mean Score and Event absorption, while Growth accumulated roughly three times
as much final cash. The Growth and Export policies produced identical survival,
Score, milestone, and Event outcomes on every paired seed; Growth merely ended
with 30% more cash. This is evidence that, once full fertilization is funded,
the tested 50-versus-100-ha expansion and early Technology-order choice do not
create different population decisions over 40 Turns.

Budget growth is the strongest verified balance concern. All fully fertilized
strategies survived every run, final mean Budgets ranged from 906,900 without
Technology to 3,175,594 for Growth, and a strategy buying no Technology still
reached the milestone in every seed. The opening is constrained, but the mature
economy loses financial pressure well before the 40-Turn horizon.

The Lean result is not by itself a balance defect. It deliberately holds only an
ordinary-year margin and therefore exposes itself to hidden Events before it can
fund resilience. Its two early collapses demonstrate that opening risk is real.

## Hands-on browser playtest

I also played eight Turns through the real page, choosing a Reserve-style plan
Turn by Turn rather than replaying a generated policy. This browser-created run
used the following observable Event trail: none, Flood, none, Flood, none,
Drought, Drought, upward price shock.

| Turn | Key choice and outcome                                                                                                                                                      |
| ---: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|    1 | Fertilized all 400 ha and bought Irrigation. Harvest was 1,600 t, population grew to 1,050, Budget became 10,200, but the opening spend made Storage unaffordable.          |
|    2 | Fertilized all, prepared 25 ha, and bought Granary. A Flood cut Harvest to 960 t; partial Famine reduced population to 960.                                                 |
|    3 | Bought High-yield seeds. An ordinary 1,700 t Harvest restored population to 1,008 and funded 740 t Storage.                                                                 |
|    4 | Bought Fertilizer works. A Flood destroyed 185 stored tons, but 1,530 t Harvest plus reserves avoided Famine; population reached 1,058.                                     |
|    5 | Prepared 25 ha and bought Land survey. Stored 1,111 t after a 2,550 t Harvest; exports lifted Budget to 17,130.                                                             |
|    6 | Prepared 25 ha and bought Trade routes. Irrigation limited a Drought loss to 25%; 2,025 t Harvest still supported growth to 1,167.                                          |
|    7 | Prepared 25 ha. A second Drought still allowed growth to 1,225; Budget reached 37,018.                                                                                      |
|    8 | Prepared 25 ha. A price shock plus Trade routes offered 16.80 coins/t. Keeping 1,286 t still exported 1,714 t for 28,795 coins; population reached 1,286 and Budget 67,814. |

### Clarity and decision quality observations

Verified from the page:

- Cost, affordability, Technology timing, Storage range, upkeep, and forgone
  exports are shown with concrete numbers. The allocation preview made the
  price-shock choice especially legible.
- The event log and reports made recovery from the Turn-2 Famine easy to follow.
  The Turn-4 Flood visibly consumed 185 stored tons, so Storage did not feel
  cosmetic.
- The planning screen does not show expected Harvest or next Consumption. The
  default plan cultivates all land but fertilizes zero hectares; in the opening,
  that ordinary Harvest is only 800 t against 1,000 t Consumption. A new player
  must derive this risk from the Yield labels or learn it after committing.
- By Turn 8, the reserve plan owned every Technology, had survived two Floods and
  two consecutive Droughts, and held 67,814 coins. Retaining a full reserve during
  the 16.80-coin price shock had a clearly displayed opportunity cost, but the
  accumulated Budget made that sacrifice feel inconsequential.

Subjective observations, not verified defects:

- The first four Turns produced meaningful tension: an opening Technology ruled
  out Storage, the first Flood caused a Famine, and the next investments visibly
  improved recovery.
- After High-yield seeds and the two cost-reduction Technologies came online,
  the decisions became procedural: fully fertilize, prepare land, and retain the
  target reserve. The Event reveal remained readable but stopped forcing a plan
  change.
- Reaching the first milestone takes 15–20 Turns for the robust automated
  policies. That may feel slow without an intermediate goal, but this is a pacing
  preference that needs more human players before tuning.

## Conclusions and targeted follow-up

The evidence supports two findings:

1. **Planning clarity gap:** show an ordinary-year Harvest estimate alongside
   next Consumption before commitment. This would expose the dangerous default
   opening without forecasting the hidden Event.
2. **Late-game financial pressure gap:** study a recurring late-game cost or
   additional money sink before changing individual prices. Raising Storage
   upkeep alone would not address the no-Storage Growth policy's 3.18-million
   mean final Budget.

No numerical tuning is recommended from ten seeds and one human run. In
particular, the data does not justify weakening Storage or Technologies: both
had measurable value, and no single policy dominated both Score and Budget.
A follow-up balance experiment should first define the intended value of cash at
Turn 20–40 and the desired milestone pace, then rerun this exact seed set plus a
larger random sample. Additional human playtests should compare the current page
with an ordinary-Harvest/Consumption preview and record whether players can
explain their opening risk before resolving it.

## Limits

- Ten curated seeds expose known Event patterns but are not a statistical sample
  of the full seed space.
- Deterministic policies do not adapt to price or recent Events and cannot measure
  fun, surprise, or player learning.
- The 40-Turn cap measures medium-term safety, not indefinite survival.
- Final Budget is not part of the current Score, so cash dominance and game-goal
  dominance are different claims.
- The hands-on run's random seed is not displayed by the game; its observable
  Event trail and decisions are recorded, while exact seed reproduction comes
  from the automated study.
