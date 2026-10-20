# Browser Games conventions

## Privacy notes

Use the privacy view in `snake-game/index.html` and `snake-game/style.css` as the
reference for new games.

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
