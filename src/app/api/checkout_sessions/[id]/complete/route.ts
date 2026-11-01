import { checkoutHandler } from "@/lib/checkout/http";
import { webDb } from "@/lib/db/client";
export const dynamic = "force-dynamic";
const complete = checkoutHandler(webDb, "complete");
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  return complete(req, (await context.params).id);
}
