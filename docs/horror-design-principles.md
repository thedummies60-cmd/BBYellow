# Horror design principles

Design constraints that shape the architecture. Here because they explain *why* several
rules in `CLAUDE.md` exist.

## Timing is the mechanic

Fear lives in delays: the beat before the creak, the pause before the stalker rounds the
corner. These are tuned in tens of milliseconds, which is why:

- Gameplay timing reads the **sim clock**, never `setTimeout` or wall time. It pauses
  with the game, scrubs in debug, and steps deterministically in tests.
- Timings live in `game/config/`, editable without a recompile.
- The simulation is fixed-step so a beat feels identical at 30 and 144 fps.

## Reproducibility

"It only happened once" is the most expensive class of bug we can ship. Every random
decision — patrol choice, flicker, ambient scare selection — draws from a seeded PRNG.
A player-visible seed turns an unreproducible report into a one-line test.

## Darkness is a budget, not a look

Real-time shadow casters are capped at **2** (`CLAUDE.md` §8, `src/render/CLAUDE.md`).
That cap is a design constraint: it forces lighting to be composed deliberately rather
than accumulated. Wanting a third caster is a signal the scene's light design needs
rethinking, not that the budget needs raising.

## Fairness

The player must be able to reconstruct their death. That means encounter logic stays
legible — one system, readable end to end. A death caused by three interacting systems
and a timer will read as cheap, and players are right when they say so.

Corollary: the simulation is authoritative and presentation-independent. If a scare
depends on a rendering artifact or a frame-rate quirk, it is not a scare, it is a bug
that happens to be frightening.

## Accessibility is not optional

- Subtitles for all dialogue and for significant non-speech audio cues.
- Photosensitivity: a documented flash/strobe intensity cap, with a setting to reduce it.
- Head-bob, motion-blur, and FOV are player settings; motion sickness is not difficulty.
- Audio cues that convey information always have a visual counterpart.

These are player-facing commitments, so they are enforced in code: cue definitions in
`game/config/` carry subtitle and visual-fallback fields, and a missing one fails config
validation at startup rather than shipping silently.
