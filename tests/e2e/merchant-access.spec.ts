import { test } from "./proof-s7-fixture";
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { MERCHANT_COOKIE, mintMerchant } from "../../src/lib/onboarding/links";
import { connectDb } from "../../src/lib/db/client";
import { redact } from "../../src/lib/log";
import { publishDraft, readMenu } from "../../src/lib/onboarding/service";

let admin: postgres.Sql;
let database: ReturnType<typeof connectDb>;
test.beforeAll(() => {
  const url = new URL(process.env.MERCHANT_ACCESS_TEST_DATABASE_URL ?? "http://missing.invalid");
  assert.equal(url.hostname, "127.0.0.1");
  assert.match(url.pathname, /^\/backfill_t_merchant_browser_/);
  admin = postgres(url.toString(), { max: 2, onnotice: () => {} });
  database = connectDb(url.toString(), 2);
});
test.afterAll(async () => { await database?.close(); await admin?.end({ timeout: 5 }); });
test.afterEach(async ({ page }, info) => {
  if (info.errors.length && page.url().includes("#bfm_")) {
    await page.evaluate(() => window.history.replaceState(null, "", window.location.pathname)).catch(() => {});
  }
  for (const error of info.errors) {
    if (error.message) error.message = redact(error.message);
    if (error.stack) error.stack = redact(error.stack);
    if (error.value) error.value = redact(error.value);
  }
});

async function rowCount(table: "merchants" | "rules" | "commitments" | "llm_calls") {
  const [row] = await admin.unsafe<{ count: number }[]>(`select count(*)::int as count from ${table}`);
  return row?.count;
}

