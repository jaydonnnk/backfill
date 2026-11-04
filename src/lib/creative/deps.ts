import { createMediaClient } from '@/integrations/meta/media';
import { takeLimits } from '@/lib/rate-limit';
import { inspectPhoto, HOSTED_MAX_PIXELS } from './pixels';
import type { CreativeDeps } from './service';

// The host flag is separate from the owner's per-photo processing permissions.
export function creativeDeps(): CreativeDeps {
  const available = process.env.BACKFILL_CREATIVE_ENABLED === '1';
  const client = () => createMediaClient({apiKey:process.env.META_API_KEY ?? '',baseUrl:process.env.META_BASE_URL ?? 'https://api.meta.ai/v1'});
  return {
    source:'provider', available,
    take: (db,merchantId) => takeLimits(db,'creative',merchantId,2,20,86400),
    segment: async input => {
      if (!available) return null;
      try { await inspectPhoto(input.bytes,HOSTED_MAX_PIXELS); } catch { return null; }
      return client().segment(input);
    },
    background: async () => available ? client().background() : null,
  };
}
