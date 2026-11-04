import { expect, it } from "vitest";
import { redact } from "@/lib/log";

it("removes merchant credentials from failed navigation and form messages", () => {
  const token = "bfm_" + "x".repeat(43);
  const message = `page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:1/merchant/enter#${token}\nfill('${token}')`;
  expect(redact(message).includes(token)).toBe(false);
  expect(redact(message)).toContain("ERR_CONNECTION_REFUSED");
});
