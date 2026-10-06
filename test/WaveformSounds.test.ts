/**
 * WaveformSounds.test.ts
 * ----------------------
 *
 * The core runtime (`@arraypress/waveform-sounds/no-autoinit`) is mocked at
 * the module boundary (jsdom has no Web Audio / Canvas). The DOM-free
 * renderer (`/render`) is the real one. These tests cover the wrapper's own
 * responsibilities: the host + server markup, constructing the instance
 * with mapped options, boolean-prop omission, emits, destroy-on-unmount,
 * value-based rebuilds, the live `loop`, the exposed API (including calls
 * made while the instance is still building) and host class handling.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { h } from 'vue';

/** Captures every constructed instance so assertions can inspect them. */
const instances: MockSounds[] = [];

/** Construct / destroy events in order, to assert destroy → construct. */
const lifecycle: string[] = [];

/** When true, new instances' `ready` stays pending until `resolveReady()`. */
let holdReady = false;

/**
 * Models the runtime's DOM contract (waveform-sounds 0.1.0): adopt a
 * server-rendered `[data-ws-list]` if the host has one, else render its
 * own markup (restored by `destroy()` — adopted markup is NOT restored);
 * add `waveform-sounds` + `waveform-sounds--<player>` to the host, and
 * have `destroy()` remove only the ones it added (not those already
 * present). `ready` is a promise from construction.
 */
class MockSounds {
	el: HTMLElement;
	opts: Record<string, unknown>;
	/** Whether this instance adopted server-rendered markup. */
	adopted: boolean;
	/** `data-url` of each adopted row, and whether any was hidden. */
	adoptedUrls: string[];
	adoptedHidden: number;
	ready: Promise<void>;
	resolveReady!: () => void;
	play = vi.fn();
	pause = vi.fn();
	toggle = vi.fn();
	next = vi.fn();
	previous = vi.fn();
	setFilter = vi.fn();
	clearFilters = vi.fn();
	setSort = vi.fn();
	setLoop = vi.fn();
	showMore = vi.fn();
	destroy: ReturnType<typeof vi.fn>;
	constructor(el: HTMLElement, opts: Record<string, unknown>) {
		const n = instances.length;
		this.el = el;
		this.opts = opts;
		this.ready = holdReady
			? new Promise<void>((r) => (this.resolveReady = r))
			: Promise.resolve();
		const list = el.querySelector('[data-ws-list]');
		this.adopted = !!list;
		const rows = Array.from(el.querySelectorAll<HTMLElement>('[data-ws-index]'));
		this.adoptedUrls = rows.map((r) => r.dataset.url ?? '');
		this.adoptedHidden = rows.filter((r) => r.hasAttribute('data-test-dirty')).length;
		const original = list ? null : el.innerHTML;
		if (!list) el.innerHTML = '<ul data-ws-list><li data-ws-index="0" data-url="/fetched.mp3"></li></ul>';
		const modifier = `waveform-sounds--${opts.player === 'strip' ? 'strip' : 'inline'}`;
		const added = ['waveform-sounds', modifier].filter((c) => !el.classList.contains(c));
		el.classList.add(...added);
		this.destroy = vi.fn(() => {
			lifecycle.push(`destroy:${n}`);
			if (original != null) el.innerHTML = original;
			el.classList.remove(...added);
		});
		lifecycle.push(`construct:${n}`);
		instances.push(this);
	}
}

vi.mock('@arraypress/waveform-sounds/no-autoinit', () => ({
	default: MockSounds,
	WaveformSounds: MockSounds,
}));

import { WaveformSounds } from '../src';

const sounds = [
	{ url: '/a.mp3', title: 'Kick Loop', type: 'Drums', bpm: 120, key: 'Fmin' },
	{ url: '/b.mp3', title: 'Bass Line', type: 'Bass', bpm: 128, key: 'C' },
];

beforeEach(() => {
	instances.length = 0;
	lifecycle.length = 0;
	holdReady = false;
});

