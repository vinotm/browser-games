# Snake rules and mechanics

This is the current Snake specification. All logic runs in the browser. Temporary effect durations and critical statistics are hidden during play; the rules below specify their effects and limits.

## A run

- The board is 32×32 cells. The snake begins with five segments, moving right.
- Base movement is one cell every 80 ms on both desktop and mobile.
- Arrow keys, WASD, board swipes, and mobile arrow buttons share the same direction rules. A direct turn into the snake's neck is rejected; only one turn can be queued per movement step.
- Mobile buttons turn on press. A swipe turns as soon as movement reaches 12 pixels, without waiting for release. Each gesture emits one direction; lifting and swiping again begins another gesture.
- The board has a solid, textured, beveled rim marking its impassable boundary. Hitting a board edge, solid wall, or the snake's body ends the run. Moving into the departing tail is allowed when the snake is not growing.
- Pause and switching away from the page freeze gameplay and every timer. Restart resets all run state, including buffs, critical stats, and added walls. The personal best persists locally.

## Food and scoring

| Food | Base points | Lifetime |
| --- | ---: | ---: |
| Normal, static | 1 | 15 seconds |
| Normal, moving | 2 | 15 seconds |
| Large food, occupying 2×2 cells | 5 | 10 seconds |

Eating food grows the snake. Each food reward rolls independently for a critical result. Large food is an additional pickup; the regular food remains available alongside it.

Normal food relocates when its lifetime ends. It keeps its static/moving type, gets a fresh 15-second lifetime, and prefers a location at least two cells away from its old positions. If space is scarce, any safe position may be used. Relocation gives no points, growth, or unlock progress. Once at least three walls are solid, expired static or moving normal food also leaves a permanent one-cell wall at its last position (moving food uses the nearest grid cell). This extra wall fades in over 650 ms without an additional warning period, waiting if the snake or another item overlaps its cells. Food still relocates normally. These walls do not consume any of the 15 milestone-wall slots, but block movement and pickup placement like other solid walls. Restart clears them. Moving food normally advances one cell over six snake movement steps and changes direction when blocked by solid obstacles. It passes through warning outlines and forming walls. Wall materialization waits or recedes while the moving food overlaps its cells.

Special items and moving food become eligible after **five static normal foods eaten**, regardless of score. Critical points, large food, and buffs do not count toward this threshold. Moving-food rounds follow a geometric wait with a 20% chance at each eligible static-food collection: 20% immediately after the fifth food, 36% cumulatively by the sixth, and 48.8% by the seventh. The first four foods do not decrement this wait. Eating moving food resets the wait; merely expiring and relocating it keeps it moving.

## Combos

The first food starts a three-second timer. Each food eaten before expiry adds one combo step and refreshes the timer. Static, moving, and large foods each count as one; buffs and relocation never advance or refresh a combo. On expiry, the next food starts at one. Pause freezes the remaining time; restart clears the combo.

| Foods in combo | Score multiplier |
| --- | ---: |
| 1–2 | 1× |
| 3–5 | 1.5× |
| 6–9 | 2× |
| 10+ | 3× |

The threshold food gets its new multiplier. Final points are `ceil(base points × crit multiplier × combo multiplier)`, rounded once. A magnet capture group advances the combo once per frame; every food in it gets the resulting multiplier. Other food collections retain individual steps. Earned points remain when a combo ends.

The label COMBO and the count appear with matching prominence at the top center inside the board; combo 1 and the multiplier are hidden. Adaptive opacity reduces obstruction near the snake or pickups, and the display fades gradually during the final second before expiry. The label and number punch in together from a larger size on increases, starting immediately when combo 2 appears. The number ends in `!`; reduced-motion mode omits the punch. The remaining combo time is hidden. Buff timers and crit stats remain hidden. Wall checkpoints follow the displayed score, including critical and combo bonuses.

## Pickups

All buffs occupy 2×2 cells. At most one pickup of each type and four buff pickups total can be on the board. Pickups award no points. Scheduling begins after the five-food unlock and uses active play time. Blocked spawns retry rather than losing a whole interval. The shortener requires the snake to be longer than five segments.

| Pickup | Spawn window | Pickup lifetime | Effect after collection |
| --- | --- | --- | --- |
| Large food | 6–12 s | 10 s | Food reward |
| Shortener | 8–14 s | 10 s | Remove up to five tail segments, one per step; minimum length five |
| Lengthener | 10–16 s | 10 s | Grow five additional segments over movement steps |
| Speed up | Shared varied schedule below | 8 s | 75% of base step time for 3 s: 60 ms on all devices |
| Slow down | Shared varied schedule below | 8 s | 137.5% of base step time for 3 s: 110 ms on all devices |
| Reverse | Shared varied schedule below | 8 s | Swap left/right and up/down input for 10 s |
| Crit rate | 24–36 s | 7.5 s | Add five percentage points of crit chance |
| Magnet | Shared varied schedule below | 8 s | Attract nearby food and buffs for 10 s |
| Crit multiplier | 30–44 s | 7.5 s | Add 100 percentage points of crit bonus |

