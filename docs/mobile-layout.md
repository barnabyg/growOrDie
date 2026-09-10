# Responsive layout verification

Issue #16 was reproduced in Chromium with a 320 px viewport and a 377 px page
scroll width. Technology rows could not wrap and the mobile grid retained its
content's minimum width.

The mobile grid now permits shrinking, Technology details stack beneath their
label, and report cells wrap long values. Desktop retains its two-column layout;
Technology rows wrap when enlarged text needs additional space. Content is not
hidden to suppress overflow.

The browser regression in `tests/e2e/layout.spec.js` passed at 320, 390, 760, and
1280 px, each with 100% and 200% root text size. All eight combinations check
that page scroll width does not exceed viewport width on fresh, allocation,
completed-report, Owned-Technology, and Collapse screens. They also check that
Technology fields have positive width, remain inside the viewport, and do not
overlap. The test operates labelled inputs and buttons through a seeded run.
Fresh-screen screenshots at 390 and 1280 px were visually inspected on
9 September 2026: mobile details are readable and the desktop country/content
columns remain side by side.

For manual verification, run `npm.cmd run build`, then `npm.cmd start`, and open
http://127.0.0.1:8000 in a disposable browser profile. Use responsive mode at the
widths above; repeat with enlarged text. Choose 400 cultivated hectares, 400
fertilized hectares, and Irrigation, then resolve and allocate the harvest.
Check the report and Owned indicator. Resolve subsequent years with zero
cultivation until Collapse. Expect readable labels, costs, effects, reports, and
buttons without horizontal page scrolling or clipped text. At 1280 px and normal
text size, expect the country beside the planning panels.

Automated enlarged-text checks set the root font size to 32 px; they do not
emulate every browser's text-only zoom setting. Physical mobile devices and other
browser engines have not been manually tested.
