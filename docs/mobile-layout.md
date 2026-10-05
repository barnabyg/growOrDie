# Responsive layout verification

The Field journal interface retains all eight layout regression combinations
below. On small screens, the current production or allocation decision appears
before a compact landscape; Collapse replaces the planning controls. Within the
plan, Technologies follow production and precede the spending summary and
Resolve harvest at every width, so the commit button closes the whole plan. Sliders,
exact number inputs, forecasts, Technology cards and report cells wrap to the
available width.

Below the 840 px breakpoint a compact commit bar is pinned to the bottom of the
viewport. While planning it shows the ordinary food balance, Budget after the
plan and Resolve harvest; while allocating it shows Storage kept, the
next-Year Budget and Finish year (both values read "—" while the Storage entry
is invalid). The values update live. Its button mirrors the in-page commit
button exactly: the same label (including the shortfall warning text), warning
style and disabled state, and it commits the same decision. The page reserves
the bar's measured height as bottom padding and scroll padding, so the last
content can scroll clear of it and an input receiving focus is scrolled above
it. The bar is not shown at wider widths or after Collapse. Additional browser checks cover mobile dark mode, reduced
motion and unavailable audio. See [Field journal manual checks](field-journal-ui.md)
for the current interface. The issue reproduction below describes the earlier
presentation and the regression checks it established.

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
overlap, and that Technologies appear below production and above the spending
summary and Resolve harvest. At 320 and 390 px (and 760 px) the commit bar must
span the viewport bottom without overflowing or taking half the screen during
planning, allocation and the report; it must be absent at 1,280 px and after
Collapse. `tests/e2e/commit-bar.spec.js` checks live values, mirrored disabled
and warning states, committing from the bar, uncovered focused inputs and page
end at 390 px. The test operates labelled inputs and buttons through a seeded run.
Fresh-screen screenshots at 390 and 1280 px were visually inspected on
9 September 2026: mobile details are readable and the desktop country/content
columns remain side by side.

For manual verification, run `npm.cmd run build`, then `npm.cmd start`, and open
http://127.0.0.1:8000 in a disposable browser profile. Use responsive mode at the
widths above; repeat with enlarged text. Choose 400 cultivated hectares, 400
fertilized hectares, and Irrigation, then resolve and allocate the harvest.
Check the report and the Owned status on the Irrigation card. Resolve subsequent years with zero
cultivation until Collapse. Expect readable labels, costs, benefits, reports, and
buttons without horizontal page scrolling or clipped text. Below 840 px, the
pinned bar should follow every production and Storage change, match the
in-page button's label, colour and disabled state, and never hide the input
being edited or the How to play footer. At 1280 px and normal
text size, expect the country beside the planning panels, with the Country
chronicle directly beneath the country instead of an empty left column. While
planning after a completed Year, the Year report spans both columns above the
country and the plan; after Collapse it stays beneath the Collapse summary.
`tests/e2e/country.spec.js` checks that arrangement on the plan, allocation,
report and Collapse screens, and that the two columns end within 400 px of each
other on every one of them.

Automated enlarged-text checks set the root font size to 32 px; they do not
emulate every browser's text-only zoom setting. Physical mobile devices and other
browser engines have not been manually tested.
