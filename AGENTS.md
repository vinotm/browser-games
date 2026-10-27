# Browser Games conventions

## Privacy notes

Keep privacy views consistent across games using the conventions below.

- Keep privacy notes inside the board, with a simple back-to-game link.
- Anchor privacy content at the board’s top-left, inside its border. Left-align
  the heading, groups, and back link; never vertically center the view.
- Underline both “Data privacy” and “Back to game” links in light and dark themes.
- Use “Data privacy” as the heading. State the purpose, then use separate
  “Not collected” and “Collected” groups. Avoid “we” and “us”. Keep storage and
  offline retry details in the full privacy/analytics docs, not the in-board view. Use direct sentences; avoid slogans
  such as “A little data, a better game”. Do not impose a fixed paragraph count.
- Keep technical field lists and implementation details in analytics docs.
- Adapt categories and exclusions to the game's actual report schema. Do not claim
  anonymity or exclusions without checking them. Do not imply that hosting services
  receive no network metadata.
- If analytics are disabled, say so plainly and explain that local preferences stay
  in the browser. Never imply that disabled reports upload.

Example for an enabled deployment:

> Data privacy
>
> This game sends anonymous play reports for game improvement.
>
> **Not collected**
> [Verified exclusions]
>
> **Collected**
> [Main gameplay categories], device type
>
> ← Back to game

## Working branches

Game branches are for changes specific to that game. The `core` branch can contain
shared components, homepage work, cross-game fixes and assessments, documentation,
private analytics, or a dedicated game's changes when part of that work. It is not
restricted to shared code. Private material stays ignored regardless of branch.

## Game guides

Tutorials are optional; do not require them before a new game is ready. When a guide
is useful, use the shared tutorial module through the page shell, with visual
pages in the game's own `js/tutorial.js`. Keep each page to one visual example and one
short caption. Each page should be understood in about five seconds: use a game
example, with a few words underneath. Avoid paragraph-based tutorials.
Do not expose deliberately hidden rules or stats. Check the guide against actual
mechanics. Use the shared Home, guide, theme order, transparent icon controls, and
comfortable hit targets. Check title/beta overlap and all three controls at narrow
phone widths. Guides stay inside the board, support Next/Back, close, Escape and
focus return, and block game input. They must not block theme/navigation or trap keyboard
focus. Games decide whether ongoing play pauses.

## Public repository content

- Keep collection-wide setup and architecture in the root README. Put game rules,
  generation details, and analytics schemas in each game's documentation.
- Track product source, reusable tools, synthetic tests, and contributor-facing
  documentation. Exclude personal notes, credentials, real gameplay reports,
  dashboards, prototype pages, simulations, and temporary feature previews.
- Keep unpublished material in ignored `private/` directories. Never force-add it.
- Publish only the `dist/` export. Check both Git's tracked files and build output
  before releasing; a file being ignored does not remove an earlier tracked copy.
- Preserve required third-party license notices and attribution.

## Integrating games

Follow [game integration conventions](docs/GAME_CONVENTIONS.md) for all new games.
Use the shared page shell for theme controls, the Home icon link,
and active-game leave protection, including paused runs. Keep private development
helpers out of public imports and tests. Version affected games when shared components
change their behavior. Preserve standard source licensing separately from the
analytics disclosure described in [privacy](PRIVACY.md).

## Shared navigation design

- Group Home, optional guide, and theme icons to the right of the centered game title. Use the
  shared page shell; keep beta labels outside the title’s centering width.
  On compact screens, place Home on the left and guide/theme on the right,
  retaining 44px hit targets and the centered game name.
- All navigation icons must remain transparent on hover, press, and touch: no background
  shade, shadow, or brightness effect. Retain visible keyboard focus outlines.
- Explicitly exclude navigation icons from generic desktop icon hover rules;
  verify computed styles with a real mouse hover, since selector specificity can
  override a later transparent rule.
- Initial game entry has no fade or slide animation. Reveal the fully initialized
  scene and navigation together through the shared shell; do not reveal controls
  ahead of the board. Puzzle-loading feedback inside a running page is separate.
- Check short phone viewports for vertical clipping as well as horizontal overflow,
  and honor reduced-motion preferences.

## Keyboard shortcuts

Game input handlers must leave Alt-, Command/Meta-, and Control-modified keys
untouched unless implementing an explicit game shortcut. In particular, never
prevent browser Back/Forward arrow shortcuts or interpret them as moves. Active
and paused games rely on the shared leave guard for native navigation warnings.

Game titles link to their own start page. Active games use the same leave
confirmation as Home; confirmed navigation reloads the page and clears the run.

Guides close only with X or Escape; outside clicks must leave them open. Keep
captions literal and short. Show item effects without timers or hidden statistics.

Guide panels have square corners and stay inside the board’s playing edge, using
`--board-content-inset` for each game. Keep X at the top-right and the compact
Back · k/n · Next row fixed at the bottom. Content begins at the top and scrolls
independently if needed. Layer game menus above the guide, without blocking page
navigation or theme controls. Tutorial opens are not tracked in analytics.

## Interaction styling: required for every clickable element

Do not add decorative hover/focus fills, gray boxes, glows, shadows, lifts, or border
tints to buttons, icons, clickable game titles, tutorial controls, or homepage game
cards. Do not rely on browser defaults: disable the tap highlight on links and
buttons, and remove pointer-only focus outlines. A click or tap must not leave a
highlight behind. New controls inherit this rule; check them before finishing.

Keep an outline for keyboard-only `:focus-visible`, without a background fill.
Preserve meaningful selected/disabled/game states and deliberate held-button
feedback (for example Snake's arrow presses). Those are not hover decoration.
Check actual mouse hover, press/release, touch taps, keyboard Tab, and returning
with browser Back in both themes. Inspect computed styles and the final page;
adding a low-specificity reset does not prove the appearance is fixed.

On mobile, keep beta beside the title where it fits. At 360px and below, the raised
position is allowed to avoid crowding the title or shrinking navigation targets.


## Frontend skill and baseline

For Browser Games frontend implementation, polish or review, use
`browser-games-frontend` and `frontend-no-slop`. Anti-slop guidance applies by
default unless the user explicitly approves a specific exception; never infer a
blanket exception from existing code or a previous one-off design decision.
Read the [frontend baseline and start-menu rules](docs/GAME_CONVENTIONS.md#frontend-workflow-and-design-baseline)
before changing setup controls or game actions. Reuse the shared start-menu CSS
and select component. Match the reference's style **and dimensions**, not just
its layout. Start game and New game are green primary actions; muted secondary
styling is for secondary actions. Verify actual computed styles and rendered
states on phones and desktop in both themes before reporting completion.