### Varied temporary-pickup schedule

Speed up, Slow down, Reverse, and Magnet share one scheduler instead of four independent timers starting together. The first arrives 14–24 seconds after unlock; any of the four can arrive first. After a successful spawn, the next arrival waits 5–10 seconds in 75% of cases, or 12–18 seconds in 25% of cases, creating occasional quieter stretches.

The item order comes from a shuffled six-item bag: two Speed ups, two Slow downs, one Reverse, and one Magnet. Consecutive items never repeat, including across bag boundaries. Each complete bag includes Reverse and Magnet, preventing a long random drought. The next bag reshuffles, so there is no fixed item sequence.

At least five seconds separate actual temporary-pickup arrivals, including opposing speed items. Two of these pickups can still coexist because each remains on the board for eight seconds. A blocked arrival retries after 1–2 seconds while retaining its selected item; it does not consume a bag entry. Other pickup types retain their independent randomized windows. If one is already present when due, it retries shortly after that item's expiry; other placement constraints retry after 2–4 seconds.

Picking up speed up while speed up is active refreshes its three-second duration without increasing speed further. Slow down follows the same rule. Picking up the opposite speed effect cancels both immediately and returns movement to the base speed; the new effect does not start. An expired effect does not cancel a newly collected opposite pickup.

Reverse and Magnet can coexist with each other and either speed effect. Recollecting either refreshes its ten-second duration without stacking strength. Reverse applies to all directional inputs, while the usual no-neck-turn rule remains in force. It does not reverse the snake's current travel direction automatically.

Shortening keeps the head moving normally and removes one extra tail segment per step, up to five extra segments, without reducing length below five. Food still awards its usual points and growth during shortening. Collecting a shortener cancels pending lengthening. A lengthener replaces its outstanding growth count with five; shortening already in progress finishes first. Effects and pickup lifetimes run on active time, so changing speed does not change their duration.

### Magnet

The radius is six grid cells, measured from the visible head to each pickup's center. Each nearby item is captured immediately: it leaves the board, awards its points/growth or applies its buff, and its icon flies into the moving head over 400 ms. The flight is a visual effect; collection is already guaranteed, so the snake cannot miss it by turning or moving away. Regular food, moving food, large food, and every buff type are affected, including harmful pickups. Capture works across walls and other obstacles within the radius.

Only items in range are captured. Capturing regular food preserves its normal/moving reward and unlock-progress rules, then spawns the next regular food. To avoid a synchronous respawn loop, at most one regular food is magnet-captured per rendered frame; the next one can be captured on the next frame if it is also in range. Every captured food adds a segment, and each food reward rolls independently for a critical hit. All simultaneous nearby buffs apply, including opposite speed cancellation.

Captured items cannot expire or be eaten a second time during their flights. Attraction does not refresh an uncaptured item's lifetime. Flights freeze when paused and clear on restart; reduced-motion mode grants the same immediate rewards without flying icons.

### Hidden critical scoring

- Start at 5% crit chance and a 100% bonus: a critical reward gives **2×** base points.
- Crit rate adds five percentage points, up to **50%** chance.
- Crit multiplier adds 100 percentage points of bonus: 2× becomes 3×, then 4×, up to **10×** total points (900% bonus).
- Extra pickups at either cap are consumed without raising that stat. All critical upgrades reset each run.
- No numerical critical stats or temporary-effect countdowns appear in the game.

## Walls and difficulty

Each run starts without walls. At 10 displayed points, one straight wall is guaranteed. At 20, 30, and 40, each checkpoint schedules one straight wall; until a checkpoint is skipped, each has a 25% chance to skip. After that single skip, every remaining early checkpoint must schedule its wall. This schedules 3–4 straight walls before 50. Starting at 50 and every 50 points thereafter (100, 150, etc.), 2–3 straight or L-shaped walls are scheduled. Progress follows the displayed score, including critical and combo bonuses. Each batch is planned as individual walls. The first planned wall gets a random 0.25–0.75 second active-play delay; subsequent plans each get a fresh random 1.5–2.5 second gap, including across milestones. Delays run from warning to warning: a new warning can appear while earlier walls are still forming or waiting for a safe path. Warnings stay at least 1.5 active-play seconds apart even after a delayed frame. Placement uses the current board when each individual warning appears. The total of solid, forming, and scheduled milestone walls is capped at 15 (expired-food walls are excluded); a straight or L-shaped wall counts as one wall, regardless of cell count. Batches are reduced to available capacity and no additional plans accumulate at the cap. Crossing multiple milestones schedules each one once. Pause freezes delays; restart discards them.

New walls first appear as dashed outer warning outlines, with no internal seam at L-shaped corners, for at least 1.5 seconds. Outlines do not collide with the snake. Placement protects the full snake, its recent movement, six cells in front of the head in the current and queued directions, current/projected moving food, and every pickup's full footprint when choosing the warning location. It also leaves clearance around these objects.

