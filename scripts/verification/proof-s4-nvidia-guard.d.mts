import type { Intent } from '../../src/lib/buyer/models';
export const NVIDIA_CASES: readonly { id: 'explicit' | 'clarification'; request: string; expected: Intent }[];
export const REFERENCE_CLOCK: string;
export function guardedNvidiaFetch(args: { directory: string; upstream: typeof fetch; system: string }): typeof fetch;
export function guardedNvidiaClarificationFetch(args: { directory: string; upstream: typeof fetch; system: string }): typeof fetch;
