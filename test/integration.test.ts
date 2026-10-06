/**
 * test/integration.test.ts
 * ------------------------
 *
 * The wrapper against the REAL `@arraypress/waveform-sounds` runtime (not
 * mocked here), so the contract between the two halves is exercised for
 * real: the markup this component renders through `/render` is adopted by
 * the runtime, its callbacks reach the emits, the exposed API drives it,
 * and destroy/rebuild leave a working list.
 *
 * Only the audio engine is a stand-in, passed as `playerClass` — the
 * `WaveformPlayer` itself needs Web Audio / canvas decoding jsdom lacks,
 * and its lifecycle is the core's own integration test's concern.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { WaveformSounds, type WaveformSoundsExpose } from '../src';

/** The engine stand-in: records loads, fires the callbacks the list wires. */
class FakePlayer {
	static instances: FakePlayer[] = [];
	opts: Record<string, (...a: unknown[]) => void>;
	audio = { src: '', loop: false, duration: 8 };
	loads: string[] = [];
	destroyed = false;
	constructor(_el: HTMLElement, opts: Record<string, (...a: unknown[]) => void>) {
		this.opts = opts;
		FakePlayer.instances.push(this);
	}
	loadTrack(url: string) {
		this.loads.push(url);
		this.audio.src = url;
		this.opts.onPlay(this);
	}
	play() {
		this.opts.onPlay(this);
	}
	pause() {
		this.opts.onPause(this);
	}
	seekTo() {}
	destroy() {
		this.destroyed = true;
	}
}

const sounds = [
	{ url: '/kick.mp3', title: 'Kick Loop', type: 'Drums', bpm: 120, key: 'Fmin', id: 'kick' },
	{ url: '/bass.mp3', title: 'Bass Line', type: 'Bass', bpm: 128, key: 'C', id: 'bass' },
	{ url: '/hat.mp3', title: 'Hat Loop', type: 'Drums', bpm: 140, key: 'G', id: 'hat' },
];

beforeAll(() => {
	HTMLCanvasElement.prototype.getContext = (() => null) as never;
	window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as never;
});

let wrapper: VueWrapper | null = null;
afterEach(() => {
	wrapper?.unmount();
	wrapper = null;
	FakePlayer.instances.length = 0;
});

const api = () => wrapper!.vm as unknown as WaveformSoundsExpose;
/** The real runtime is a dynamic import (real module I/O), so wait for the
 *  instance to exist rather than for a fixed number of ticks. */
const created = (previous: unknown = null) =>
	vi.waitFor(() => {
		const inst = api().instance;
		if (!inst || inst === previous) throw new Error('not constructed yet');
		return inst;
	});
const ready = async (previous: unknown = null) => {
	const inst = await created(previous);
	await inst.ready;
	await flushPromises();
};

