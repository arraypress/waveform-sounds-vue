/**
 * @module @arraypress/waveform-sounds-vue
 * @description
 * Public entry point for the Vue 3 wrapper around
 * `@arraypress/waveform-sounds`.
 *
 * ```vue
 * <script setup lang="ts">
 * import { WaveformSounds } from '@arraypress/waveform-sounds-vue';
 * </script>
 *
 * <template>
 *   <WaveformSounds manifest="/sounds.json" @play="(sound) => console.log(sound.title)" />
 * </template>
 * ```
 *
 * ## Types
 *
 * ```ts
 * import type {
 *   WaveformSoundsProps,
 *   WaveformSoundsEmits,
 *   WaveformSoundsExpose,
 *   WaveformSoundsInstance,
 *   WaveformSoundsOptions,
 *   WaveformSoundsStrings,
 *   WaveformSoundsEventMap,
 *   Sound,
 *   SoundInput,
 *   SoundsManifest,
 *   SoundsFilter,
 *   SoundsSort,
 *   SoundsLayout,
 *   SoundsFilterControl,
 *   SoundsLoopFilter,
 *   SoundsColumn,
 * } from '@arraypress/waveform-sounds-vue';
 * ```
 */

export { WaveformSounds, default } from './WaveformSounds';

export type {
	WaveformSoundsProps,
	WaveformSoundsEmits,
	WaveformSoundsExpose,
	WaveformSoundsInstance,
	WaveformSoundsOptions,
	WaveformSoundsStrings,
	WaveformSoundsEventMap,
	Sound,
	SoundInput,
	SoundsManifest,
	SoundsFilter,
	SoundsSort,
	SoundsLayout,
	SoundsFilterControl,
	SoundsLoopFilter,
	SoundsColumn,
} from './types';
