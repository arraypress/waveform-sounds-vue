/**
 * test/forwarding-drift.test.ts
 * -----------------------------
 *
 * Forwarding-drift guard. The props type inherits every option from the
 * core, but Vue registers props at runtime, and the runtime `props`
 * declarations, the options builder and the rebuild watcher are all
 * hand-written — so an option the core adds typechecks here and is
 * silently dropped (as a fallthrough attribute) unless someone wires it.
 * That is exactly how `crossOrigin` and five more options went missing in
 * the playlist wrappers.
 *
 * Every key of `WaveformSoundsOptions` (read from the installed core's
 * `index.d.ts`, see `option-surface.ts`) must either be forwarded — and
 * rebuild the list, or be applied live, when it changes; callbacks must
 * surface as emits — or be listed in `NOT_FORWARDED` with the reason.
 * Adding an option to the core without deciding which fails this file.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { ALL_OPTIONS, isCallback } from './option-surface';

/** Options deliberately NOT forwarded to the constructor. None today:
 *  every option the core has is a prop or an emit. */
const NOT_FORWARDED: Record<string, string> = {};

/**
 * Known gaps in the CORE between its `index.d.ts` and its runtime
 * `DEFAULT_OPTIONS` (reported upstream). The check below fails when one is
 * fixed, so delete the entry then. These don't affect forwarding: the
 * wrapper reads the surface from `index.d.ts`.
 */
const KNOWN_CORE_DRIFT: Record<string, string> = {
	idPrefix: 'core 7591952 declares and reads it, but has no DEFAULT_OPTIONS entry',
};

/** Forwarded options a change applies to the live instance instead of
 *  rebuilding it, with the method that does it. */
const LIVE: Record<string, string> = {
	loop: 'setLoop',
};

const FORWARDED = ALL_OPTIONS.filter((key) => !(key in NOT_FORWARDED));
const VALUES = FORWARDED.filter((key) => !isCallback(key));
const CALLBACKS = FORWARDED.filter(isCallback);

const ctorCalls: Array<Record<string, unknown>> = [];
const liveCalls: Array<[string, unknown[]]> = [];

vi.mock('@arraypress/waveform-sounds/no-autoinit', () => {
	class Ctor {
		ready = Promise.resolve();
		destroy = () => {};
		setLoop = (...args: unknown[]) => liveCalls.push(['setLoop', args]);
		constructor(_el: HTMLElement, opts: Record<string, unknown>) {
			ctorCalls.push(opts);
		}
	}
	return { default: Ctor, WaveformSounds: Ctor };
});

import { WaveformSounds } from '../src';

beforeEach(() => {
	ctorCalls.length = 0;
	liveCalls.length = 0;
});

/** Mount with arbitrary (untyped) option props; sentinel values trip Vue's
 *  prop-type validation, so its warnings are silenced. */
const mountWith = (props: Record<string, unknown>) =>
	mount(WaveformSounds, {
		props: props as never,
		global: { config: { warnHandler: () => {} } },
	});

describe('forwarding drift', () => {
	it('reads a plausible option surface from the core', () => {
		expect(ALL_OPTIONS.length).toBeGreaterThan(20);
		expect(ALL_OPTIONS).toContain('sounds');
		expect(ALL_OPTIONS).toContain('playerClass');
		expect(ALL_OPTIONS).toContain('onFilter');
	});

	it("the core's index.d.ts declares exactly its runtime DEFAULT_OPTIONS", async () => {
		// The surface above is read from the hand-written types; this keeps
		// those honest against the code, so an option added to the core's
		// DEFAULT_OPTIONS but not its index.d.ts can't slip past the guard.
		const actual = await vi.importActual<{ DEFAULT_OPTIONS: Record<string, unknown> }>(
			'@arraypress/waveform-sounds/no-autoinit'
		);
		const runtime = Object.keys(actual.DEFAULT_OPTIONS);
		const typedOnly = ALL_OPTIONS.filter((key) => !runtime.includes(key)).sort();
		const runtimeOnly = runtime.filter((key) => !ALL_OPTIONS.includes(key)).sort();
		expect(runtimeOnly, 'core options missing from its index.d.ts').toEqual([]);
		// Fails both ways: a new gap, and an entry the core has since fixed.
		expect(typedOnly, 'core index.d.ts options missing from DEFAULT_OPTIONS').toEqual(
			Object.keys(KNOWN_CORE_DRIFT).sort()
		);
	});

	it('NOT_FORWARDED and LIVE list only real options (no stale entries)', () => {
		const lists = [...Object.keys(NOT_FORWARDED), ...Object.keys(LIVE)];
		expect(lists.filter((key) => !ALL_OPTIONS.includes(key))).toEqual([]);
	});

	it('forwards every other option into the constructor options', async () => {
		mountWith(Object.fromEntries(VALUES.map((key) => [key, `__${key}__`])));
		await flushPromises();
		expect(ctorCalls).toHaveLength(1);

		const dropped = VALUES.filter((key) => ctorCalls[0][key] !== `__${key}__`);
		expect(dropped, 'options neither forwarded nor in NOT_FORWARDED').toEqual([]);
	});

	it('rebuilds (or applies live) when any forwarded option changes', async () => {
		const props: Record<string, unknown> = Object.fromEntries(
			VALUES.map((key) => [key, `__${key}__`])
		);
		const wrapper = mountWith(props);
		await flushPromises();
		expect(ctorCalls).toHaveLength(1);

		const stale: string[] = [];
		const rebuiltLive: string[] = [];
		for (const key of VALUES) {
			const before = ctorCalls.length;
			const liveBefore = liveCalls.length;
			await wrapper.setProps({ [key]: `__${key}__changed` } as never);
			await flushPromises();
			const rebuilt = ctorCalls.length !== before;
			if (key in LIVE) {
				if (rebuilt) rebuiltLive.push(key);
				if (!liveCalls.slice(liveBefore).some(([method]) => method === LIVE[key])) stale.push(key);
			} else if (!rebuilt) {
				stale.push(key);
			}
		}
		expect(stale, 'forwarded options missing from the rebuild watcher (or their live setter)').toEqual([]);
		expect(rebuiltLive, 'LIVE options must not rebuild').toEqual([]);
	});

	it('surfaces every callback option as an emit', async () => {
		const wrapper = mountWith({});
		await flushPromises();

		const dropped = CALLBACKS.filter((key) => {
			const fn = ctorCalls[0][key];
			if (typeof fn !== 'function') return true;
			fn('x', 'y');
			return !wrapper.emitted(key.slice(2).toLowerCase())?.length;
		});
		expect(dropped, 'callbacks neither emitted nor in NOT_FORWARDED').toEqual([]);
	});
});