describe('WaveformSounds (Vue)', () => {
	it("renders a div.wfp-host holding the core's markup for `sounds`", () => {
		const wrapper = mount(WaveformSounds, { props: { sounds } });
		const host = wrapper.find('div.wfp-host');
		expect(host.exists()).toBe(true);
		expect(host.find('[data-ws-list]').exists()).toBe(true);
		const rows = host.findAll('[data-ws-index]');
		expect(rows).toHaveLength(2);
		expect(rows[0].attributes('data-url')).toBe('/a.mp3');
		expect(rows[0].attributes('data-key')).toBe('Fm'); // normalised by the core
		expect(host.find('.ws-title').text()).toBe('Kick Loop');
	});

	it("carries the core's classes so server markup is styled before hydration", () => {
		const inline = mount(WaveformSounds, { props: { sounds } });
		expect(inline.classes()).toEqual(expect.arrayContaining(['wfp-host', 'waveform-sounds', 'waveform-sounds--inline']));
		const strip = mount(WaveformSounds, { props: { sounds, player: 'strip' } });
		expect(strip.classes()).toContain('waveform-sounds--strip');
		expect(strip.find('[data-ws-engine]').classes()).toContain('ws-engine--strip');
	});

	it('renders the markup with the render options (columns, search, strings)', () => {
		const wrapper = mount(WaveformSounds, {
			props: { sounds, columns: ['bpm'], search: false, strings: { count: '{count} geluiden' } },
		});
		expect(wrapper.find('.ws-bpm').exists()).toBe(true);
		expect(wrapper.find('.ws-key').exists()).toBe(false);
		expect(wrapper.find('[data-ws-search]').exists()).toBe(false);
		expect(wrapper.find('[data-ws-count]').text()).toBe('2 geluiden');
	});

	it('renders the sort menu from `sorts`, its first usable order selected', () => {
		const wrapper = mount(WaveformSounds, { props: { sounds, sorts: ['bpm', 'title'] } });
		const menu = wrapper.find('[data-ws-menu="sort"]');
		expect(menu.exists()).toBe(true);
		expect(menu.find('[data-ws-menu-value]').text()).toBe('BPM');
		expect(menu.findAll('[role=option][data-value]').map((o) => o.attributes('data-value'))).toEqual(['bpm', 'title']);
	});

	it('`sorts: []` hides the sort menu; `showCount: false` hides the count', () => {
		const wrapper = mount(WaveformSounds, { props: { sounds, sorts: [], showCount: false } });
		expect(wrapper.find('[data-ws-menu="sort"]').exists()).toBe(false);
		expect(wrapper.find('[data-ws-count]').exists()).toBe(false);
	});

	it('renders the key filter as a dropdown menu (no native <select>)', () => {
		const wrapper = mount(WaveformSounds, { props: { sounds } });
		expect(wrapper.find('[data-ws-menu="key"]').exists()).toBe(true);
		expect(wrapper.find('select').exists()).toBe(false);
	});

	it('gives each instance its own dropdown ids by default (two lists of the same sounds)', async () => {
		// One app (as on a real page): useId() is unique per app.
		const page = mount({
			render: () => h('div', [h(WaveformSounds, { sounds }), h(WaveformSounds, { sounds })]),
		});
		const [a, b] = page.findAllComponents(WaveformSounds);
		const ids = (w: typeof a) => w.findAll('[id]').map((el) => el.attributes('id'));
		expect(ids(a).length).toBeGreaterThan(0);
		expect(ids(a).filter((id) => ids(b).includes(id))).toEqual([]);
		await flushPromises();
		// The runtime gets the same prefix the markup was rendered with.
		const prefix = instances[0].opts.idPrefix as string;
		expect(prefix).toMatch(/^ws-[\w-]+$/);
		expect(ids(a).every((id) => id!.startsWith(prefix))).toBe(true);
	});

	it('an explicit idPrefix wins, in the markup and the runtime options', async () => {
		const wrapper = mount(WaveformSounds, { props: { sounds, idPrefix: 'loops' } });
		await flushPromises();
		expect(instances[0].opts.idPrefix).toBe('loops');
		expect(wrapper.findAll('[id]').every((el) => el.attributes('id')!.startsWith('loops'))).toBe(true);
	});

	it('leaves the host empty for a manifest (the runtime fetches + renders)', () => {
		const wrapper = mount(WaveformSounds, { props: { manifest: '/sounds.json' } });
		expect(wrapper.element.innerHTML).toBe('');
	});

	it('never carries data-waveform-sounds (the global auto-init marker)', () => {
		const wrapper = mount(WaveformSounds, { props: { sounds } });
		expect(wrapper.element.hasAttribute('data-waveform-sounds')).toBe(false);
	});

	it('constructs the core instance over the host, adopting the rendered rows', async () => {
		const wrapper = mount(WaveformSounds, { props: { sounds } });
		await flushPromises();
		expect(instances).toHaveLength(1);
		expect(instances[0].el).toBe(wrapper.element);
		expect(instances[0].adopted).toBe(true);
		expect(instances[0].adoptedUrls).toEqual(['/a.mp3', '/b.mp3']);
	});

	it('maps options into the constructor', async () => {
		mount(WaveformSounds, {
			props: {
				sounds,
				player: 'strip',
				filters: ['type', 'bpm'],
				sorts: ['title', 'bpm'],
				showCount: false,
				menuSearch: 12,
				pageSize: 100,
				columns: ['type', 'duration'],
				waveformStyle: 'bars',
				waveformColor: '#888',
				barWidth: 3,
				barGap: 0,
				autoAdvance: true,
				playerOptions: { height: 64 },
			},
		});
		await flushPromises();
		expect(instances[0].opts).toMatchObject({
			sounds,
			player: 'strip',
			filters: ['type', 'bpm'],
			sorts: ['title', 'bpm'],
			showCount: false,
			menuSearch: 12,
			pageSize: 100,
			columns: ['type', 'duration'],
			waveformStyle: 'bars',
			waveformColor: '#888',
			barWidth: 3,
			barGap: 0, // 0 is a real value, not "unset"
			autoAdvance: true,
			playerOptions: { height: 64 },
		});
	});

	it('omits absent props so the core defaults win', async () => {
		mount(WaveformSounds, { props: { manifest: '/sounds.json' } });
		await flushPromises();
		const { opts } = instances[0];
		for (const key of ['sounds', 'search', 'sorts', 'showCount', 'loop', 'arrowAudition', 'playerOptions', 'playerClass']) {
			expect(key in opts, key).toBe(false);
		}
		expect(opts.manifest).toBe('/sounds.json');
	});

	it('forwards explicit boolean props (including false)', async () => {
		mount(WaveformSounds, { props: { sounds, search: false, arrowAudition: false, showCount: false, loopToggle: true } });
		await flushPromises();
		expect(instances[0].opts).toMatchObject({ search: false, arrowAudition: false, showCount: false, loopToggle: true });
	});

	it('forwards playerClass by reference', async () => {
		class FakePlayer {}
		mount(WaveformSounds, { props: { sounds, playerClass: FakePlayer } });
		await flushPromises();
		expect(instances[0].opts.playerClass).toBe(FakePlayer);
	});

	it('emits the core callbacks with their arguments', async () => {
		const wrapper = mount(WaveformSounds, { props: { sounds } });
		await flushPromises();
		const call = (name: string, ...args: unknown[]) =>
			(instances[0].opts[name] as (...a: unknown[]) => void)(...args);

		call('onReady', 'inst');
		call('onPlay', 'sound', 'inst');
		call('onPause', 'sound', 'inst');
		call('onEnd', 'sound', 'inst');
		call('onFilter', ['sound'], 'inst');
		call('onError', 'boom', 'inst');

		expect(wrapper.emitted('ready')).toEqual([['inst']]);
		expect(wrapper.emitted('play')).toEqual([['sound', 'inst']]);
		expect(wrapper.emitted('pause')).toEqual([['sound', 'inst']]);
		expect(wrapper.emitted('end')).toEqual([['sound', 'inst']]);
		expect(wrapper.emitted('filter')).toEqual([[['sound'], 'inst']]);
		expect(wrapper.emitted('error')).toEqual([['boom', 'inst']]);
	});

	it('reaches a swapped listener without rebuilding', async () => {
		const first = vi.fn();
		const second = vi.fn();
		const wrapper = mount(WaveformSounds, { props: { sounds, onPlay: first } });
		await flushPromises();

		await wrapper.setProps({ onPlay: second });
		await flushPromises();
		expect(instances).toHaveLength(1);

		(instances[0].opts.onPlay as (...a: unknown[]) => void)('sound', 'inst');
		expect(first).not.toHaveBeenCalled();
		expect(second).toHaveBeenCalledWith('sound', 'inst');
	});

	it('a swapped playerOptions callback reaches the engine without rebuilding', async () => {
		// The core captures playerOptions when it creates the engine; the
		// wrapper hands it trampolines to the latest prop value.
		const first = vi.fn();
		const second = vi.fn();
		const wrapper = mount(WaveformSounds, {
			props: { sounds, playerOptions: { height: 40, onTimeUpdate: first } },
		});
		await flushPromises();

		await wrapper.setProps({ playerOptions: { height: 40, onTimeUpdate: second } });
		await flushPromises();
		expect(instances).toHaveLength(1);

		const engineOpts = instances[0].opts.playerOptions as Record<string, (...a: unknown[]) => void>;
		engineOpts.onTimeUpdate(1, 2, 'player');
		expect(first).not.toHaveBeenCalled();
		expect(second).toHaveBeenCalledWith(1, 2, 'player');

		// Adding a callback is a change of shape — that does rebuild.
		await wrapper.setProps({ playerOptions: { height: 40, onTimeUpdate: second, onLoad: vi.fn() } });
		await flushPromises();
		expect(instances).toHaveLength(2);
	});

	it('destroys the instance on unmount', async () => {
		const wrapper = mount(WaveformSounds, { props: { sounds } });
		await flushPromises();
		const inst = instances[0];
		wrapper.unmount();
		expect(inst.destroy).toHaveBeenCalledTimes(1);
	});

	it('never constructs when unmounted before the runtime import resolves', async () => {
		const wrapper = mount(WaveformSounds, { props: { sounds } });
		wrapper.unmount();
		await flushPromises();
		expect(instances).toHaveLength(0);
	});

	it('rebuilds when the sounds change, and the new instance adopts the new rows', async () => {
		const wrapper = mount(WaveformSounds, { props: { sounds } });
		await flushPromises();

		await wrapper.setProps({ sounds: [...sounds, { url: '/c.mp3', title: 'Pad' }] });
		await flushPromises();

		expect(lifecycle).toEqual(['construct:0', 'destroy:0', 'construct:1']);
		expect(instances[1].adoptedUrls).toEqual(['/a.mp3', '/b.mp3', '/c.mp3']);
		expect(wrapper.findAll('[data-ws-index]')).toHaveLength(3);
	});

	it('does not rebuild when a re-rendering parent passes an equal sounds array', async () => {
		const wrapper = mount(WaveformSounds, { props: { sounds, columns: ['bpm'] } });
		await flushPromises();

		await wrapper.setProps({ sounds: sounds.map((s) => ({ ...s })), columns: ['bpm'] });
		await flushPromises();
		expect(instances).toHaveLength(1);
	});

	it("a rebuild hands the new instance clean markup, not the old one's state", async () => {
		const wrapper = mount(WaveformSounds, { props: { sounds, barWidth: 2 } });
		await flushPromises();
		// Stand-in for the runtime's own DOM state: filtered / painted rows.
		wrapper.findAll('[data-ws-index]').forEach((r) => r.element.setAttribute('data-test-dirty', ''));

		await wrapper.setProps({ barWidth: 3 });
		await flushPromises();

		expect(lifecycle).toEqual(['construct:0', 'destroy:0', 'construct:1']);
		expect(instances[1].opts.barWidth).toBe(3);
		expect(instances[1].adopted).toBe(true);
		expect(instances[1].adoptedHidden).toBe(0);
		expect(instances[1].adoptedUrls).toEqual(['/a.mp3', '/b.mp3']);
	});

	it('switching sounds → manifest empties the host for the runtime to fill', async () => {
		const wrapper = mount(WaveformSounds, { props: { sounds } });
		await flushPromises();
		await wrapper.setProps({ sounds: undefined, manifest: '/sounds.json' });
		await flushPromises();
		expect(instances).toHaveLength(2);
		expect(instances[1].adopted).toBe(false);
		expect(instances[1].opts.manifest).toBe('/sounds.json');
	});

	it('applies `loop` live through setLoop(), without rebuilding', async () => {
		const wrapper = mount(WaveformSounds, { props: { sounds, loop: false } });
		await flushPromises();
		expect(instances[0].opts.loop).toBe(false);

		await wrapper.setProps({ loop: true });
		await flushPromises();
		expect(instances).toHaveLength(1);
		expect(instances[0].setLoop).toHaveBeenCalledWith(true);
	});

	it('exposes the imperative API via the component ref', async () => {
		const wrapper = mount(WaveformSounds, { props: { sounds } });
		await flushPromises();
		const vm = wrapper.vm as unknown as Record<string, (...a: unknown[]) => void> & {
			instance: MockSounds | null;
		};
		const inst = instances[0];

		vm.play('sound-2', { at: 0.5 });
		vm.pause();
		vm.toggle(1);
		vm.next();
		vm.previous();
		vm.setFilter({ type: 'Drums' });
		vm.clearFilters();
		vm.setSort('bpm');
		vm.setLoop(true);
		vm.showMore();

		// Synchronous once ready — play() from a click keeps user activation.
		expect(inst.play).toHaveBeenCalledWith('sound-2', { at: 0.5 });
		expect(inst.pause).toHaveBeenCalledTimes(1);
		expect(inst.toggle).toHaveBeenCalledWith(1);
		expect(inst.next).toHaveBeenCalledTimes(1);
		expect(inst.previous).toHaveBeenCalledTimes(1);
		expect(inst.setFilter).toHaveBeenCalledWith({ type: 'Drums' });
		expect(inst.clearFilters).toHaveBeenCalledTimes(1);
		expect(inst.setSort).toHaveBeenCalledWith('bpm');
		expect(inst.setLoop).toHaveBeenCalledWith(true);
		expect(inst.showMore).toHaveBeenCalledTimes(1);
		expect(vm.instance).toBe(inst);
	});

	it('queues calls made while the instance is still building, in order', async () => {
		holdReady = true;
		const wrapper = mount(WaveformSounds, { props: { manifest: '/sounds.json' } });
		await flushPromises();
		const vm = wrapper.vm as unknown as Record<string, (...a: unknown[]) => void>;
		const inst = instances[0];
		const order: string[] = [];
		inst.setFilter.mockImplementation(() => order.push('setFilter'));
		inst.play.mockImplementation(() => order.push('play'));

		vm.setFilter({ query: 'kick' });
		vm.play(0);
		expect(order).toEqual([]);

		inst.resolveReady();
		await flushPromises();
		expect(order).toEqual(['setFilter', 'play']);
	});

	it('drops queued calls if the instance is replaced before it is ready', async () => {
		holdReady = true;
		const wrapper = mount(WaveformSounds, { props: { sounds } });
		await flushPromises();
		const vm = wrapper.vm as unknown as Record<string, (...a: unknown[]) => void>;
		const first = instances[0];
		vm.play(0);

		await wrapper.setProps({ barWidth: 4 });
		await flushPromises();
		first.resolveReady();
		await flushPromises();
		expect(first.play).not.toHaveBeenCalled();
	});

	it('calls before the instance exists are no-ops', () => {
		const wrapper = mount(WaveformSounds, { props: { sounds } });
		const vm = wrapper.vm as unknown as { play: () => void; instance: unknown };
		expect(() => vm.play()).not.toThrow();
		expect(vm.instance).toBeNull();
	});

	/* The runtime adds its classes to the host and a class-only change
	 * doesn't rebuild — so if Vue re-patched the `class` attribute, nothing
	 * would put them back and the list would lose its styling. */
	it("keeps the runtime's host classes when only the fall-through class changes", async () => {
		const wrapper = mount(WaveformSounds, {
			props: { sounds },
			attrs: { class: 'first' },
		});
		await flushPromises();
		const el = wrapper.element as HTMLElement;

		await wrapper.setProps({ class: { second: true } } as never);
		await flushPromises();

		expect(instances).toHaveLength(1); // no rebuild to paper over it
		expect(el.className.split(' ').sort()).toEqual(
			['second', 'waveform-sounds', 'waveform-sounds--inline', 'wfp-host'].sort()
		);

		await wrapper.setProps({ class: undefined } as never);
		expect(el.className.split(' ').sort()).toEqual(['waveform-sounds', 'waveform-sounds--inline', 'wfp-host'].sort());
	});

	it('a player change rebuilds and the modifier class follows it', async () => {
		const wrapper = mount(WaveformSounds, { props: { sounds } });
		await flushPromises();
		await wrapper.setProps({ player: 'strip' });
		await flushPromises();
		const el = wrapper.element as HTMLElement;
		expect(instances).toHaveLength(2);
		expect(el.classList.contains('waveform-sounds--strip')).toBe(true);
		// Server-rendered, so the runtime never owned `--inline`: the wrapper
		// has to drop it before the rebuild, or both modifiers stay.
		expect(el.classList.contains('waveform-sounds--inline')).toBe(false);
		expect(el.querySelector('[data-ws-engine]')?.classList.contains('ws-engine--strip')).toBe(true);
	});

	it("keeps a layout modifier the consumer put in `class` across a rebuild", async () => {
		const wrapper = mount(WaveformSounds, { props: { sounds }, attrs: { class: 'waveform-sounds--inline' } });
		await flushPromises();
		await wrapper.setProps({ barWidth: 5 });
		await flushPromises();
		expect(instances).toHaveLength(2);
		expect((wrapper.element as HTMLElement).classList.contains('waveform-sounds--inline')).toBe(true);
	});

	it('still forwards non-class attributes to the host', async () => {
		const onClick = vi.fn();
		const wrapper = mount(WaveformSounds, {
			props: { sounds },
			attrs: { id: 'sounds-1', 'data-x': '1', style: 'max-width: 40rem', onClick },
		});
		const el = wrapper.element as HTMLDivElement;
		expect(el.id).toBe('sounds-1');
		expect(el.dataset.x).toBe('1');
		expect(el.style.maxWidth).toBe('40rem');
		await wrapper.trigger('click');
		expect(onClick).toHaveBeenCalledTimes(1);
	});
});
