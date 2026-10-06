/**
 * WaveformSounds.ts
 * -----------------
 *
 * Vue 3 wrapper around `@arraypress/waveform-sounds`: a searchable,
 * filterable list of sounds (sample-pack previews) played through ONE
 * shared `WaveformPlayer` engine.
 *
 * Renders a host `<div>` and — on mount — constructs a `WaveformSounds`
 * over it with the props as options. On unmount (or a construction-prop
 * change) the instance is destroyed and rebuilt.
 *
 * Authored as a `defineComponent` with a render function (rather than an
 * SFC) so the package builds with `tsup` — dual ESM/CJS + `.d.ts`, the
 * same toolchain as the other Vue wrappers — and ships no `.vue` compile
 * step for consumers.
 *
 * ## Server-rendered markup the runtime adopts
 *
 * When `sounds` is given, the host's inner HTML is the core's own markup,
 * written by its DOM-free renderer (`@arraypress/waveform-sounds/render`).
 * On the server (Nuxt, `vue/server-renderer`) the list is therefore in the
 * HTML — readable and crawlable before any script runs — and in the
 * browser the runtime ADOPTS that markup instead of rebuilding it. This is
 * the same contract the core documents for every wrapper, and the analogue
 * of the playlist wrapper rendering `[data-track]` children for its
 * constructor to parse. With only a `manifest`, the host starts empty and
 * the runtime fetches and renders.
 *
 * Vue owns the markup only as an `innerHTML` string: it re-patches it when
 * the string changes (new sounds, or a render option such as `columns`)
 * and never otherwise, so the runtime's DOM state (filtered rows, drawn
 * canvases) survives unrelated re-renders. A REBUILD resets the host to
 * that string before constructing, so the new instance adopts clean markup
 * rather than the old one's state.
 *
 * The host deliberately does **not** carry `data-waveform-sounds`: that
 * attribute drives the core's global auto-init scan, which would
 * double-mount on top of the instance this component creates.
 *
 * ## Lifecycle emits
 *
 * The core's callbacks surface as emits — `@ready`, `@play`, `@pause`,
 * `@end`, `@filter`, `@error` — with the core's arguments, the same idiom
 * as the other Vue wrappers. `emit` is stable, so swapping a listener never
 * rebuilds the list. (The core's bubbling `waveformsounds:*` DOM events
 * still fire on the host too.)
 *
 * ## Rebuild vs live update
 *
 * Every construction-time prop rebuilds the instance when its VALUE
 * changes. Arrays and objects (`sounds`, `filters`, `columns`, `strings`,
 * `playerOptions`) are compared serialised, so a parent re-rendering an
 * equal inline literal does not rebuild — and lose the visitor's filter
 * and playback. `loop` alone is applied live through `setLoop()`, since
 * the core has a setter for it. The rebuild watcher uses `flush: 'post'`
 * so freshly patched markup is in the DOM before the constructor adopts it.
 *
 * ## The engine (`@arraypress/waveform-player`)
 *
 * The list plays through a `WaveformPlayer`, created on first play from
 * `playerClass` or else `window.WaveformPlayer`. Like the playlist wrapper,
 * this component does not load it for you — register the global once at
 * your app entry, or pass the class as `:player-class`:
 *
 * ```ts
 * import '@arraypress/waveform-player'; // registers window.WaveformPlayer
 * import '@arraypress/waveform-player/styles.css';
 * import '@arraypress/waveform-sounds/styles.css';
 * ```
 *
 * The runtime itself (`@arraypress/waveform-sounds/no-autoinit`) is
 * imported dynamically inside `onMounted`, so it only loads on the client
 * (SSR / Nuxt safe). `/no-autoinit` rather than the package root: the root
 * scans the whole document for `[data-waveform-sounds]` markup on import.
 *
 * @module WaveformSounds
 */
import {
	computed,
	defineComponent,
	h,
	normalizeClass,
	onBeforeUnmount,
	onMounted,
	onUpdated,
	ref,
	watch,
	type PropType,
} from 'vue';
import { renderSounds } from '@arraypress/waveform-sounds/render';
// Aliased to avoid colliding with this file's own `WaveformSounds`
// component export. This is the core library's class type.
import type {
	Sound,
	SoundInput,
	SoundsColumn,
	SoundsFilter,
	SoundsFilterControl,
	SoundsLayout,
	SoundsSort,
	WaveformSounds as WaveformSoundsInstance,
	WaveformSoundsOptions,
	WaveformSoundsStrings,
} from '@arraypress/waveform-sounds';

