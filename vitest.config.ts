/**
 * vitest.config.ts
 * ----------------
 *
 * Vitest configuration for the Vue wrapper. Uses `jsdom` so we get a
 * fake DOM to mount components into; the `@arraypress/waveform-sounds`
 * runtime (`/no-autoinit`) is mocked at the module boundary in the
 * component tests, so they verify the wrapper's responsibilities — option
 * forwarding, the server-rendered markup, lifecycle, emits and the exposed
 * API — without an audio runtime. The DOM-free `/render` entry is the
 * real one: the markup it writes is the contract the runtime adopts.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['test/**/*.test.ts'],
		environment: 'jsdom',
		globals: false,
	},
});
