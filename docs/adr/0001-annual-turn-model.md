# Annual turn model

Each year has two decisions. First the player commits cultivation, fertilizer, new land preparation, and technology purchases. The simulation rolls the event exactly once and reveals harvest, consumption, famine, actual surplus, and the export price. A durable pending outcome keeps this decision intact across reloads.

The player then chooses storage from the actual affordable range. Surviving old food must stay in storage; the rest of the new harvest is exported automatically. Finalization applies population, score, collapse, revenue, and next year's state without drawing randomness again. Purchases take effect next year. Restart intentionally discards both completed progress and a pending harvest after confirmation.

Production reserves worst-case upkeep for old food surviving consumption before accepting commitments. Optional storage must fit the remaining opening budget; exports and tax fund the next year. Legacy negative budgets remain playable with zero discretionary spending; unavoidable retained-food upkeep may accrue debt until food is consumed and revenue restores funds.

This supersedes the original one-batch decision in favor of the two interaction points specified in issues #1, #4, and #17. There are no seasonal sub-turns.