/** Minimal structural view of the instance methods the wrapper calls. */
type SoundsInstance = {
	ready?: Promise<void>;
	destroy?: () => void;
	play?: (target?: number | string | Sound, opts?: { at?: number }) => void;
	pause?: () => void;
	toggle?: (target?: number | string | Sound) => void;
	next?: () => void;
	previous?: () => void;
	setFilter?: (patch: Partial<SoundsFilter>) => void;
	clearFilters?: () => void;
	setSort?: (by: SoundsSort) => void;
	setLoop?: (on: boolean) => void;
	showMore?: () => void;
};

type Options = Record<string, unknown>;

/** The options the DOM-free renderer reads (the rest only matter at runtime). */
const RENDER_KEYS = [
	'player',
	'search',
	'filters',
	'sortable',
	'loopToggle',
	'pageSize',
	'columns',
	'maxTypeChips',
	'strings',
] as const;

/**
 * Copy the present (`!== undefined && !== null`) values of `keys` from the
 * props, so the core's own defaults win for everything the consumer omitted
 * (its merge never lets null/undefined overwrite either).
 */
function pick(p: Options, keys: readonly string[]): Options {
	const out: Options = {};
	for (const key of keys) {
		const value = p[key];
		if (value !== undefined && value !== null) out[key] = value;
	}
	return out;
}

/**
 * Convert resolved props into the option shape the `WaveformSounds`
 * constructor accepts. An explicit allowlist (not a spread) so an option
 * is forwarded only once someone decided it should be — the drift test
 * fails for any core option that is neither here nor in its
 * `NOT_FORWARDED` list. Callbacks are not here: they are wired to emits
 * in `mount()`.
 *
 * @param p - The component's resolved props.
 * @returns An options object for `new WaveformSounds(el, …)`.
 */
function buildOptions(p: Options): Options {
	return pick(p, [
		/* Data */
		'sounds',
		'manifest',
		/* Layout + toolbar */
		...RENDER_KEYS,
		/* Row waveform */
		'waveformStyle',
		'waveformColor',
		'progressColor',
		'barWidth',
		'barGap',
		/* Playback behaviour */
		'loop',
		'autoAdvance',
		'arrowAudition',
		/* Engine */
		'playerOptions',
		'playerClass',
	]);
}

/**
 * `JSON.stringify` that records a function as a marker rather than
 * dropping it, so adding or removing a callback in `playerOptions` still
 * changes the key (swapping one for another does not — see
 * {@link withLatestCallbacks}).
 */
function serialize(value: unknown): string {
	return JSON.stringify(value, (_key, v) => (typeof v === 'function' ? '[function]' : v)) ?? '';
}

/**
 * `playerOptions` with each callback replaced by a trampoline to the same
 * key on the LATEST prop value. The core captures `playerOptions` when it
 * creates the engine (first play), and a swapped callback doesn't rebuild
 * the list (see {@link serialize}) — so without this the engine would keep
 * calling the first one.
 */
function withLatestCallbacks(value: unknown, latest: () => unknown): unknown {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
	const out: Options = { ...(value as Options) };
	for (const [key, v] of Object.entries(value as Options)) {
		if (typeof v !== 'function') continue;
		out[key] = (...args: unknown[]) => {
			const fn = (latest() as Options | null | undefined)?.[key];
			return typeof fn === 'function' ? (fn as (...a: unknown[]) => unknown)(...args) : undefined;
		};
	}
	return out;
}

/** Split a class string into its tokens (empty strings dropped). */
function classTokens(value: string): string[] {
	return value.split(/\s+/).filter(Boolean);
}

/**
 * Bring the host's *user* classes (`wfp-host` + the fall-through `class`)
 * up to date without touching anything else on the element: drop the
 * tokens this component applied last time that are no longer wanted, then
 * add every wanted token (`classList.add` is idempotent).
 */
