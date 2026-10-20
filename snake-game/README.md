# Snake

A browser Snake game with timed pickups, critical scoring, combos, and progressive
walls. Move with arrow keys or WASD, swipe on the board, or use the mobile direction
buttons. Collect food and avoid the board boundary, solid walls, and the snake's body.

Use Start to begin, pause to suspend play, and Play again after a collision. The best
score is saved in the browser. Critical statistics and effect timers remain hidden
during play; visible effects indicate active pickups and expiring combos.

- [Rules and mechanics](RULES.md): scoring, pickup schedules, controls, and wall safety.
- [Analytics](analytics/README.md): optional event reports and the Apps Script receiver.
- [Icon attribution](LUCIDE-LICENSE): third-party icon terms.

Serve the repository root and open `snake-game/`. See the
[collection README](../README.md) for local preview, testing, and publishing.

## Collection navigation

The current version is `beta-4.1`. Theme controls and Back to Homepage come from the
shared page shell. Leaving a running or paused game requires confirmation; ready
and completed runs do not. The in-page confirmation pauses a running snake and
resumes it when cancelled, while an already paused run stays paused.
