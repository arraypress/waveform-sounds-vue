/**
 * test/ssr.test.ts
 * ----------------
 *
 * Server rendering + hydration, end to end through `vue/server-renderer`:
 *
 *   - `renderToString` emits the core's real list markup (from the DOM-free
 *     `/render` entry) inside the host, and never loads the browser runtime.
 *   - Hydrating that HTML on the client produces no mismatch warnings, and
 *     the runtime is constructed over the server's own rows (it adopts them
 *     rather than rebuilding).
 *
 * The runtime is mocked (jsdom has no Web Audio); the renderer is real.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { flushPromises } from '@vue/test-utils';

const runtime = vi.hoisted(() => ({
	loaded: false,
	constructed: [] as Array<{ el: HTMLElement; rowsAtConstruct: number; firstRow: Element | null }>,
}));

vi.mock('@arraypress/waveform-sounds/no-autoinit', () => {
	runtime.loaded = true;
	class Ctor {
		ready = Promise.resolve();
		destroy = () => {};
		constructor(el: HTMLElement) {
			runtime.constructed.push({
				el,
				rowsAtConstruct: el.querySelectorAll('[data-ws-index]').length,
				firstRow: el.querySelector('[data-ws-index]'),
			});
		}
	}
	return { default: Ctor, WaveformSounds: Ctor };
});

import { WaveformSounds } from '../src';

const sounds = [
	{ url: '/a.mp3', title: 'Kick Loop', type: 'Drums', bpm: 120, key: 'Fmin', peaks: [0.2, 0.8, 0.5] },
	{ url: '/b.mp3', title: 'Bass <Line>', type: 'Bass', bpm: 128, key: 'C', tags: ['sub', 'dark'] },
];

const app = () =>
	createSSRApp({
		render: () => h(WaveformSounds, { sounds, class: 'my-list', columns: ['bpm', 'key'] }),
	});

afterEach(() => {
	document.body.innerHTML = '';
});

describe('server rendering', () => {
	it("renders the core's list markup on the server, without loading the runtime", async () => {
		const html = await renderToString(app());
		expect(html).toContain('data-ws-list');
		expect(html).toContain('data-url="/a.mp3"');
		expect(html).toContain('Bass &lt;Line&gt;'); // escaped by the core's renderer
		expect(html).toMatch(/class="[^"]*\bwfp-host\b[^"]*\bmy-list\b[^"]*\bwaveform-sounds\b/);
		expect(html).not.toContain('data-waveform-sounds');
		expect(runtime.loaded).toBe(false);
	});

	it('hydrates without mismatches and the runtime adopts the server rows', async () => {
		const html = await renderToString(app());
		const root = document.createElement('div');
		root.innerHTML = html;
		document.body.appendChild(root);
		const serverRow = root.querySelector('[data-ws-index]');

		const warnings: string[] = [];
		const errorSpy = vi.spyOn(console, 'error').mockImplementation((...a) => warnings.push(a.join(' ')));
		const client = app();
		client.config.warnHandler = (msg) => warnings.push(msg);
		client.mount(root);
		await flushPromises();
		errorSpy.mockRestore();

		expect(warnings).toEqual([]);
		expect(runtime.constructed).toHaveLength(1);
		expect(runtime.constructed[0].rowsAtConstruct).toBe(2);
		// The very same element the server sent — adopted, not re-rendered.
		expect(runtime.constructed[0].firstRow).toBe(serverRow);
	});
});