function syncHostClasses(el: HTMLElement, applied: readonly string[], wanted: readonly string[]): void {
	for (const token of applied) {
		if (!wanted.includes(token)) el.classList.remove(token);
	}
	if (wanted.length) el.classList.add(...wanted);
}

/**
 * `WaveformSounds` — Vue 3 component wrapping `@arraypress/waveform-sounds`.
 *
 * Every core option is a typed prop; the core's callbacks are emits; the
 * instance's methods are exposed through a template `ref`
 * ({@link WaveformSoundsExpose}). `class`, `style`, `id` and any other
 * attribute are forwarded to the host element — the base class `wfp-host`
 * is always applied.
 */
export const WaveformSounds = defineComponent({
	name: 'WaveformSounds',
	/* Attributes are forwarded by hand in the render function so `class`
	 * can be kept out of Vue's patching — see "Host `class` handling". */
	inheritAttrs: false,
	props: {
		// ── Data ───────────────────────────────────────────────────────
		/** The sounds. Rendered on the server too; wins over `manifest`. */
		sounds: { type: Array as PropType<SoundInput[]>, default: undefined },
		/** URL of a sounds manifest (JSON), fetched in the browser. */
		manifest: { type: String, default: undefined },

		// ── Layout + toolbar ───────────────────────────────────────────
		/** `'inline'` (a mini waveform per row) or `'strip'` (one docked player). */
		player: { type: String as PropType<SoundsLayout>, default: undefined },
		/** Show the search box. */
		search: { type: Boolean, default: undefined },
		/** Which filter controls to offer: `'type'`, `'key'`, `'bpm'`. */
		filters: { type: Array as PropType<SoundsFilterControl[]>, default: undefined },
		/** Show the sort menu. */
		sortable: { type: Boolean, default: undefined },
		/** Show the Loop toggle. */
		loopToggle: { type: Boolean, default: undefined },
		/** Up to this many types show as chips; more become a menu. */
		maxTypeChips: { type: Number, default: undefined },
		/** Rows shown before "Show more" (0 = all). */
		pageSize: { type: Number, default: undefined },
		/** Columns after the title, in order. */
		columns: { type: Array as PropType<SoundsColumn[]>, default: undefined },
		/** UI strings, merged over the English defaults. */
		strings: { type: Object as PropType<Partial<WaveformSoundsStrings>>, default: undefined },

		// ── Row waveform ───────────────────────────────────────────────
		waveformStyle: {
			type: String as PropType<NonNullable<WaveformSoundsOptions['waveformStyle']>>,
			default: undefined,
		},
		waveformColor: { type: String, default: undefined },
		progressColor: { type: String, default: undefined },
		barWidth: { type: Number, default: undefined },
		barGap: { type: Number, default: undefined },

		// ── Playback behaviour ─────────────────────────────────────────
		/** Loop on/off. Applied live (`setLoop`), never rebuilds. */
		loop: { type: Boolean, default: undefined },
		/** Play the next visible sound when one ends. */
		autoAdvance: { type: Boolean, default: undefined },
		/** While a sound plays, ↑/↓ move to the next row AND play it. */
		arrowAudition: { type: Boolean, default: undefined },

		// ── Engine ─────────────────────────────────────────────────────
		/** Options for the engine `WaveformPlayer` (its callbacks included). */
		playerOptions: { type: Object as PropType<Record<string, unknown>>, default: undefined },
		/** The `WaveformPlayer` class, instead of `window.WaveformPlayer`. */
		playerClass: { type: Function as PropType<NonNullable<WaveformSoundsOptions['playerClass']>>, default: undefined },
	},
	/* The core's callbacks, surfaced as emits (see "Lifecycle emits"). */
	emits: {
		ready: (_instance: WaveformSoundsInstance) => true,
		play: (_sound: Sound, _instance: WaveformSoundsInstance) => true,
		pause: (_sound: Sound, _instance: WaveformSoundsInstance) => true,
		end: (_sound: Sound, _instance: WaveformSoundsInstance) => true,
		filter: (_visible: Sound[], _instance: WaveformSoundsInstance) => true,
		error: (_error: unknown, _instance: WaveformSoundsInstance) => true,
	},
	setup(props, { emit, expose, attrs }) {
		const container = ref<HTMLDivElement | null>(null);
		const p = props as unknown as Options;

		/* The core's markup for `sounds`, from its DOM-free renderer — the
		 * same function on the server and the client, so hydration matches.
		 * Only the render options are read, so this recomputes only when
		 * the sounds or one of those change. */
		const markup = computed(() =>
			Array.isArray(props.sounds) ? renderSounds(props.sounds, pick(p, RENDER_KEYS)) : ''
		);

		/*
		 * Host `class` handling.
		 *
		 * The runtime owns part of the host's class list — `waveform-sounds`
		 * and `waveform-sounds--inline` / `--strip` — added at construction
		 * (the modifier is removed again by `destroy()`). If Vue owned the
		 * `class` attribute, a class-only change — which rightly doesn't
		 * rebuild — would re-patch it and strip those classes, unstyling the
		 * list. So the render function passes a class value frozen at setup
		 * (`renderedClass`, which also carries the core's classes so server
		 * markup is styled before hydration), which Vue never re-patches.
		 * The live fall-through `class` is applied after each mount/update
		 * with `classList`, touching only the tokens this component put
		 * there. Every other attribute (`id`, `style`, listeners, `data-*`)
		 * is still forwarded. Same approach as the playlist wrapper.
		 */
		const userClass = () => normalizeClass(['wfp-host', attrs.class]);
		const renderedClass = normalizeClass([
			userClass(),
			'waveform-sounds',
			`waveform-sounds--${props.player === 'strip' ? 'strip' : 'inline'}`,
		]);
		let appliedClasses = classTokens(userClass());
		function applyHostClasses() {
			const el = container.value;
			if (!el) return;
			const wanted = classTokens(userClass());
			syncHostClasses(el, appliedClasses, wanted);
			appliedClasses = wanted;
		}
		onMounted(applyHostClasses);
		onUpdated(applyHostClasses);

		let instance: SoundsInstance | null = null;
		/* True once the current instance's `ready` has resolved; until then
		 * exposed calls are queued on it (see `call`). */
		let isReady = false;
		/* Monotonic token: every (re)mount bumps it; an in-flight async
		 * import whose token is stale (superseded by a newer mount or by
		 * unmount) bails instead of attaching a zombie instance. */
		let mountToken = 0;

		function teardown() {
			if (instance && typeof instance.destroy === 'function') {
				try {
					instance.destroy();
				} catch (err) {
					console.warn('[WaveformSoundsVue] destroy() threw:', err);
				}
			}
			instance = null;
			isReady = false;
		}

		/**
		 * @param rebuild - True when replacing an instance: the host is reset
		 *   to the rendered markup first, so the new instance adopts a clean
		 *   list instead of the old one's filtered / painted rows.
		 */
		function mount(rebuild = false) {
			const myToken = ++mountToken;
			if (!container.value) return;

			/* Browser-only runtime — defer the import to the client so SSR
			 * never evaluates it. */
			void import('@arraypress/waveform-sounds/no-autoinit')
				.then((mod) => {
					if (myToken !== mountToken) return; // superseded
					const target = container.value;
					if (!target) return;

					const Ctor = (mod.default ??
						(mod as { WaveformSounds?: unknown }).WaveformSounds) as unknown as {
						new (el: HTMLElement, opts: Options): SoundsInstance;
					};
					if (typeof Ctor !== 'function') {
						console.error('[WaveformSoundsVue] Failed to resolve WaveformSounds constructor from module.');
						return;
					}

					const opts = buildOptions(p);
					if ('playerOptions' in opts) {
						opts.playerOptions = withLatestCallbacks(opts.playerOptions, () => props.playerOptions);
					}
					/* Wire callbacks to emits. `emit` is stable, so events
					 * always reach the latest listeners without a rebuild. */
					opts.onReady = (i: WaveformSoundsInstance) => emit('ready', i);
					opts.onPlay = (s: Sound, i: WaveformSoundsInstance) => emit('play', s, i);
					opts.onPause = (s: Sound, i: WaveformSoundsInstance) => emit('pause', s, i);
					opts.onEnd = (s: Sound, i: WaveformSoundsInstance) => emit('end', s, i);
					opts.onFilter = (v: Sound[], i: WaveformSoundsInstance) => emit('filter', v, i);
					opts.onError = (e: unknown, i: WaveformSoundsInstance) => emit('error', e, i);

					if (rebuild) {
						/* The runtime's destroy() restores neither adopted markup
						 * nor classes it found already present — and the frozen
						 * render class carries the FIRST `waveform-sounds--<player>`
						 * modifier, so the runtime never owns it. Reset both:
						 * clean markup to adopt, and no layout modifier, so the
						 * new instance adds (and owns) the current one. A
						 * modifier the consumer put in `class` is left alone. */
						target.innerHTML = markup.value;
						for (const modifier of ['waveform-sounds--inline', 'waveform-sounds--strip']) {
							if (!appliedClasses.includes(modifier)) target.classList.remove(modifier);
						}
					}

					try {
						const created = new Ctor(target, opts);
						instance = created;
						void Promise.resolve(created.ready).then(() => {
							if (instance === created) isReady = true;
						});
					} catch (err) {
						console.error('[WaveformSoundsVue] Failed to construct WaveformSounds:', err);
					}
					applyHostClasses();
				})
				.catch((err) => {
					console.error('[WaveformSoundsVue] Failed to load @arraypress/waveform-sounds:', err);
				});
		}

		onMounted(() => mount());
		onBeforeUnmount(() => {
			mountToken++; // invalidate any in-flight import
			teardown();
		});

		/* Rebuild on any construction-prop VALUE change. One serialised key
		 * (so an equal-but-new array or object from a re-rendering parent is
		 * not a change) plus `playerClass` by identity. Listed exhaustively —
		 * the drift test fails for a forwarded option missing here. `loop` is
		 * absent on purpose: it is applied live below. */
		watch(
			[
				() =>
					serialize([
						props.sounds,
						props.manifest,
						props.player,
						props.search,
						props.filters,
						props.sortable,
						props.loopToggle,
						props.maxTypeChips,
						props.pageSize,
						props.columns,
						props.strings,
						props.waveformStyle,
						props.waveformColor,
						props.progressColor,
						props.barWidth,
						props.barGap,
						props.autoAdvance,
						props.arrowAudition,
						props.playerOptions,
					]),
				() => props.playerClass,
			],
			() => {
				teardown();
				mount(true);
			},
			{ flush: 'post' }
		);

		/**
		 * Run `fn` against the live instance: now if it is ready, after
		 * `ready` (in call order) while it is still building, never if there
		 * is none. Calls made while building would otherwise hit an instance
		 * with no sounds yet (`play()` is silently dropped) or no controls
		 * (a `setFilter()` filters the rows but leaves the search box and
		 * chips showing the old filter).
		 */
		function call(fn: (i: SoundsInstance) => void) {
			const inst = instance;
			if (!inst) return;
			if (isReady) {
				fn(inst);
				return;
			}
			void Promise.resolve(inst.ready).then(() => {
				if (instance === inst) fn(inst);
			});
		}

		/* `loop` — the one option the core can change on a live instance. */
		watch(
			() => props.loop,
			(on) => {
				if (on !== undefined && on !== null) call((i) => i.setLoop?.(!!on));
			}
		);

		expose({
			play(target?: number | string | Sound, opts?: { at?: number }) {
				call((i) => i.play?.(target, opts));
			},
			pause() {
				call((i) => i.pause?.());
			},
			toggle(target?: number | string | Sound) {
				call((i) => i.toggle?.(target));
			},
			next() {
				call((i) => i.next?.());
			},
			previous() {
				call((i) => i.previous?.());
			},
			setFilter(patch: Partial<SoundsFilter>) {
				call((i) => i.setFilter?.(patch));
			},
			clearFilters() {
				call((i) => i.clearFilters?.());
			},
			setSort(by: SoundsSort) {
				call((i) => i.setSort?.(by));
			},
			setLoop(on: boolean) {
				call((i) => i.setLoop?.(on));
			},
			showMore() {
				call((i) => i.showMore?.());
			},
			get instance() {
				return instance as unknown as WaveformSoundsInstance | null;
			},
		});

		return () => {
			const { class: _class, ...rest } = attrs;
			/* `class` frozen at setup — see "Host `class` handling". The inner
			 * HTML is the core's markup (or empty for a manifest). */
			return h('div', { ...rest, ref: container, class: renderedClass, innerHTML: markup.value });
		};
	},
});

export default WaveformSounds;
