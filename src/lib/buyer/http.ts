import { authenticateAgent } from '@/lib/agents/tokens';
import type { Db } from '@/lib/db/client';
import { listOffers } from '@/lib/commitments/service';
import { ToolReplies } from '@/lib/mcp/server';
import type { Models } from './models';
import { buyerAction } from './service';

export function buyerHandler(db: () => Db, models: () => Models, clock: () => Date = () => new Date()) {
  return async (req: Request) => {
    const headers = { 'Cache-Control': 'no-store' };
    try {
      const party = await authenticateAgent(db(), req.headers.get('authorization'));
      if (!party) return Response.json({ status: 'unauthorized', session: null }, { status: 401, headers });
      if (req.method === 'GET') return Response.json(ToolReplies.list_offers.parse({ ok: true, offers: await listOffers(db(), clock), binding: 'Review exact terms and separately approve before submitting. Checkout is simulated.' }), { headers });
      if (Number(req.headers.get('content-length') ?? 0) > 6000) return Response.json({ status: 'invalid_request', session: null }, { status: 400, headers });
      const raw = await req.text();
      if (raw.length > 6000) return Response.json({ status: 'invalid_request', session: null }, { status: 400, headers });
      let input: unknown;
      try { input = JSON.parse(raw); } catch { return Response.json({ status: 'invalid_request', session: null }, { status: 400, headers }); }
      return Response.json(await buyerAction(db(), party, input, models(), clock), { headers });
    } catch { return Response.json({ status: 'unavailable', session: null }, { status: 503, headers }); }
  };
}
