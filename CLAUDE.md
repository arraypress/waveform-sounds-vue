# CLAUDE.md — @arraypress/waveform-sounds-vue

Vue 3 wrapper for `@arraypress/waveform-sounds` (a searchable, filterable sound
list played through one `WaveformPlayer` engine). Modelled on
`waveform-playlist-vue`.

## Commands
- `npm test` — vitest + jsdom (run before committing). Five files: the component
  against a mocked runtime, `forwarding-drift`, `ssr` (renderToString +
  hydration), `integration` (the REAL runtime, fake engine), `peer-ranges`.
- `npm run typecheck` — `tsc --noEmit`, incl. `test/types.typecheck.ts`.
- `npm run build` — bundles to `dist/`. `prepublishOnly` runs it. `dist/` is gitignored.

## ⚠️ Before publishing: the core dependency
The core wasn't on npm when this was built, so the devDependency is
`"@arraypress/waveform-sounds": "file:../waveform-sounds"` (a symlink). **After
the core's 0.1.0 is published, switch it to `"^0.1.0"` and `npm install`.**
Then the `server.fs.allow` block in `vitest.config.ts` (it lets Vite read the
symlinked core's `index.d.ts`) is no longer needed and can go.

## The rule that matters: three edits per option
`src/WaveformSounds.ts`. A new core option needs **all three**:
1. A **runtime** prop declaration in `props` (`type: … as PropType<…>`,
   `default: undefined`). Vue registers props at runtime — a TS type alone is
   not a prop; the value would fall through as an attribute and be dropped.
2. Its key in `buildOptions()` (or `RENDER_KEYS` if the renderer reads it).
3. `props.<key>` in the rebuild watcher's `serialize([...])` list — or, if the
   core has a live setter for it, a watcher calling it plus an entry in the
   drift test's `LIVE` map (only `loop` today).

`test/forwarding-drift.test.ts` fails until all three are done (or the option
is listed in `NOT_FORWARDED` with a reason). Callbacks (`on*`) become emits.

## Design decisions (don't undo without reading why)
- **Server markup.** With `sounds`, the host's `innerHTML` is the core's own
  `renderSounds()` output (DOM-free `/render` entry): it SSRs, and the runtime
  adopts it. A REBUILD resets `innerHTML` to that string before constructing —
  the core's `destroy()` does not restore adopted markup, so otherwise the new
  instance adopts the old one's filtered/painted rows.
- **The core builds on a microtask after its constructor returns** (since
  52f5269); `instance.ready` exists immediately. Tests `await instance.ready`
  before asserting on the DOM.
- **`idPrefix` defaults to `ws-${useId()}`** (via a Proxy over props, so the
  renderer and the runtime see the same value and reactivity stays per-key).
  The core's own default is the host id or a hash of the sounds — identical
  for two lists of the same sounds.
- **No `data-waveform-sounds` on the host** — that's the global auto-init marker.
- **Host `class` frozen at setup** (`inheritAttrs: false`, live class via
  `classList`) — same as playlist-vue, because the runtime owns
  `waveform-sounds` / `waveform-sounds--<player>` on the host. The frozen value
  includes those so SSR markup is styled before hydration. Consequence: the
  core's `destroy()` removes only classes IT added (core 52f5269), so it never
  owns the server-rendered modifier — a rebuild strips `--inline`/`--strip`
  (unless the consumer's own `class` has it) before constructing, or a
  `player` change would leave both modifiers on the host.
- **Rebuild key is serialised**, not identities: a parent passing an equal
  inline array/object must not rebuild (that would wipe filter + playback).
  `playerClass` is compared by identity alongside it.
- **`playerOptions` callbacks are trampolines** to the latest prop value (the
  core captures `playerOptions` when it creates the engine on first play).
- **Exposed calls wait for `ready`** while the instance builds, then go
  synchronous (keeps user activation for `play()`). Needed because a pre-ready
  `play()` finds no sounds and is silently dropped. (Pre-ready `setFilter()` /
  `setSort()` used to leave the controls out of sync; the core syncs them in
  `_init` since 52f5269, but queuing keeps every method's behaviour uniform.)
- **The engine isn't imported here** — same as playlist-vue: the consumer
  imports `@arraypress/waveform-player` (registers `window.WaveformPlayer`) or
  passes `playerClass`. Dynamically importing `@arraypress/waveform-player/no-autoinit`
  would need a peer floor of `^1.27.0` (that's when the subpath appeared) and
  would overwrite an existing global with a second class copy, splitting
  `singlePlay` across two `WaveformPlayer.currentlyPlaying` statics.
- Toolchain floor: `typescript@^6` (TS 7 breaks tsup's dts plugin) — see the
  `waveform-release` skill.

## Cross-repo
Part of the waveform family; load the `waveform-release` skill. The
`waveform-sounds-*` wrappers are not yet in that skill's package list — add
them (after `waveform-sounds` itself) on first publish.
