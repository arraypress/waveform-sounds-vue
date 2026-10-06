<!--
  examples/basic.vue
  ------------------

  Reference Vue 3 component demonstrating <WaveformSounds> usage.
  Copy/paste into your own Vue app (Vite, Nuxt, anywhere).

  Library setup (do this ONCE in your app entry — e.g. `main.ts`):

    import '@arraypress/waveform-player';                  // registers window.WaveformPlayer (the engine)
    import '@arraypress/waveform-player/styles.css';
    import '@arraypress/waveform-sounds/styles.css';

  The wrapper does NOT auto-import CSS or the engine. Instead of the global
  you can pass the class: <WaveformSounds :player-class="WaveformPlayer" />.
-->
<script setup lang="ts">
import { ref } from 'vue';
import {
	WaveformSounds,
	type Sound,
	type SoundInput,
	type WaveformSoundsExpose,
} from '@arraypress/waveform-sounds-vue';

/* Imperative control via a template ref. */
const list = ref<WaveformSoundsExpose>();

/* Sounds inline (rendered on the server too). `peaks` is what
 * `waveform-gen --manifest` writes; without it a row shows a flat line
 * until it is first played. */
const sounds: SoundInput[] = [
	{ url: '/previews/kick-loop-120.mp3', title: 'Kick Loop', type: 'Drum loops', bpm: 120, key: 'F minor', tags: ['house'] },
	{ url: '/previews/sub-bass-128.mp3', title: 'Sub Bass', type: 'Bass', bpm: 128, key: 'C', duration: 8.02 },
	{ url: '/previews/pad-swell.mp3', title: 'Pad Swell', type: 'One-shots', key: 'Am' },
];

const nowPlaying = ref('');
function onPlay(sound: Sound) {
	nowPlaying.value = sound.title;
}
</script>

<template>
	<!-- 1 — From a manifest (fetched in the browser) -->
	<WaveformSounds manifest="/sounds.json" />

	<!-- 2 — Inline sounds, a docked player, fewer controls -->
	<WaveformSounds
		:sounds="sounds"
		player="strip"
		:filters="['type', 'bpm']"
		:columns="['bpm', 'key']"
		:sorts="['bpm', 'title']"
		:page-size="25"
		auto-advance
		@play="onPlay"
	/>
	<p v-if="nowPlaying">Playing {{ nowPlaying }}</p>

	<!-- 3 — Translated, and styled through the engine's options -->
	<WaveformSounds
		:sounds="sounds"
		:strings="{ count: '{count} geluiden', searchPlaceholder: 'Zoek geluiden…' }"
		:player-options="{ waveformColor: '#888', progressColor: '#d1fe17' }"
	/>

	<!-- 4 — Imperative control via ref -->
	<WaveformSounds ref="list" :sounds="sounds" />
	<div style="display: flex; gap: 0.5rem; margin-top: 1rem">
		<button @click="list?.setFilter({ type: 'Bass' })">Bass only</button>
		<button @click="list?.clearFilters()">All</button>
		<button @click="list?.play(0)">Play first</button>
		<button @click="list?.next()">Next</button>
	</div>
</template>
