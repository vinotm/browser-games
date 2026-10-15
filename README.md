# Browser Games

Browser games built with HTML, CSS, and JavaScript modules. Snake runs entirely in
the browser without a game server, framework, external assets, or npm dependencies.

Play Snake at `snake-game/`. See [the rules](snake-game/RULES.md) for scoring,
pickups, combos, and wall progression.

## Run locally

Use Python 3.9 or newer to start the preview server:

```sh
python3 preview_server.py --port 8000
```

Open `http://localhost:8000/`. Serve the project over HTTP: native JavaScript modules
are not intended to run by opening an HTML file directly. The preview serves game
assets, disables caching, and blocks private directories and repository files.

## Test

With Node.js 18 or newer:

```sh
npm test
```

The tests cover controls, scoring, effects, wall safety, pickup scheduling, device
categories, configuration, analytics delivery, and archive validation. They run
without network access or credentials.

## Publish

```sh
npm run build
```

Publish **only `dist/`** to a static host, such as GitHub Pages or Cloudflare Pages.
The export contains the homepage, Snake, shared browser assets, and icon attribution.
Paths support hosting at a domain root or a repository subpath. Tests, receiver
source, scripts, and private files are excluded from the deployed site.

Gameplay works without network access once its assets are loaded. Loading a hosted
site while offline requires an additional caching strategy; no service worker is
included.

## Optional analytics

Analytics are disabled by default. Gameplay, preferences, and personal bests work
without them. To enable reports, deploy the optional
[Apps Script receiver](analytics/apps-script/README.md), then build with its public URL:

```sh
SNAKE_ANALYTICS_ENDPOINT='https://example.com/analytics' npm run build
```

The URL becomes visible in the exported `snake-game/analytics-config.json` file.
It is public configuration, not an authentication credential. Never put keys,
passwords, access tokens, or private storage identifiers in browser configuration.
The in-game privacy statement reflects whether analytics are enabled.

Enabled reports contain game events, timestamps, scores, and broad device categories.
They contain no names, email addresses, raw user agents, exact viewport dimensions,
or precise location. Uploads are acknowledged, retried, and stored privately by the
receiver; game logic does not depend on successful uploads.

For the preview server, an optional ignored `snake-game/private/analytics-config.json`
can supply the same `analyticsEndpoint` setting. The server exposes only that public
setting through the normal configuration URL; it does not serve the private file.
The build uses its environment setting, not private preview overrides.

## Source layout

```text
index.html                 Game collection homepage
shared/css/                Common themes, layouts, and controls
shared/js/                 Theme, storage, input, clock, configuration, and analytics
snake-game/                Snake page, rules, rendering, and gameplay modules
analytics/apps-script/     Optional receiver and event format examples
tests/                     Automated regression tests
scripts/build.mjs          Public site export
preview_server.py          Restricted development server
```

Each game owns its state, rules, and rendering. Shared modules provide independent
utilities; they do not impose a common game engine. Game pages import only the
helpers they use. Keep deployment overrides and unpublished material in ignored
`private/` directories. Git ignore rules do not provide HTTP access control; use the
public export when deploying.

Snake's icon attribution is in [LUCIDE-LICENSE](snake-game/LUCIDE-LICENSE).
