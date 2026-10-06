/**
 * test/option-surface.ts
 * ----------------------
 *
 * The option surface this wrapper has to cover: every key of the core's
 * `WaveformSoundsOptions`, read from its hand-written `index.d.ts` as
 * installed in `node_modules`.
 *
 * The forwarding-drift test checks each key is either forwarded at runtime
 * or listed in its `NOT_FORWARDED` map with a reason, so a core option the
 * wrapper hasn't wired up fails a test instead of typechecking and being
 * silently dropped.
 */
// The installed core's declaration file, as text. A relative path (not the
// package specifier) because the core doesn't export `./index.d.ts`. (While
// the core is a `file:` symlink, vitest.config.ts allows Vite to read it.)
import soundsDts from '../node_modules/@arraypress/waveform-sounds/index.d.ts?raw';

/**
 * The property names declared directly on `export interface <name>` —
 * comments stripped, nested `{…}` / `(…)` collapsed so parameter names and
 * inline object members don't count, index signatures skipped.
 */
export function interfaceKeys(dts: string, name: string): string[] {
	const start = dts.indexOf(`export interface ${name}`);
	if (start < 0) throw new Error(`interface ${name} not found`);
	const open = dts.indexOf('{', start);
	let depth = 0;
	let end = open;
	for (; end < dts.length; end++) {
		if (dts[end] === '{') depth++;
		else if (dts[end] === '}' && --depth === 0) break;
	}

	let body = dts
		.slice(open + 1, end)
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/\/\/.*$/gm, '');
	let previous: string;
	do {
		previous = body;
		body = body.replace(/\{[^{}]*\}/g, '{}').replace(/\([^()]*\)/g, '()');
	} while (body !== previous);

	return [...body.matchAll(/(?:^|[;\n])\s*(?:readonly\s+)?([A-Za-z_$][\w$]*)\??\s*:/g)].map(
		(m) => m[1]
	);
}

/** Every `WaveformSoundsOptions` key the installed core declares. */
export const ALL_OPTIONS = interfaceKeys(soundsDts, 'WaveformSoundsOptions');

/** Core callback options (`onPlay`, `onFilter`, …). */
export const isCallback = (key: string): boolean => /^on[A-Z]/.test(key);