test("entry offers new and existing merchant access", async ({ page }) => {
  await page.goto("/merchant");
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => Array.from(document.fonts).some(font => font.status === "error"))).toBe(false);
  await expect(page.getByRole("button", { name: "Create my workspace", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open my workspace", exact: true })).toBeVisible();
  await expect(page.getByLabel("Café or restaurant name")).toBeVisible();
  await expect(page.getByRole("navigation").getByRole("link", { name: "I'm a merchant" })).toHaveAttribute("href", "/merchant");
  await page.getByLabel("Café or restaurant name").fill("   ");
  await page.getByRole("button", { name: "Create my workspace", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Enter a café name" })).toBeVisible();
});

test("website signup downloads a link and reopens the same workspace in a fresh browser", async ({ page, context, browser, baseURL }) => {
  const before = await rowCount("merchants");
  await page.goto("/");
  await page.getByRole("main").getByRole("link", { name: "I'm a merchant", exact: true }).click();
  await page.getByLabel("Café or restaurant name").fill("Synthetic Browser Cafe");
  await page.getByRole("button", { name: "Create my workspace", exact: true }).click();
  await expect(page).toHaveURL(/\/merchant\/access$/);
  const response = await page.reload();
  expect(response?.headers()["cache-control"]).toContain("no-store");
  const field = page.getByLabel("Your private access link");
  await expect(field).toHaveAttribute("type", "password");
  await expect(field).not.toHaveValue("");
  const link = await field.inputValue();
  expect(new URL(link).origin === baseURL).toBe(true);
  expect(new URL(link).pathname).toBe("/merchant/enter");
  const cookie = (await context.cookies()).find(value => value.name === MERCHANT_COOKIE);
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.path).toBe("/merchant");
  expect(cookie?.sameSite).toBe("Lax");
  await page.evaluate(() => Object.defineProperty(navigator.clipboard, "writeText", { configurable: true, value: async () => { throw new Error("Clipboard denied"); } }));
  await page.getByRole("button", { name: "Copy access link" }).click();
  await expect(page.getByRole("main").getByRole("status")).toContainText("Download your link instead");
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download access link" }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe("backfill-access.txt");
  const file = await download.path();
  assert(file);
  expect((await readFile(file, "utf8")).trim() === link).toBe(true);
  await page.getByRole("link", { name: "Continue to my workspace" }).click();
  await expect(page.getByRole("heading", { name: "Synthetic Browser Cafe", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Add an offer from your menu" })).toBeVisible();
  await expect(page.getByText("No offers yet.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("button", { name: "Create my workspace", exact: true })).toBeVisible();
  await page.goto("/merchant/access");
  await expect(page).toHaveURL(/\/merchant$/);

  const fresh = await browser.newContext();
  try {
    await fresh.route("**/*", route => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
    const returning = await fresh.newPage();
    await returning.addInitScript(token => {
      if (window.location.pathname === "/merchant/enter") window.location.hash = token;
    }, new URL(link).hash.slice(1));
    await returning.goto(`${baseURL}/merchant/enter`);
    await expect(returning.getByRole("heading", { name: "Synthetic Browser Cafe", exact: true })).toBeVisible();
    expect(await rowCount("merchants")).toBe((before ?? 0) + 1);
    for (const table of ["rules", "commitments", "llm_calls"] as const) expect(await rowCount(table)).toBe(0);
  } finally { await fresh.close(); }
});

test("existing CLI links work through pasted entry and unknown links stay signed out", async ({ page, baseURL }) => {
  const merchant = await mintMerchant(database.db, "Existing Synthetic Cafe");
  await page.goto("/merchant");
  await page.getByLabel("Your private access link").fill(`https://foreign.invalid/merchant/enter#${merchant.token}`);
  await page.getByRole("button", { name: "Open my workspace", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "isn't valid for this site" })).toBeVisible();
  await page.getByLabel("Your private access link").fill(`${baseURL}/merchant/enter#bfm_${"z".repeat(43)}`);
  await page.getByRole("button", { name: "Open my workspace", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "That link isn't valid." })).toBeVisible();
  await page.getByLabel("Your private access link").fill(`/merchant/enter#${merchant.token}`);
  await page.getByRole("button", { name: "Open my workspace", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Existing Synthetic Cafe", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Existing Synthetic Cafe", exact: true })).toBeVisible();
});

test("entry and saved access fit mobile and desktop in both themes", async ({ page, context }) => {
  for (const width of [375, 1280]) for (const colorScheme of ["light", "dark"] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme });
    await page.goto("/merchant");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByLabel("Café or restaurant name").focus();
    await expect(page.getByLabel("Café or restaurant name")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Create my workspace", exact: true })).toBeFocused();
    if (width === 375 && colorScheme === "light") await page.screenshot({ path: "/tmp/backfill-merchant-entry-375.png", fullPage: true });
  }
  const merchant = await mintMerchant(database.db, "Responsive Synthetic Cafe");
  await context.addCookies([{ name: MERCHANT_COOKIE, value: merchant.token, domain: "127.0.0.1", path: "/merchant", httpOnly: true, sameSite: "Lax" }]);
  for (const width of [375, 1280]) for (const colorScheme of ["light", "dark"] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme });
    await page.goto("/merchant/access");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (width === 1280 && colorScheme === "light") await page.screenshot({ path: "/tmp/backfill-merchant-save-1280.png", fullPage: true });
  }
});

test("a same-name signup cannot read another merchant's private draft", async ({ page, context }) => {
  const owner = await mintMerchant(database.db, "Shared Synthetic Cafe");
  const draft = { currency: "SGD", items: [], cover: { itemIndexes: [0], description: "Private synthetic draft" } };
  const [stored] = await admin`insert into menu_drafts(merchant_id,photo_sha256,photo_bytes,photo_type,model,draft,verdict) values (${owner.id}, ${"a".repeat(64)}, 1, 'image/png', 'offline-fixture', ${admin.json(draft)}, 'no_items') returning id`;
  assert(stored);
  await context.addCookies([{ name: MERCHANT_COOKIE, value: owner.token, domain: "127.0.0.1", path: "/merchant", httpOnly: true, sameSite: "Lax" }]);
  const ownResponse = await page.goto(`/merchant/drafts/${stored.id}`);
  expect(ownResponse?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Check your menu" })).toBeVisible();
  await page.goto("/merchant");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByLabel("Café or restaurant name").fill("Shared Synthetic Cafe");
  await page.getByRole("button", { name: "Create my workspace", exact: true }).click();
  await expect(page).toHaveURL(/\/merchant\/access$/);
  expect((await context.cookies()).find(cookie => cookie.name === MERCHANT_COOKIE)?.value === owner.token).toBe(false);
  const otherResponse = await page.goto(`/merchant/drafts/${stored.id}`);
  expect(otherResponse?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Check your menu" })).toHaveCount(0);
});

test("registration failure shows a usable error and sets no successful session", async ({ page, context }) => {
  await admin`revoke execute on function register_merchant(text,text) from backfill_app`;
  try {
    await page.goto("/merchant");
    await page.getByLabel("Café or restaurant name").fill("Failure Synthetic Cafe");
    await page.getByRole("button", { name: "Create my workspace", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Couldn't create your workspace" })).toBeVisible();
    expect((await context.cookies()).some(cookie => cookie.name === MERCHANT_COOKIE)).toBe(false);
  } finally { await admin`grant execute on function register_merchant(text,text) to backfill_app`; }
});

test("full signup capacity keeps the visitor signed out with a retry message", async ({ page, context }) => {
  await admin`insert into merchants(name) select 'Capacity synthetic fixture' from generate_series(1,100)`;
  const before = await rowCount("merchants");
  await page.goto("/merchant");
  await page.getByLabel("Café or restaurant name").fill("Capped Synthetic Cafe");
  await page.getByRole("button", { name: "Create my workspace", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Try again later" })).toBeVisible();
  expect(await rowCount("merchants")).toBe(before);
  expect((await context.cookies()).some(cookie => cookie.name === MERCHANT_COOKIE)).toBe(false);
});

test("an owner records a voice change in the browser and the server accepts its WAV", async ({ baseURL, page }) => {
  expect((await page.request.get("/")).headers()["permissions-policy"]).toContain("microphone=()");
  const owner = await mintMerchant(database.db, "Recording Synthetic Cafe");
  const read = await readMenu(database.db, owner.id, Buffer.from("89504e470d0a1a0a", "hex"), async () => ({ currency: "SGD", items: [{ name: "Synthetic toast set", priceCents: 600 }], cover: { itemIndexes: [0], description: "Synthetic toast set" } }), "offline-fixture");
  assert("draftId" in read);
  const published = await publishDraft(database.db, owner.id, read.draftId, { capacityCovers: 20, terms: { window: { weekday: 2, startMinute: 840, endMinute: 1020, commitByMinute: 720 }, discountBps: 2500, minPoolCovers: 8, perAgentCapCovers: 4, floorPriceCents: 400 } });
  assert.equal(published.status, "published");
  const browser = await chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
  try {
    const context = await browser.newContext({ baseURL });
    await context.addCookies([{ name: MERCHANT_COOKIE, value: owner.token, domain: "127.0.0.1", path: "/merchant", httpOnly: true, sameSite: "Lax" }]);
    const board = await context.newPage();
    const response = await board.goto("/merchant");
    expect(response?.headers()["permissions-policy"]).toContain("microphone=(self)");
    // Kopi's button renders only after hydration; a click before it would do nothing.
    await expect(board.getByRole("button", { name: "Show Kopi", exact: true })).toBeVisible({ timeout: 15_000 });
    await board.getByText("Change by voice", { exact: true }).click();
    await board.getByRole("button", { name: "Record your change", exact: true }).click();
    await expect(board.getByText(/^Recording \d+s of up to 59s$/)).toBeVisible();
    await board.waitForTimeout(1500);
    await board.getByRole("button", { name: "Stop and transcribe", exact: true }).click();
    // The offline provider cannot transcribe, so reaching it proves the recording passed the WAV checks.
    await expect(board.getByText("The audio could not be transcribed.", { exact: false })).toBeVisible({ timeout: 15_000 });
    await expect(board.getByText("not a supported WAV", { exact: false })).toHaveCount(0);
  } finally { await browser.close(); }
});
