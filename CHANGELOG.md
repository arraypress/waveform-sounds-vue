# Changelog

All notable changes to `@arraypress/waveform-sounds-vue` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [Unreleased]

## [0.1.0] — 2026-10-06

Initial release.

### Added

- `<WaveformSounds>` Vue 3 component wrapping `@arraypress/waveform-sounds`
  (constructed from `@arraypress/waveform-sounds/no-autoinit`, so importing
  it never scans the page for `[data-waveform-sounds]` markup).
- Every `WaveformSoundsOptions` key as a typed runtime prop, forwarded through
  an explicit allowlist — including `sorts` (the Sort menu's orders; `[]`
  hides it), `showCount`, `menuSearch` and `idPrefix`. When no `idPrefix`
  is given the wrapper passes one from Vue's `useId()`, so two lists of the
  same sounds on a page get distinct dropdown ids, and server and client
  render the same ones. The props type (`WaveformSoundsProps`) derives from
  the core's hand-written `index.d.ts`; a drift test fails when a core option
  is neither forwarded nor listed as deliberately not forwarded, and checks
  the core's `index.d.ts` against its runtime `DEFAULT_OPTIONS`.
- Lifecycle emits — `ready`, `play`, `pause`, `end`, `filter`, `error` —
  with the core callbacks' arguments. `emit` is stable, so a new listener
  never rebuilds the list.
- Imperative API on a template ref (`WaveformSoundsExpose`): `play`, `pause`,
  `toggle`, `next`, `previous`, `setFilter`, `clearFilters`, `setSort`,
  `setLoop`, `showMore`, plus the raw `instance`. A call while the instance
  is still building (e.g. a manifest fetch) runs once it is ready, in order;
  after that, calls are synchronous, so `play()` from a click keeps the
  browser's user activation.
- Server rendering: with `sounds`, the host holds the core's own markup from
  `@arraypress/waveform-sounds/render`, on the server and the client alike,
  and the runtime adopts it (toolbar dropdowns included). Hydrates without
  mismatches (tested). Set `--ws-surface` on the host for a correct first
  server-rendered paint; the list is otherwise colour-agnostic.
- Value-based rebuilds: a construction-prop change destroys and rebuilds the
  instance over freshly reset markup, but arrays and objects are compared
  serialised, so an equal inline literal from a re-rendering parent doesn't
  rebuild (and lose the visitor's filter and playback). `loop` is applied
  live through `setLoop()`.
- `playerOptions` callbacks always reach the latest prop value: swapping one
  doesn't rebuild, and the engine (created on first play) still calls the
  new one.
- `class`, `style`, `id` and other attributes forward to the host; the base
  class `wfp-host` always applies, and a class-only change never strips the
  runtime's own `waveform-sounds` / `waveform-sounds--<player>` classes. A
  `player` change leaves exactly one layout modifier on the host.
- Dual ESM + CJS build via `tsup` with `.d.ts`. Vue and both cores are peer
  dependencies.
- Vitest suite (jsdom + `@vue/test-utils`): the component against a mocked
  runtime, the forwarding-drift guard, SSR + hydration, and an integration
  suite against the real runtime.
