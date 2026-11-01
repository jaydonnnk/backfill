import { checkoutHandler } from "@/lib/checkout/http";
import { webDb } from "@/lib/db/client";
export const dynamic = "force-dynamic";
const read = checkoutHandler(webDb, "read");
export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  return read(req, (await context.params).id);
}