After the warning, a safe wall fades in over 650 ms at its full size. Straight and L-shaped walls fade as a single shape, without expanding their arms. It stays non-colliding throughout that transition. Safety is checked continuously; if current or interpolating snake cells or a pickup's footprint overlaps the wall, the fill smoothly recedes and waits. It becomes solid only once completely formed and safe, so crossing a warning outline never creates a wall on the snake. Heading toward a wall does not delay materialization; players must respond to the warning. Nearby objects do not delay materialization merely because they are adjacent; the wider placement margins apply only when choosing the warning location. New pickups avoid outlines. If outlines occupy the final available regular-food position, they are cancelled to preserve food availability.

Walls remain at least two clear cells apart and leave three-cell corridors along the board edges. Placement attempts are bounded. On crowded boards, fewer walls may be added rather than forcing unsafe walls. All wall warnings and milestones reset with a new run.

## Effect feedback

Pickups have distinct symbols and colors. Collection shows a brief label, with no timer number. Speed up adds an orange head glow and trail; Slow down adds blue rings; Reverse adds a purple opposite-arrow marker above the head that pulses during the last three active seconds and twice as quickly in the last second; the pickup badge is unchanged and reduced-motion mode keeps the marker steady; Magnet shows a teal attraction radius and lines to nearby pickups. These visuals disappear when effects end. Reduced-motion mode keeps the indicators while removing moving visual accents.

Critical rewards have larger floating point labels ending in `!`. Crit upgrades show “Luck up!” or “Power up!”; capped upgrades show “Charged!”. Cancelling opposing speed effects shows “Normal speed!”.

The mobile Pause icon remains fully tappable while fading near the snake or pickups. Start, Play again, Resume, and Restart use larger buttons. Resume and Restart sit alongside each other when space allows and wrap on narrower boards; the game-over score is visually emphasized.

## Source layout

- `js/config.js`: board settings, spawn windows, durations, icon paths, and palette.
- `js/game.js`: session state, timers, movement, collection, magnet collision checks, wall activation, and controls.
- `js/renderer.js`: canvas visuals and transient labels.
- `js/critical.js`: critical scoring and stat caps.
- `js/combo.js`: three-second chains, multiplier tiers, and score multipliers.
- `js/effects.js`: temporary-effect refresh/cancellation, direction mapping, speed, and magnet movement.
- `js/spawning.js`: moving-food probability and the varied temporary-pickup scheduler.
- `js/walls.js`: bounded wall generation and placement safety.
- `../shared/`: reusable theme, clock, input, storage, animation, and overlay helpers.

Run `npm test` from `browser-games/` for the dependency-free regression suite. Serve that folder over HTTP to play; native module imports require serving the whole project rather than only the Snake subfolder.

## Beta and data privacy view

The title carries a small beta label. Before the first Start, Data privacy opens a
statement inside the board, replacing the start view without opening a modal or a
new page. Back to game or Escape restores the same ready state. Viewing it does not
start the gameplay clock; gameplay input stays inactive. It explains anonymous
analytics, the collected categories, private storage, and deferred offline uploads. The GAS
receiver stores coarse per-run desktop/mobile/tablet and input/viewport categories.
Analytics are optional and disabled in the default public configuration. When enabled,
the privacy view describes report collection and uploading; otherwise, it states
that analytics are disabled and scores and preferences remain in the browser.

## Gameplay analytics

When analytics are configured, each run gets a random ID with a device snapshot and the game version. Events carry
a UTC run-start timestamp, elapsed wall-clock milliseconds (including pauses),
active-play milliseconds, increasing sequence numbers, and
stable object IDs linking spawn, collection, expiry, and wall lifecycle events.
Records cover run start/end/restart, pause/resume, food and buff spawn/eaten/expiry,
effect activation/refresh/cancellation/expiry, combo counts on food events and maximum
combo in the summary, wall scheduling/warnings/solid
activation/cancellation, and final score/death cause. Snake position is not recorded
every frame. No account identifier, raw user agent, exact viewport dimensions, name,
email, or precise location is collected.

Completed games upload immediately to the private Drive archive via GAS as compact
JSON stored in gzip-compressed `.json.gz` files. Empty fields are omitted, coordinates
use two decimal places, and timing details use integer milliseconds. Event UTC time is
run start plus elapsed milliseconds; active time stays separate to account for pauses.
Older queued schema 1 reports remain accepted. Event snapshots cannot be changed by
later gameplay mutations. Events
persist locally during play; a partial chunk is queued after 150 events or about
32 KiB, and when the page is hidden or closed. Long/interrupted runs can span files,
joined by run ID and event sequence. A previously unfinished run is marked abandoned
on reload. Unsent batches retry every 15 seconds while visible, on reconnection,
and at game end, with failure backoff. A batch is removed only after a matching
server acknowledgement. The bounded local queue retains up to 50 batches / about
500 KiB and discards oldest queued batches if full. Browser storage denial, offline
play, and upload failures do not prevent gameplay.
