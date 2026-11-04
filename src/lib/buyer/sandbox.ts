import { randomBytes, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { Db } from '@/lib/db/client';
import { tokenSha256 } from '@/lib/agents/tokens';
import { clientKey, takeLimits } from '@/lib/rate-limit';

export async function mintSandboxAgent(db: Db, client: string | null): Promise<{status:'ok';token:string}|{status:'rate_limited'}> {
  return db.transaction(async tx => {
    if (!await takeLimits(tx, 'sandbox_mint', client, 5, 60, 3600)) return {status:'rate_limited'};
    const token = 'bfa_' + randomBytes(32).toString('base64url');
    await tx.execute(sql`select mint_sandbox_agent(${'sandbox-' + randomUUID()}, ${tokenSha256(token)})`);
    return {status:'ok',token};
  });
}
export function sandboxHandler(db: () => Db) {
  return async (request: Request) => {
    const headers = {'Cache-Control':'no-store'};
    try {
      const result = await mintSandboxAgent(db(),clientKey(request.headers));
      return result.status === 'ok' ? Response.json({token:result.token},{headers}) : Response.json({status:'rate_limited'},{status:429,headers});
    } catch {return Response.json({status:'unavailable'},{status:503,headers});}
  };
}
