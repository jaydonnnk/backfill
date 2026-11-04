import type { CreativeDeps } from './service';

// Hosted media is enabled only inside a separately approved bounded runner.
// The normal app never loads credentials or creates an unbounded provider.
export function creativeDeps(): CreativeDeps {
  return { source: 'provider', available: false, segment: async () => null, background: async () => null };
}
