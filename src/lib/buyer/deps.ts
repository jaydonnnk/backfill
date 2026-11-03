import { gatewayBuyer, glimmerParser, type Models } from './models';

// Independently scoped switches are set only in a separately approved local runner.
export function buyerDeps(): Models {
  return {
    parse: async (request, referenceClock) => {
      if (process.env.BACKFILL_S4_NVIDIA_GLIMMER_APPROVED !== '1') throw Error('nvidia_glimmer_approval_required');
      return glimmerParser()(request, referenceClock);
    },
    decide: async (...args) => {
      if (process.env.BACKFILL_S4_GATEWAY_APPROVED !== '1') throw Error('gateway_approval_required');
      return gatewayBuyer()(...args);
    },
  };
}
