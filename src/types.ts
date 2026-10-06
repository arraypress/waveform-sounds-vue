/**
 * @module types
 * @description
 * Public TypeScript types for `@arraypress/waveform-sounds-vue`.
 *
 * The option surface is owned by the core, `@arraypress/waveform-sounds`,
 * whose hand-written `index.d.ts` declares {@link WaveformSoundsOptions}.
 * The props type here is derived from it (`Omit<>`), never re-declared, so
 * the types cannot drift from the core. (The RUNTIME prop declarations in
 * `WaveformSounds.ts` are hand-written — Vue registers props at runtime —
 * and `test/forwarding-drift.test.ts` is what keeps those honest.)
 *
 * This module only adds the Vue-specific surface:
 *
 *   - `WaveformSoundsProps` — the options accepted as component props
 *     (the core's callbacks become emits instead).
 *   - `WaveformSoundsEmits` — the emitted events and their arguments.
 *   - `WaveformSoundsExpose` — the imperative API on a template `ref`.
 *
 * `class`, `style`, and `id` are intentionally NOT props: they are
 * forwarded to the host element.
 *
 * @see {@link https://github.com/arraypress/waveform-sounds} — core library
 */
import type {
	Sound,
	SoundsFilter,
	SoundsSort,
	WaveformSounds,
	WaveformSoundsOptions,
} from '@arraypress/waveform-sounds';

/**
 * Types re-exported from `@arraypress/waveform-sounds` so consumers can
 * import them from this package. These are the core's own definitions —
 * not local copies.
 */
export type {
	Sound,
	SoundInput,
	SoundsManifest,
	SoundsFilter,
	SoundsSort,
	SoundsLayout,
	SoundsFilterControl,
	SoundsColumn,
	WaveformSoundsOptions,
	WaveformSoundsStrings,
	WaveformSoundsEventMap,
} from '@arraypress/waveform-sounds';

/** The core's `WaveformSounds` instance type (the class itself is never
 *  imported eagerly — it is browser-only). */
export type WaveformSoundsInstance = WaveformSounds;

/** The core's callback options, which surface as emits instead of props. */
type CallbackOption = 'onReady' | 'onPlay' | 'onPause' | 'onEnd' | 'onFilter' | 'onError';

/**
 * The option surface accepted by `<WaveformSounds>` as props: every
 * {@link WaveformSoundsOptions} key except the callbacks, which surface as
 * emits (`@ready`, `@play`, `@pause`, `@end`, `@filter`, `@error`).
 *
 * Supply the list as `sounds` (rendered on the server too — see the
 * component docs) or as a `manifest` URL fetched in the browser. Note the
 * core's rule: a `sounds` array — even an empty one — wins over `manifest`.
 *
 * Because the surface is inherited rather than hand-copied, a new core
 * option typechecks here without an edit — and the drift test fails until
 * it is wired at runtime.
 */
export interface WaveformSoundsProps extends Omit<WaveformSoundsOptions, CallbackOption> {}

/**
 * The events `<WaveformSounds>` emits, with the core callbacks' arguments.
 * Each fires after the core's own handling; the matching bubbling
 * `waveformsounds:*` DOM events still fire on the host as well.
 */
export interface WaveformSoundsEmits {
	/** The list is built (after a manifest fetch, if any). */
	ready: [instance: WaveformSounds];
	/** A sound started (or resumed). */
	play: [sound: Sound, instance: WaveformSounds];
	/** The playing sound paused. */
	pause: [sound: Sound, instance: WaveformSounds];
	/** A sound played to its end. */
	end: [sound: Sound, instance: WaveformSounds];
	/** After every filter / sort / page change, with the matching sounds. */
	filter: [visible: Sound[], instance: WaveformSounds];
	/** Initialisation (e.g. a manifest fetch) or playback failed. */
	error: [error: unknown, instance: WaveformSounds];
}

/**
 * Imperative API exposed through a template `ref`.
 *
 * ```vue
 * <script setup lang="ts">
 * import { ref } from 'vue';
 * import { WaveformSounds, type WaveformSoundsExpose } from '@arraypress/waveform-sounds-vue';
 * const list = ref<WaveformSoundsExpose>();
 * </script>
 * <template>
 *   <WaveformSounds ref="list" manifest="/sounds.json" />
 *   <button @click="list?.setFilter({ type: 'Drum loops' })">Drums</button>
 * </template>
 * ```
 *
 * Each method is a thin pass-through to the core instance. The instance
 * loads asynchronously on mount: a call before it exists is a no-op, and a
 * call while it is still building (a manifest fetch) runs once it is
 * ready, in call order. After that, calls are synchronous — so `play()`
 * from a click handler keeps the browser's user-activation.
 */
export interface WaveformSoundsExpose {
	/** Play a sound by index, id or sound object — or resume the current one.
	 *  `at` is a start position, 0..1. */
	play(target?: number | string | Sound, opts?: { at?: number }): void;
	/** Pause the current sound. */
	pause(): void;
	/** The current sound plays/pauses; another sound starts. */
	toggle(target?: number | string | Sound): void;
	/** Play the next visible sound (no wrap at the end). */
	next(): void;
	/** Play the previous visible sound. */
	previous(): void;
	/** Merge a patch into the filter and re-apply it. */
	setFilter(patch: Partial<SoundsFilter>): void;
	/** Reset every filter (the sort stays). */
	clearFilters(): void;
	/** Change the sort order. */
	setSort(by: SoundsSort): void;
	/** Loop the current sound on/off (the Loop toggle's state). */
	setLoop(on: boolean): void;
	/** Reveal the next page of results. */
	showMore(): void;
	/**
	 * The underlying `WaveformSounds` instance, or `null` before it mounts.
	 * Escape hatch for its getters (`sounds`, `visible`, `current`,
	 * `playing`, `engine`, `ready`, …).
	 */
	readonly instance: WaveformSounds | null;
}
