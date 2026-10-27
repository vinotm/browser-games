# Game integration conventions

## Shared page controls

Every game uses `shared/js/page-shell.js` to create its theme switcher, Home link, optional game guide, and leave confirmation. Import shared base and component CSS.
Keep a `[data-page-header]` element containing the game title and its left-side
placeholder or game-specific mode indicator. The shell supplies matching Home, optional guide, and theme icons grouped on the right of the
title row, without hover backgrounds. Home retains an accessible name and tooltip. Keep beta labels absolutely positioned beside the title
so only the game name determines its center.
Use a homepage URL relative to the game, so repository-subpath hosting works.
The collection homepage uses the same shell without a home link.

```js
const page = createPageShell({
  homeUrl: '../',
  ready: false,
  isActive: () => started && !finished,
});
// After initial game setup (or the initial loading view) finishes:
void page.reveal();
// Call after every change to whether unfinished progress exists.
page.refresh();
```

The link and theme switcher have no hover background or tap shade. Maintain visible
keyboard focus. Shared theme initialization runs in the document head before styles
paint. Do not duplicate theme SVGs or preference handling in game pages.

## Frontend workflow and design baseline

Use the `browser-games-frontend` skill for collection frontend work. Apply
`frontend-no-slop` by default, including its relevant catalog checks. An explicit
product decision may override a particular design rule; keep that exception
limited to the approved element and behavior. Existing code is a reference, not
permission to copy a visual inconsistency. User instructions take precedence.

### Start menus and primary actions

SOS is the visual reference for compact start-menu fields. Memory and Sudoku
share `shared/css/setup-select.css` and `shared/js/select.js`. Reuse these when
adding comparable menus, rather than copying a screenshot into separate CSS.

- Shared text buttons use explicit inline-flex centering on both axes. Preserve
  grid/flex overrides for icon controls, board cells and dropdowns; do not use
  per-label pixel nudges to compensate for native button baselines.
- Keep setup inside the board. Place each setting label to the left of its
  control, vertically centered, with consistent label/control columns.
- A single selection belongs on the same start screen as **Start game** and
  **Data privacy**. Do not add a redundant Start → selection → Play sequence.
- Use `.setup-select-row` inside `.overlay.start-menu`. The shared style supplies
  the compact width, typography, border, background, chevron and responsive
  spacing. Current control width is 170px (158px on narrow phones), with a 46px
  mobile height and 40px desktop height. These describe setup controls, not all
  buttons or navigation targets.
- Use `enhanceSelect()` for animated, keyboard-accessible choices, selected
  checkmarks and automatic upward placement. Do not substitute a browser-native
  select or a custom lookalike with different proportions.
- Use the theme's green `--primary` for **Start game** and **New game**. New game
  is a main game action, not a muted secondary action; do not give it
  `class="secondary"`. Keep disabled buttons visibly disabled before play.
- Compact Start game uses the shared 16px text and 44px minimum height. Snake's
  established centered start/pause scene is a separate layout; do not resize it
  merely to adopt these setup conventions.
- Keep Data privacy underlined and below Start game, with breathing room. Use
  the actual enabled/disabled analytics disclosure, not copied claims.
- New game returns to setup when settings need selection. Ask before discarding
  an unfinished run; cancellation preserves the board, settings and game state.
  Completed games need no progress-loss warning. Respect each game's timing rules.
- Primary coloring does not mean destructive confirmation should dominate.
  Preserve **Keep playing** emphasis when asking to discard ongoing progress.

Shared changes should stay scoped to their component. Do not change another game's
established menus, gameplay controls or version just because a shared file exists.

### Review before handoff

Inspect both source and the running page. Check a desktop width, a normal phone
width and a narrow/short phone (for example 1440px, 390px and 320px), in light and
dark themes. For the controls changed, verify:

- Label/control alignment, dropdown width and height, text size, chevron padding,
  Start/New game color and spacing. Compare against the reference, not just the
  presence of a CSS class.
- The start scene, open dropdown (including the bottom option), chosen value,
  disabled state, active game, restart cancellation and return to setup.
- Real mouse hover, press/release, touch activation and keyboard navigation.
  Pointer interaction must not leave a fill, shade, glow or focus box. Keep an
  outline for keyboard focus and meaningful selected/disabled states.
- No page overflow or clipped controls. Large boards may scroll intentionally
  inside their playing area; ordinary setup should not force scrolling.
- No JavaScript errors or private helpers in public imports/build output.

