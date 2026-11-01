import { checkoutHandler } from "@/lib/checkout/http";
import { webDb } from "@/lib/db/client";
export const dynamic = "force-dynamic";
export const POST = checkoutHandler(webDb, "create");
