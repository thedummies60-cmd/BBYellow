# tests/

- `unit/` — pure logic from `core/` and `game/`. Fast, no DOM, no GPU.
- `integration/` — systems composed together: a scene tick, a save/load round-trip.
- `fixtures/` — sample worlds, configs, and saves. Small and readable.

## Rules

- **Seed everything.** Any test touching randomness passes an explicit seed to
  `core/rng.ts`. A flaky test here is worse than no test.
- **Fixed `dt`.** Step the sim manually; never wait on wall-clock time or `setTimeout`.
- **Test behavior, not structure.** Assert that sanity drains in darkness — not that
  `SanitySystem.update` was called.
- **Every fixed bug gets a regression test**, named after the symptom, with the seed and
  repro in a comment.
- No Three.js in unit tests. If a test needs a GPU, it is an integration smoke test and
  it is allowed to be shallow.