Run the relevant gameplay checks when changing behavior and `npm run build` for
public asset changes. Report checks that failed or could not run. Source inspection
alone is not proof that responsive CSS or interaction styling works.

## Leaving an unfinished game

Active means started and unfinished, including a paused game. Ready screens and
completed games do not prompt. Each game provides its state predicate and calls
`page.refresh()` when that predicate can change. The shared guard attaches
`beforeunload` only while unfinished progress exists.

Ordinary same-tab links show a shared modal with Keep playing emphasized, Leave game,
a close control, Escape, backdrop dismissal, and native dialog focus containment.
Modified clicks, downloads, and links opening another tab do not discard the current
page and are not intercepted. A confirmed link bypasses a second native prompt.
Returning through browser history re-evaluates protection.

Games that advance automatically can supply `onPrompt`, which pauses play and returns
a callback to restore the previous running state when staying. Snake uses this;
an already paused Snake remains paused. Sudoku keeps its timer running during the
confirmation. Game shortcuts must ignore input while `page.isConfirming()` is true.

Refresh, tab closure, browser Back, and address-bar navigation use the browser's
own generic confirmation. Browsers forbid custom text or a custom HTML modal for
these actions. They require prior interaction and may omit the event entirely on
mobile app termination; this is protection against accidents, not a recovery system.
See [beforeunload behavior](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event).

## Public source and private development material

The root README describes collection setup and architecture. Each game owns its
overview, rules, generation details, and analytics schema. Document current behavior
rather than personal development history. Use synthetic public test fixtures.

Keep dashboards, real reports, simulations, prototypes, and retired development-only
helpers in ignored `private/` directories. Public modules and tests must not import
private files: fresh clones must work without them. The preview server does not serve
private directories. Export only allowlisted public assets through `npm run build`;
Git ignore rules alone are not web-server access control. Before release, inspect
tracked files and the built output, including nested private paths and local settings.

## Analytics disclosure

The source is MIT-licensed; analytics disclosure is a separate product requirement,
not an extra license restriction. Public clones have collection disabled by default.
Every game that enables analytics must disclose it in a short privacy view reachable
before Start. State the purpose, then separate “Not collected” and “Collected”
groups without “we” or “us”. Keep storage and offline retry details in the full
privacy and analytics documentation. Reflect the actual enabled configuration.

Collect only what helps improve the game. Prefer cumulative counters when an event
stream is unnecessary. Random run IDs identify attempts, not persistent people.
Do not add visitor identifiers, location, personal data, or precise browser metadata
without revisiting both the design and the disclosure. Service providers can process
request metadata independently of fields the game records; avoid broader anonymity
claims than the implementation supports. See [privacy](../PRIVACY.md).

## Versions and attribution

The collection version describes shared shell and homepage releases. Game versions
also change when shared components affect their experience; a small shared change
may use a dotted beta revision. Show only a small beta label in page titles; keep numeric versions in package
metadata, analytics constants, and game documentation. Preserve old report versions during retries.
Source fingerprints identify exact asset changes independently of release labels.

Retain required third-party notices. Git author names and emails are ordinary
contribution attribution; use a no-reply address for future contributions if desired.
Do not rewrite existing history or remove copyright attribution as routine cleanup.

## Elapsed-time displays

Use `formatDuration` from `shared/js/clock.js` for live timers and completion
screens. It displays `m:ss` below one hour and `h:mm:ss` from one hour onward,
with no day rollover (for example, `25:00:00`). Games own their timing rules;
use the shared `createClock` when active-play timing with pause/resume is needed.

For initial page entry, all games use `page-entering` on the body to avoid
painting an incomplete scene. `page.reveal()` waits for page assets and fonts, then
reveals the initialized scene and navigation in the same frame without fades or
slides. Navigation stays hidden and inert until then. The homepage theme control
renders immediately. In-board puzzle-loading feedback remains independent of
initial entry.

## Scrollable boards

Use `shared/js/board-navigation.js` with `shared/css/board-navigation.css` for finite
boards that need panning and zooming. Supply the viewport, board stage, control host,
default geometry and game-specific selection/availability callbacks. The component
provides touch and mouse dragging, pinch zoom, Ctrl/Cmd + wheel zoom around the
pointer inside an active board, an accessible zoom slider, persistent
position bars for overflowing axes, and a return to playing size before selection.
Keep a visible outline on the actual grid boundary so it remains recognizable while
panning. Game coordinates and scoring must remain independent of display zoom.

## Optional in-board guides

