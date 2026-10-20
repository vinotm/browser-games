# Browser Games conventions

## Privacy notes

Keep privacy views consistent across games using the conventions below.

- Keep privacy notes inside the board, with a simple back-to-game link.
- Left-align the heading, paragraphs, and back link on a shared left edge.
- Underline both “Data privacy” and “Back to game” links in light and dark themes.
- Use a short heading and three brief paragraphs: why reports help, the main data
  categories and exclusions, then private storage and offline upload behavior.
- Prefer plain, concise copy. Keep technical field lists and implementation details
  in analytics documentation rather than the player-facing privacy view.
- Adapt the data categories to the game. Describe only what is actually collected;
  never copy another game's anonymity or exclusion claims without verifying them.
- If analytics are disabled, state that clearly instead of implying reports upload.

Suggested structure:

> A little data, a better game
>
> Small, anonymous gameplay reports help improve [game].
>
> Reports include [main categories]. [Relevant personal data or player content]
> aren’t collected.
>
> Reports are stored privately. Offline reports upload when you’re connected again.
>
> ← Back to game

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
Use the shared page shell for theme controls, the underlined Back to Homepage link,
and active-game leave protection, including paused runs. Keep private development
helpers out of public imports and tests. Version affected games when shared components
change their behavior. Preserve standard source licensing separately from the
analytics disclosure described in [privacy](PRIVACY.md).
