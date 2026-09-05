# Annual turn model

The game advances in yearly turns: the player allocates the whole annual budget, then the year resolves in one batch (event → harvest → trade → population). Chosen over quarterly sub-steps because it matches the annual-budget framing, keeps the decision loop tight and readable, and makes every choice a clear yearly trade-off. Seasonal or intra-year depth can be added later without breaking the model.
