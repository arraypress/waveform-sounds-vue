<div align="center">

# Waveform Sounds for Vue

**Vue 3 component wrapper for `@arraypress/waveform-sounds`.** A searchable, filterable sound list — sample-pack previews with inline waveforms, keyboard auditioning and one shared audio engine — with typed props, lifecycle emits, an exposed imperative API, and server-rendered markup.

[![npm version](https://img.shields.io/npm/v/@arraypress/waveform-sounds-vue?style=flat-square&labelColor=09090b&color=3f3f46)](https://www.npmjs.com/package/@arraypress/waveform-sounds-vue)
[![license](https://img.shields.io/npm/l/@arraypress/waveform-sounds-vue?style=flat-square&labelColor=09090b&color=3f3f46)](https://github.com/arraypress)

**[Documentation](https://docs.waveformplayer.com/)** · [npm](https://www.npmjs.com/package/@arraypress/waveform-sounds-vue)

</div>

---

## Install

```bash
npm install @arraypress/waveform-sounds-vue @arraypress/waveform-sounds @arraypress/waveform-player vue
```

Once, at your app entry:

```ts
import '@arraypress/waveform-player'; // the audio engine (registers window.WaveformPlayer)
import '@arraypress/waveform-player/styles.css';
import '@arraypress/waveform-sounds/styles.css';
```

```vue
<script setup lang="ts">
import { WaveformSounds } from '@arraypress/waveform-sounds-vue';
</script>

<template>
  <WaveformSounds manifest="/sounds.json" @play="(sound) => console.log(sound.title)" />
</template>
```

Generate the manifest from a folder of previews with
`npx @arraypress/waveform-gen ./previews/*.mp3 --manifest ./public/sounds.json`.

## Props, emits, ref

- **Props** — every `WaveformSoundsOptions` key: `sounds` or `manifest`,
  `player` (`'inline'` | `'strip'`), `search`, `filters`, `sorts`
  (`[]` = no sort menu; the first usable one is the starting order),
  `loopToggle`, `showCount`, `menuSearch`, `maxTypeChips`, `pageSize`,
  `columns`, `strings`,
  `waveformStyle`, `waveformColor`, `progressColor`, `barWidth`, `barGap`,
  `loop`, `autoAdvance`, `arrowAudition`, `playerOptions`, `playerClass`.
  A `sounds` array (even an empty one) wins over `manifest`.
- **Emits** — `@ready`, `@play`, `@pause`, `@end` (sound, instance),
  `@filter` (visible sounds, instance), `@error` (error, instance).
- **Ref** (`WaveformSoundsExpose`) — `play(target?, { at? })`, `pause()`,
  `toggle()`, `next()`, `previous()`, `setFilter(patch)`, `clearFilters()`,
  `setSort(by)`, `setLoop(on)`, `showMore()`, and the raw `instance`.

Changing a prop rebuilds the list (equal arrays/objects from a re-rendering
parent don't count); `loop` is applied live.

## Server rendering

With `sounds`, the list's markup is rendered by the core's DOM-free renderer —
on the server too (Nuxt, `vue/server-renderer`) — and the browser runtime
adopts it instead of rebuilding. The runtime itself only loads on the client.

## Theming

Colour-agnostic by default: the list derives from `currentColor` and fits
light and dark pages with no configuration — no accent required. Opt into a
brand colour with `--ws-accent` / `--ws-on-accent` on the host. `--ws-surface`
is the page background: the runtime detects it, but set it yourself when you
server-render so the first paint is right, e.g.
`<WaveformSounds :sounds="sounds" style="--ws-surface: #09090b" />`.

## Documentation

### -> [docs.waveformplayer.com](https://docs.waveformplayer.com/)

## License

MIT © [ArrayPress](https://github.com/arraypress)