Pass `tutorial: { host, pages }` to `createPageShell` when a game has a guide. Omit
it entirely otherwise; the shell adds no empty icon slot. Keep the pages in the
game folder, usually `js/tutorial.js`. Each page has a `title`, a `visual()` function returning a game-owned DOM/SVG
example, and a short `caption`. Aim for understanding in five seconds. Avoid prose
blocks or exhaustive feature inventories. The shared `shared/js/tutorial.js` owns rendering, pagination,
board input protection, Escape dismissal, board-relative placement, and focus
return. The guide is a non-modal board panel: it does not trap focus or make the
rest of the page inert. Theme and navigation stay usable. Static game scenes can use `createGuideScene`; never insert player input or reports
into SVG markup.

The guide occupies the board rather than a separate page or a full-screen panel.
It starts at page one each time. Back/Next, Left/Right arrows, A/D, and horizontal swipes step through the guide; only the close icon or Escape
returns to the game. Outside clicks do not dismiss it; Next is disabled on the last page. Long content scrolls within the guide without moving its footer.
The navigation order is Home, guide, theme, with identical transparent controls.
On compact screens, Home sits on the left and guide/theme on the right; each
control keeps a 44px target. Test narrow screens for title and beta-label overlap.

`page.isConfirming()` includes an open guide, so existing game input and bot guards
also protect guide reading. `tutorial.onOpen` can return a cleanup callback to restore
play; by default the shell reuses `onPrompt`. Snake pauses and restores its previous
state. Sudoku keeps counting time. SOS defers bot placement until the guide closes.
Do not reset, restart, or count tutorial reading as a new run.

Keep privacy wording direct: “Data privacy”, the purpose, and visually separated
collection and exclusion groups. Avoid promotional headings and first-person copy. See
[AGENTS.md](../AGENTS.md) for the copy convention and branch scope.

## Game title navigation

The shell makes each game title a link to `./`, clearing query parameters and
returning to that game’s initial page. Active or paused runs get the shared leave
confirmation, even when the destination is the current URL. Cancelling preserves
play; accepting reloads once, without a second native warning. Ready and completed
games navigate directly. Standard modified clicks retain browser behavior.

Guide navigation ignores modified keys, typing fields and open modal dialogs.
Vertical gestures retain content scrolling; horizontal swipes turn one page without
wrapping at the ends. Guides close only with X or Escape; outside clicks must leave them open. Keep
captions literal and short. Show item effects without timers or hidden statistics.

## Information-panel layout

Privacy views start at the top-left inside the board border, with left-aligned
headings, groups and return links. This applies to every game. Guide panels use
square corners with no extra border. Set `--board-content-inset` on the board host
to preserve its edge (Snake 6px, Sudoku 2px, SOS 0px because its parent owns the border).
Guide content starts at the top. X and the centered Back · k/n · Next footer remain
fixed while content scrolls. Menus must layer above the guide. Tutorial opens are
not collected by analytics.

## Click and hover appearance

All clickable controls, including homepage game cards and game-title links, keep
their resting appearance on hover and pointer focus. Disable browser tap highlights;
no decorative fill, shadow, lift, or border tint may linger after a click. Keyboard
focus uses an outline only. Functional selected/disabled states and intentional
held-button feedback stay visible. See the interaction rules in AGENTS.md.

Mobile beta labels sit beside the title above 360px; at narrower widths they stay
raised so the centered name and full-size navigation targets fit.

## Link previews

Each page includes static Open Graph and large-image Twitter card metadata in its
document head, so link crawlers can read it without running JavaScript. Approved
1200 × 630 PNGs live in `shared/social/` and must be explicitly included in the
public build allowlist. Use a dark background, no titles or beta labels in the
image, and centered game artwork. Individual game previews have no surrounding
card; the homepage groups the game artwork in separate boxes.

Metadata titles and descriptions remain plain text outside the image. Supply
image dimensions, MIME type, and descriptive alt text. Preview image and page URLs
are absolute URLs for the production site; forks or deployments on another domain
should update these URLs in all four document heads. Use a new image filename when
replacing artwork, since external services can cache previews.

### Board navigation and guides

The shared board navigator restores playing scale on selection by default. Games
that support revealing cards at the chosen scale can set `resetZoomOnSelect: false`.
The page shell treats an open guide as blocking game input. External controls
that remain usable can check `isConfirming({ includeTutorial: false })`; keep
real confirmation dialogs blocking. Use `closeTutorial()` when an action returns
to setup, after confirmation succeeds. Cancellation should preserve the guide.
