# Deployment

Target: a **third-party static webserver**. Plain file hosting. No Node, no rewrites, no
custom headers, no server-side anything.

Everything below follows from that.

## Build

```bash
npm ci
npm run check      # typecheck + lint + tests + layer rules
npm run build      # → dist/
```

`dist/` is self-contained: `index.html`, hashed JS/CSS, and assets. Upload its
*contents* to the web root (or a subdirectory — see below).

## Hard requirements

**Relative base path.** `vite.config.ts` sets `base: './'`. We may be served from
`example.com/`, `example.com/games/bbyellow/`, or a preview URL nobody told us about.
Any absolute `/assets/...` reference breaks on two of those three. Never hardcode a
leading slash in a URL.

**No secrets.** Everything in `dist/` is public and downloadable. API keys, analytics
tokens, and admin endpoints do not go in a static bundle. If a feature needs a secret it
needs a backend, and this project does not have one.

**No server features.** Assume the host gives us none of:

| Want | Reality | What we do |
|---|---|---|
| SPA fallback rewrite | Not available | No client-side routing that needs it |
| COOP/COEP headers | Not available | No `SharedArrayBuffer`, no threaded WASM |
| Custom MIME types | Unreliable | Standard extensions only (`.js`, `.wasm`, `.ktx2`) |
| Brotli negotiation | Maybe | Pre-compress at build; don't depend on it |
| Cache-control tuning | Not available | Content-hash every filename |
| Range requests | Usually | Verify before relying on them for audio streaming |

**Cache busting by filename.** `index.html` is the only unhashed file. A stale
`index.html` costs one reload; a stale mismatched chunk is an unexplainable crash
report.

**Client state is hostile.** Saves and settings come from `localStorage`, which the
player can edit. Validate on read; a corrupt save falls back to defaults with a
message, never a crash or a white screen.

## Pre-upload checklist

- [ ] `npm run check` clean
- [ ] `npm run build` succeeds; `npm run preview` plays through the first scene
- [ ] Served from a **subdirectory** and still works (catches absolute-path bugs)
- [ ] No secrets: `grep -riE "api[_-]?key|secret|token|password" dist/` is clean
- [ ] Budgets in `performance-budgets.md` hold on the production build
- [ ] Cold load with cache disabled ≤ 8 s at 20 Mbps
- [ ] Graceful message on: no WebGL2, no pointer lock, blocked audio autoplay
- [ ] Asset licenses current in `docs/asset-credits.md`

## Upload

Upload to a staging path first, verify, then swap. Do not overwrite a live directory
in place — a partial upload leaves players with a half-updated bundle whose hashed
chunks no longer match `index.html`.

Order matters: **hashed assets first, `index.html` last.** New assets are inert until
something references them; the new `index.html` is what switches the version over.

## Rollback

Keep the previous `dist/` as a dated directory on the host. Rollback is re-uploading the
old `index.html` — hashed assets from both versions coexist without conflict, which is
the point of hashing. Tag every deployed build in git so a live bundle can always be
traced to a commit.
