/**
 * test/peer-ranges.test.ts
 * ------------------------
 *
 * The peer floors are load-bearing, not cosmetic: 0.1.0 is the first
 * `@arraypress/waveform-sounds` (and the one whose `/render` markup this
 * wrapper writes for the runtime to adopt), and the core's own peer floor
 * on `@arraypress/waveform-player` is 1.24.5.
 */
import { describe, it, expect } from 'vitest';
import pkg from '../package.json';

/** The lowest version a `^x.y.z` range admits, as comparable numbers. */
const floor = (range: string): number[] => {
	const m = /^\^(\d+)\.(\d+)\.(\d+)$/.exec(range);
	if (!m) throw new Error(`expected a ^x.y.z range, got ${range}`);
	return m.slice(1).map(Number);
};
const atLeast = (range: string, min: string): boolean => {
	const [a, b] = [floor(range), floor(`^${min}`)];
	for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
	return true;
};

describe('peer dependency floors', () => {
	it('requires waveform-sounds >= 0.1.0', () => {
		expect(atLeast(pkg.peerDependencies['@arraypress/waveform-sounds'], '0.1.0')).toBe(true);
	});

	it("requires waveform-player >= 1.24.5 (the sounds core's own floor)", () => {
		expect(atLeast(pkg.peerDependencies['@arraypress/waveform-player'], '1.24.5')).toBe(true);
	});
});
