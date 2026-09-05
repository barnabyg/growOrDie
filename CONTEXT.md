# Grow or Die

A web-based simulation game in which the player manages an agriculture-based country, trying to grow the population while surviving random events and a volatile export market.

## Language

### Time

**Turn**: One year of play: the player allocates the annual budget, then the year resolves in one batch — event, harvest, trade, population update. Displayed in-game as "Year N".
_Avoid_: round, cycle, phase

**Event**: A random occurrence that may affect a turn; at most one per year. In v1: drought, flood, export price shock.
_Avoid_: disaster, incident

### Land and food

**Arable land**: The finite total hectares of the country that can ever be cultivated.
_Avoid_: territory, farmland (for the total pool)

**Prepared land**: Hectares on which the one-off preparation cost has been paid; they can be cultivated in any future year without re-preparation.
_Avoid_: cleared land, developed land

**Cultivated land**: Prepared hectares actually sown this turn; they incur seed and fertilizer costs and produce yield. Always a subset of prepared land.
_Avoid_: planted area (as a separate concept)

**Yield**: Food produced per cultivated hectare: the base rate modified by fertilizer, technology, and events.
_Avoid_: harvest (for the per-hectare figure)

**Harvest**: The total food grown in a turn, before consumption and allocation.

**Consumption**: The food the population needs this turn to be sustained.

**Surplus**: The food remaining after consumption — harvest plus opening storage. The player chooses how much of it to store; the rest is exported automatically.
_Avoid_: profit, remainder

**Famine**: A turn in which available food falls short of consumption; the population shrinks.
_Avoid_: shortage (as a state name)

### Economy

**Budget**: The money available for spending this turn: this turn's revenue plus any unspent balance carried over from the previous turn.
_Avoid_: treasury, cash

**Score**: The highest population reached during a run; there is no fixed win condition.

**Milestone**: A celebration triggered each time the population doubles (×2, ×4, ×8… of the starting value).

**Revenue**: What refills the budget each turn: per-capita tax on the population plus income from exports.

**World price**: The price paid per ton of exported food; it varies within fixed bounds year to year and is visible to the player before they allocate.
_Avoid_: market rate, exchange rate

**Export**: The automatic sale, at world price, of all surplus not chosen for storage. Only new harvest can be exported — stored food never leaves the country.

**Storage**: Food carried over from one turn to the next; it incurs an annual upkeep cost per ton, cannot be exported, and has no capacity limit.
_Avoid_: reserve, granary (granary is a Technology that lowers upkeep)

### Population

**Population**: The number of people in the country; it grows when consumption is met and shrinks during famine.

**Collapse**: The end state of a run: population falls below 50% of its starting value or reaches zero.
_Avoid_: defeat, game over (as domain terms)

### Technology

**Technology**: A one-off budget purchase with a permanent effect; there are no prerequisites between technologies.
_Avoid_: upgrade, research, tech tree
