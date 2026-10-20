# Game integration conventions

## Shared page controls

Every game uses `shared/js/page-shell.js` to create its theme switcher, underlined
Back to Homepage link, and leave confirmation. Import shared base and component CSS.
Keep a `[data-page-header]` element containing the game title and its left-side
placeholder or game-specific mode indicator. The shell supplies the theme button.
Use a homepage URL relative to the game, so repository-subpath hosting works.
The collection homepage uses the same shell without a home link.

```js
const page = createPageShell({
  homeUrl: '../',
  isActive: () => started && !finished,
});
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
before Start. State the purpose, main categories, exclusions, private storage, and
what happens to offline reports. Reflect the actual enabled configuration.

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
