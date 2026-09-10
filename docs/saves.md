# Saved games and recovery

The game stores a version 1 save in browser localStorage under
`growOrDie.save.v1`. Loading validates the saved state before allowing play:

- Year must be a positive safe integer.
- Population, land, stored food, and world price must be finite and nonnegative.
- Prepared land cannot exceed arable land.
- Budget must be finite. Negative Budget remains valid legacy debt.

Validation checks these relationships without imposing today's maximum land,
price, or Budget settings on older saves.

Score is recovered as the highest of the starting population, current population,
and a finite saved Score. Missing or malformed Score cannot reduce that minimum.
Collapse is derived from population: zero means total Famine; below half the
starting population means Collapse; otherwise the run remains playable. Stale
saved Collapse flags and causes do not override these rules.

Older version 1 saves without Technologies, Score, Collapse, or an event log remain
readable. Missing Technologies and logs default to empty lists. Malformed
display-only log entries are dropped. Invalid core state, unsupported save
versions, malformed JSON, and invalid committed harvest outcomes cause the game
to display a fresh run instead. Loading alone does not delete or overwrite the
original storage value; the next successful harvest save or explicit Restart
replaces it. Copy the original localStorage value before continuing if recovery
of a damaged save is needed.

A storage access exception is handled separately from invalid save contents.
Failed reads pause play and offer Retry, protecting an unknown existing run.
Failed Turn writes display the unsaved result and pause further advances until
Retry succeeds. Closing or reloading the tab loses unsaved progress. A failed
Restart keeps the current run until the new run can be saved successfully.

New completed Turns also retain their report and resulting state in the event
log. Expand an outcome to inspect its population/Famine, food, trade and Budget
figures; the latest completed report is restored after reload, including while
the next harvest awaits allocation. The history panel scrolls rather than growing
the main page indefinitely. Legacy summary-only entries stay summary-only.
Malformed optional report details are discarded while their summary and the
current run remain readable. Reports increase save size; if browser quota is
reached, the normal unsaved-result warning and Retry behavior apply. History is
not silently pruned, and a failed write leaves the previous stored run intact.