describe('against the real runtime', () => {
	it('adopts the rendered rows (same elements) and emits ready + filter', async () => {
		wrapper = mount(WaveformSounds, { props: { sounds, playerClass: FakePlayer }, attachTo: document.body });
		const firstRow = wrapper.element.querySelector('[data-ws-index]');
		await ready();

		expect(wrapper.emitted('ready')).toHaveLength(1);
		expect(wrapper.emitted('filter')?.[0][0]).toHaveLength(3);
		expect(api().instance?.sounds.map((s) => s.id)).toEqual(['kick', 'bass', 'hat']);
		expect(wrapper.element.querySelector('[data-ws-index]')).toBe(firstRow);
		expect(wrapper.element.dataset.wsInitialized).toBe('true');
	});

	it('the exposed API drives the list, and playback emits with the Sound', async () => {
		wrapper = mount(WaveformSounds, { props: { sounds, playerClass: FakePlayer }, attachTo: document.body });
		await ready();

		api().setFilter({ type: 'Drums' });
		const visible = wrapper.emitted('filter')!.at(-1)![0] as Array<{ id: string }>;
		expect(visible.map((s) => s.id)).toEqual(['kick', 'hat']);
		expect(wrapper.element.querySelector('[data-ws-id="bass"]')!.hasAttribute('hidden')).toBe(true);

		api().play('hat');
		expect(FakePlayer.instances[0].loads).toEqual(['/hat.mp3']);
		const [sound] = wrapper.emitted('play')!.at(-1)! as [{ id: string }];
		expect(sound.id).toBe('hat');

		api().pause();
		expect((wrapper.emitted('pause')!.at(-1)![0] as { id: string }).id).toBe('hat');
	});

	it('a filter set while the list is still building reaches the search box too', async () => {
		// A manifest whose fetch we release by hand keeps `ready` pending.
		let release!: () => void;
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
			() =>
				new Promise<Response>((resolve) => {
					release = () => resolve(new Response(JSON.stringify(sounds), { status: 200 }));
				})
		);
		wrapper = mount(WaveformSounds, {
			props: { manifest: '/sounds.json', playerClass: FakePlayer },
			attachTo: document.body,
		});
		await created();
		api().setFilter({ query: 'loop' });
		release();
		await ready();
		fetchSpy.mockRestore();

		const input = (wrapper.element as HTMLElement).querySelector<HTMLInputElement>('[data-ws-search]')!;
		expect(input.value).toBe('loop');
		expect(api().instance?.visible.map((s) => s.id)).toEqual(['kick', 'hat']);
	});

	it('setSort() through the ref updates the sort menu the wrapper rendered', async () => {
		wrapper = mount(WaveformSounds, { props: { sounds, sorts: ['bpm', 'title'], playerClass: FakePlayer }, attachTo: document.body });
		await ready();
		const value = () => (wrapper!.element as HTMLElement).querySelector('[data-ws-menu="sort"] [data-ws-menu-value]')!.textContent;
		expect(value()).toBe('BPM');
		expect(api().instance?.sortBy).toBe('bpm'); // the first usable order is the starting one

		api().setSort('title');
		expect(value()).toBe('Name');
		expect(api().instance?.visible.map((s) => s.id)).toEqual(['bass', 'hat', 'kick']);
	});

	it('`loop` is applied live to the running list', async () => {
		wrapper = mount(WaveformSounds, { props: { sounds, playerClass: FakePlayer }, attachTo: document.body });
		await ready();
		const inst = api().instance;

		await wrapper.setProps({ loop: true });
		await flushPromises();
		expect(api().instance).toBe(inst);
		expect(wrapper.element.querySelector('[data-ws-loop]')!.getAttribute('aria-pressed')).toBe('true');
	});

	it('a rebuild yields a fresh, working list over clean markup', async () => {
		wrapper = mount(WaveformSounds, { props: { sounds, playerClass: FakePlayer }, attachTo: document.body });
		await ready();
		api().setFilter({ type: 'Bass' });
		api().play('bass');
		const first = api().instance!;

		await wrapper.setProps({ barWidth: 3 });
		await ready(first);

		const second = api().instance!;
		expect(second).not.toBe(first);
		expect(FakePlayer.instances[0].destroyed).toBe(true);
		expect(second.visible).toHaveLength(3); // filter state did not leak in
		expect(wrapper.element.querySelectorAll('[data-ws-index][hidden]')).toHaveLength(0);
		expect(wrapper.element.querySelectorAll('.is-current')).toHaveLength(0);
		expect(wrapper.element.classList.contains('waveform-sounds--inline')).toBe(true);
	});

	it('a player change leaves exactly one layout modifier on the host', async () => {
		// The host is server-rendered with `waveform-sounds--inline`, so the
		// runtime never counts it as its own and destroy() leaves it; the
		// wrapper must drop it before the rebuilt instance adds `--strip`.
		wrapper = mount(WaveformSounds, { props: { sounds, playerClass: FakePlayer }, attachTo: document.body });
		await ready();
		const first = api().instance;

		await wrapper.setProps({ player: 'strip' });
		await ready(first);
		const cls = (wrapper.element as HTMLElement).classList;
		expect(cls.contains('waveform-sounds--strip')).toBe(true);
		expect(cls.contains('waveform-sounds--inline')).toBe(false);
		expect(cls.contains('waveform-sounds')).toBe(true);

		const second = api().instance;
		await wrapper.setProps({ player: 'inline' });
		await ready(second);
		expect(cls.contains('waveform-sounds--inline')).toBe(true);
		expect(cls.contains('waveform-sounds--strip')).toBe(false);
	});

	it('a class-only change keeps the runtime classes on the host', async () => {
		wrapper = mount(WaveformSounds, {
			props: { sounds, playerClass: FakePlayer },
			attrs: { class: 'a' },
			attachTo: document.body,
		});
		await ready();
		await wrapper.setProps({ class: 'b' } as never);
		const cls = wrapper.element.classList;
		expect(['b', 'wfp-host', 'waveform-sounds', 'waveform-sounds--inline'].every((c) => cls.contains(c))).toBe(true);
		expect(cls.contains('a')).toBe(false);
	});

	it('a manifest is fetched and rendered by the runtime', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(JSON.stringify({ version: 1, sounds }), { status: 200 })
		);
		wrapper = mount(WaveformSounds, { props: { manifest: '/sounds.json', playerClass: FakePlayer }, attachTo: document.body });
		await ready();
		expect(fetchSpy).toHaveBeenCalledWith('/sounds.json');
		expect(wrapper.element.querySelectorAll('[data-ws-index]')).toHaveLength(3);
		fetchSpy.mockRestore();
	});

	it('unmount destroys the runtime and its engine', async () => {
		wrapper = mount(WaveformSounds, { props: { sounds, playerClass: FakePlayer }, attachTo: document.body });
		await ready();
		api().play(0);
		const inst = api().instance!;
		wrapper.unmount();
		wrapper = null;
		expect((inst as unknown as { destroyed: boolean }).destroyed).toBe(true);
		expect(FakePlayer.instances[0].destroyed).toBe(true);
	});
});
