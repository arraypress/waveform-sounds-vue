/**
 * test/types.typecheck.ts
 * -----------------------
 *
 * Type-level assertions, checked by `npm run typecheck` (not vitest).
 *
 * The exported props type is derived from the core's `WaveformSoundsOptions`;
 * the component's RUNTIME prop declarations are hand-written. These keep
 * the two in step at the type level: every option the props type accepts
 * is a declared runtime prop, with the core's own type (the drift test
 * checks the same at runtime).
 */
import type { WaveformSounds } from '../src/WaveformSounds';
import type { WaveformSoundsExpose, WaveformSoundsProps } from '../src/types';
import type { SoundsColumn, SoundsFilterControl, SoundsLayout, SoundInput } from '@arraypress/waveform-sounds';

type Equal<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const assert = <T extends true>(): T => true as T;

/** The component's public props, as a template / `h()` call sees them. */
type RuntimeProps = InstanceType<typeof WaveformSounds>['$props'];

// Every option the props type accepts is a runtime prop.
assert<Equal<Exclude<keyof WaveformSoundsProps, keyof RuntimeProps>, never>>();

// …with the core's types (nullable core options lose only their `null`).
assert<Equal<RuntimeProps['sounds'], SoundInput[] | undefined>>();
assert<Equal<RuntimeProps['player'], SoundsLayout | undefined>>();
assert<Equal<RuntimeProps['filters'], SoundsFilterControl[] | undefined>>();
assert<Equal<RuntimeProps['columns'], SoundsColumn[] | undefined>>();
assert<Equal<RuntimeProps['waveformStyle'], 'mirror' | 'bars' | undefined>>();
assert<Equal<RuntimeProps['loop'], boolean | undefined>>();
assert<Equal<RuntimeProps['pageSize'], number | undefined>>();

// The core callbacks are emits, typed with the core's arguments.
type OnPlay = NonNullable<RuntimeProps['onPlay']>;
assert<Equal<Parameters<OnPlay>, Parameters<NonNullable<import('@arraypress/waveform-sounds').WaveformSoundsOptions['onPlay']>>>>();
// …and not props in the exported type.
assert<Equal<Extract<keyof WaveformSoundsProps, `on${string}`>, never>>();

// The exposed API covers the core's methods with the core's signatures.
type Core = import('@arraypress/waveform-sounds').WaveformSounds;
type Methods = 'play' | 'pause' | 'toggle' | 'next' | 'previous' | 'setFilter' | 'clearFilters' | 'setSort' | 'setLoop' | 'showMore';
assert<Equal<Parameters<WaveformSoundsExpose['play']>, Parameters<Core['play']>>>();
assert<Equal<Parameters<WaveformSoundsExpose['setFilter']>, Parameters<Core['setFilter']>>>();
assert<Equal<Parameters<WaveformSoundsExpose['setSort']>, Parameters<Core['setSort']>>>();
assert<Equal<Exclude<Methods, keyof WaveformSoundsExpose>, never>>();
