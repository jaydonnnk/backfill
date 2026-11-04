import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { webDb } from "@/lib/db/client";
import { authenticateMerchant, MERCHANT_COOKIE } from "@/lib/onboarding/links";
import { SaveAccessLink } from "./save-link";

export const dynamic = "force-dynamic";

export default async function MerchantAccess() {
  const token = (await cookies()).get(MERCHANT_COOKIE)?.value;
  if (!token || !await authenticateMerchant(webDb(), token)) redirect("/merchant");
  return <main className="workspace-page">
    <p className="eyebrow">Your workspace is ready</p>
    <h1>Save your way back in.</h1>
    <p>Keep this link to return on any device.</p>
    <SaveAccessLink token={token} />
  </main>;
}
