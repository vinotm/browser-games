# Browser Games

A collection of browser games built with HTML, CSS, and native JavaScript modules.
Gameplay runs locally in the browser without a game server, framework, or runtime
package dependencies. Each game owns its rules and state; shared modules provide
common controls, themes, storage, and other utilities.

| Game | Play path | Documentation |
| --- | --- | --- |
| Snake | `snake-game/` | [Overview](snake-game/README.md) · [Rules](snake-game/RULES.md) · [Analytics](snake-game/analytics/README.md) |
| Sudoku | `sudoku-game/` | [Overview and rules](sudoku-game/README.md) · [Puzzle generation](sudoku-game/DIFFICULTY.md) · [Analytics](sudoku-game/analytics/README.md) |
| SOS | `sos-game/` | [Overview and rules](sos-game/README.md) · [Analytics](sos-game/analytics/README.md) |

## Run locally

Use Python 3.9 or newer:

```sh
python3 preview_server.py --port 8000
```

Open `http://localhost:8000/`. Native JavaScript modules require HTTP serving rather
than opening HTML files directly. The preview server binds to loopback, disables
asset caching, and restricts served paths. It is a development tool, not a
production web server.

## Test

With Node.js 18 or newer, run:

```sh
npm test
```

Tests cover game logic, puzzle generation, shared utilities, analytics validation
and delivery, and the public export. They use synthetic data without network access
or credentials. No package installation is required.

## Publish

```sh
npm run build
```

Deploy **only `dist/`** to a static host such as GitHub Pages or Cloudflare Pages.
The export contains game pages, shared browser assets, and required icon attribution.
Repository documentation, tests, receiver sources, development tools, and private
files are excluded. Relative asset paths support domain-root and subpath hosting.

Gameplay works without a network connection once assets are loaded. Opening a
hosted site while offline requires an additional caching strategy; the collection
does not include a service worker.

## Optional analytics

Analytics are disabled in public clones and are independent for each game.
See each game's analytics documentation for its report format, receiver setup,
storage limits, and privacy behavior.

| Game | Public endpoint build setting | Optional environment override |
| --- | --- | --- |
| Snake | `SNAKE_ANALYTICS_ENDPOINT` | `SNAKE_ENVIRONMENT` |
| Sudoku | `SUDOKU_ANALYTICS_ENDPOINT` | `SUDOKU_ENVIRONMENT` |
| SOS | `SOS_ANALYTICS_ENDPOINT` | `SOS_ENVIRONMENT` |

Endpoint URLs are public configuration. Never include credentials, access tokens,
or private storage identifiers in browser code or build settings exported to the
site. Upload failures do not block gameplay. Each game's in-board privacy view
reflects whether analytics are enabled.

## Source layout

```text
index.html                 Collection homepage
shared/                    Reusable browser utilities and styles
snake-game/                Snake source, rules, and analytics receiver
sudoku-game/               Sudoku source, generation docs, and analytics receiver
sos-game/                  SOS rules, computer opponent, and analytics receiver
tests/                     Automated tests using synthetic fixtures
scripts/                   Static export and source fingerprint tools
preview_server.py          Restricted local development server
```

Keep deployment overrides, real gameplay reports, analysis output, and unpublished
review assets in ignored `private/` directories. Ignore rules do not provide HTTP
access control; deploy the static export rather than the source directory.

Third-party icon attribution is in [Snake's icon license](snake-game/LUCIDE-LICENSE).

## Development conventions

The collection is version `0.6`. Shared navigation, theme controls, leave protection,
private tooling, and analytics disclosure follow the
[game integration conventions](docs/GAME_CONVENTIONS.md). New games should use the
shared page shell instead of implementing those controls independently. Optional
in-board guides use shared pagination and each game’s own short guide content.

## License and privacy

Project source is available under the [MIT license](LICENSE). Third-party assets
retain their own attribution and terms. Analytics-enabled deployments disclose their
small anonymous gameplay reports separately; see [privacy](PRIVACY.md).
