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
It starts at page one each time. Back/Next step through the guide; only the close icon or Escape
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

Guides close only with X or Escape; outside clicks must leave them open. Keep
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
