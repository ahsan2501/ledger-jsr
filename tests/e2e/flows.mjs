// End-to-end verification of the core flows, driven through the real UI.
//
// Requires: local Supabase running (`npx supabase start`), a production build
// (`npm run build`) and Playwright with Chromium. Run: npm run test:e2e
//
// The script starts `next start` itself, plus a local HTTPS "push service" so
// Web Push deliveries can be counted exactly (real push services can't be
// reached from a test box). The test certificate is trusted only by the app
// process via NODE_EXTRA_CA_CERTS — TLS verification stays on.
import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:https";
import { createECDH, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require("playwright"); } catch { playwright = require("/opt/node-tools/node_modules/playwright"); }

// ---------- config ----------
const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n")
  .filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const PORT = 3100;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = process.env.SHOTS_DIR || "test-results/screenshots";
mkdirSync(SHOTS, { recursive: true });
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const OWNER = { email: "owner-e2e@test.local", password: "owner-e2e-password-123" };
const OTHER = { email: "other-e2e@test.local", password: "other-e2e-password-123" };

const results = [];
async function step(name, fn) {
  process.stdout.write(`• ${name} … `);
  try { await fn(); results.push([name, "PASS"]); console.log("PASS"); }
  catch (e) { results.push([name, "FAIL", e.message]); console.log("FAIL\n   " + e.message.split("\n").slice(0, 6).join("\n   ")); }
}

// IST helpers
const istToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const plus = (iso, n) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// ---------- fake push service ----------
const certDir = mkdtempSync(path.join(tmpdir(), "e2e-push-"));
execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=127.0.0.1",
  "-addext", "subjectAltName=IP:127.0.0.1", "-keyout", `${certDir}/key.pem`, "-out", `${certDir}/cert.pem`], { stdio: "ignore" });
const pushHits = [];
const pushServer = createServer({ key: readFileSync(`${certDir}/key.pem`), cert: readFileSync(`${certDir}/cert.pem`) }, (req, res) => {
  let size = 0;
  req.on("data", (c) => (size += c.length));
  req.on("end", () => { pushHits.push({ url: req.url, size, ttl: req.headers.ttl }); res.writeHead(201).end(); });
});
await new Promise((r) => pushServer.listen(4999, "127.0.0.1", r));

// ---------- app server ----------
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT), "-H", "127.0.0.1"], {
  env: { ...process.env, NODE_EXTRA_CA_CERTS: `${certDir}/cert.pem`, ALLOW_SIGNUP: "false", ALLOWED_EMAILS: "" },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
const cleanup = () => { try { server.kill(); } catch { /* already gone */ } };
process.on("exit", cleanup);
process.on("uncaughtException", (e) => { console.error(e); cleanup(); process.exit(1); });
server.on("exit", (code) => { if (code) console.error("app server exited:", code, serverLog.slice(-500)); });
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));
for (let i = 0; i < 60; i++) {
  try { const r = await fetch(`${BASE}/login`); if (r.ok) break; } catch { /* starting */ }
  await new Promise((r) => setTimeout(r, 500));
}

async function resetUser({ email, password }) {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const old = data.users.find((u) => u.email === email);
  if (old) await admin.auth.admin.deleteUser(old.id);
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  return created.user.id;
}
const cron = async () => {
  const r = await fetch(`${BASE}/api/cron/reminders`, { headers: { authorization: `Bearer ${env.CRON_SECRET}` } });
  const j = await r.json();
  assert.equal(r.status, 200, JSON.stringify(j));
  return j;
};

const ownerId = await resetUser(OWNER);
const otherId = await resetUser(OTHER);
const today = istToday();
const due5 = plus(today, 5);

const browser = await playwright.chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.setDefaultTimeout(15000);

async function signIn(p, who) {
  await p.goto(`${BASE}/login`);
  await p.getByLabel("Email").fill(who.email);
  await p.getByLabel("Password").fill(who.password);
  await p.getByRole("button", { name: "Sign in" }).click();
  await p.waitForURL(`${BASE}/`);
}
const sheet = (p) => p.getByRole("dialog");
async function quickAdd(p, type) {
  await p.getByRole("button", { name: "Quick add" }).click();
  await sheet(p).getByRole("button", { name: new RegExp(`^${type}`) }).click();
}
async function submit(p, name) {
  await sheet(p).getByRole("button", { name }).click();
  await sheet(p).waitFor({ state: "detached" });
}

let statementId, invoiceId, itemId, cardId;

await step("Sign in (password, private app)", async () => {
  const r = await fetch(`${BASE}/finance`, { redirect: "manual" });
  assert.equal(r.status, 307, "unauthenticated request should redirect to /login");
  await signIn(page, OWNER);
  await page.getByText("Needs attention").waitFor();
});

// Fire reminders immediately: reminder time 00:00 IST so today's reminders are already due.
await step("Settings: reminder time saved (set to 00:00 for the test)", async () => {
  await page.goto(`${BASE}/settings`);
  await page.getByLabel("Reminder time").fill("00:00");
  await page.getByRole("button", { name: "Save reminder settings" }).click();
  await page.waitForTimeout(800);
  const { data } = await admin.from("profiles").select("reminder_time").eq("owner_id", ownerId).single();
  assert.equal(data.reminder_time, "00:00:00");
});

// A device subscription pointing at the local push service.
const ecdh = createECDH("prime256v1"); ecdh.generateKeys();
await admin.from("push_subscriptions").insert({
  owner_id: ownerId, endpoint: "https://127.0.0.1:4999/push/e2e-device",
  p256dh: ecdh.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url"), user_agent: "e2e",
});

await step("Flow 1: add a card bill due in 5 days → exactly one reminder after running the scheduler twice", async () => {
  await quickAdd(page, "Credit card bill");
  const s = sheet(page);
  await s.getByLabel("Card nickname").fill("E2E Card");
  await s.getByLabel("Issuer").fill("Test Bank");
  await s.getByLabel("Statement total").fill("30,000");
  await s.getByLabel("Minimum due").fill("1500");
  await s.getByLabel("Payment due date").fill(due5);
  await submit(page, "Add bill");
  const { data: st } = await admin.from("card_statements").select("id, card_id").eq("owner_id", ownerId).single();
  statementId = st.id; cardId = st.card_id;
  const r1 = await cron();
  const r2 = await cron();
  const { data: rem } = await admin.from("reminders").select("*").eq("source_id", statementId);
  assert.equal(rem.length, 1, "one reminder row");
  assert.equal(rem[0].remind_on, today, "reminder date = due date − 5 days");
  assert.equal(rem[0].status, "active");
  const { data: del } = await admin.from("push_deliveries").select("*").eq("reminder_id", rem[0].id);
  assert.equal(del.length, 1, "one push delivery row");
  assert.equal(pushHits.filter((h) => h.url === "/push/e2e-device").length, 1, "push service received exactly one notification");
  assert.ok(r1.sent >= 1 && r2.sent === 0, `run1 sent ${r1.sent}, run2 sent ${r2.sent}`);
  await page.goto(`${BASE}/inbox`);
  assert.equal(await page.getByText("Pay E2E Card bill by").count(), 1, "inbox shows it once");
  await page.screenshot({ path: `${SHOTS}/flow1-inbox.png` });
});

await step("Flow 2: partial payment, then settle → balance and reminders update", async () => {
  await page.goto(`${BASE}/finance/cards`);
  await page.getByRole("button", { name: "Record payment" }).first().click();
  await sheet(page).getByLabel("Amount paid").fill("10000");
  await submit(page, "Record payment");
  await page.goto(`${BASE}/finance/cards/${cardId}`);
  await page.getByText("remaining ₹20,000").waitFor();
  await page.getByText("Minimum covered · ₹20,000 left").waitFor();
  const { data: rem } = await admin.from("reminders").select("*").eq("source_id", statementId).eq("status", "active");
  assert.equal(rem.length, 1, "still one active reminder");
  assert.match(rem[0].detail, /^₹20,000 to pay \(₹10,000 of ₹30,000 already paid\) · minimum covered/);
  await page.goto(`${BASE}/inbox`);
  await page.getByText("₹20,000 to pay").waitFor();
  await page.screenshot({ path: `${SHOTS}/flow2-partial-inbox.png` });

  await page.goto(`${BASE}/finance/cards/${cardId}`);
  await page.getByRole("button", { name: "Record payment" }).first().click();
  const amt = sheet(page).getByLabel("Amount paid");
  assert.equal(await amt.inputValue(), "20000", "prefilled with the remaining amount");
  await submit(page, "Record payment");
  await page.getByText("Paid in full").waitFor();
  const { data: after } = await admin.from("reminders").select("status").eq("source_id", statementId);
  assert.deepEqual(after.map((r) => r.status), ["resolved"]);
  await cron();
  const { count } = await admin.from("reminders").select("id", { count: "exact", head: true }).eq("source_id", statementId).eq("status", "active");
  assert.equal(count, 0, "scheduler does not revive a paid bill");
  await page.goto(`${BASE}/inbox`);
  assert.equal(await page.getByText("E2E Card bill").count(), 0, "gone from inbox");
});

await step("Flow 3: JSR item To send → Waiting for client, then schedule a follow-up", async () => {
  await quickAdd(page, "JSR item");
  const s = sheet(page);
  await s.getByLabel("New client name").fill("E2E Client");
  await s.getByLabel("Deliverable").fill("Launch KV options");
  await s.getByLabel("What happens next").fill("Client to pick a route");
  await submit(page, "Add to JSR");
  const { data: it } = await admin.from("jsr_items").select("id, status").eq("owner_id", ownerId).single();
  itemId = it.id;
  assert.equal(it.status, "to_send");
  await page.goto(`${BASE}/work`);
  await page.getByRole("combobox", { name: "Status" }).first().selectOption("waiting_for_client");
  await page.waitForTimeout(1200);
  const { data: j1 } = await admin.from("jsr_items").select("*").eq("id", itemId).single();
  assert.equal(j1.status, "waiting_for_client");
  assert.equal(j1.next_owner, "client", "next move flips to the client");
  assert.equal(j1.waiting_since, today);
  await page.goto(`${BASE}/work/items/${itemId}`);
  await page.getByRole("button", { name: "Next follow-up" }).click();
  await sheet(page).getByLabel("Next follow-up date").fill(plus(today, 3));
  await submit(page, "Set follow-up");
  await page.getByText(/To Send → Waiting For Client/).waitFor();
  await page.getByText(/Next follow-up set for/).waitFor();
  const { data: rem } = await admin.from("reminders").select("*").eq("source_id", itemId).eq("stage", "follow_up").eq("status", "active");
  assert.equal(rem.length, 1);
  assert.equal(rem[0].remind_on, plus(today, 3));
  await page.screenshot({ path: `${SHOTS}/flow3-jsr-item.png`, fullPage: true });
});

await step("Flow 4: mark an invoice sent → expected once on the dashboard; receipt leaves only the remainder", async () => {
  await quickAdd(page, "Invoice");
  const s = sheet(page);
  await s.getByLabel("Invoice no.").fill("E2E-001");
  await s.getByLabel("Amount (before GST)").fill("1,00,000");
  await s.getByLabel("Status").selectOption("ready");
  await s.getByText("+ GST, TDS & notes").click();
  await s.getByLabel("TDS % expected").fill("2");
  await s.getByText("net cash expected ₹1,16,000").waitFor();
  await submit(page, "Save invoice");
  const { data: inv } = await admin.from("invoices").select("id").eq("owner_id", ownerId).single();
  invoiceId = inv.id;
  await page.goto(`${BASE}/`);
  const mini = (label) => page.locator("div.rounded-xl", { has: page.getByText(label, { exact: true }) }).locator("p").nth(1);
  assert.equal(await mini("Invoices expected").textContent(), "₹0", "unsent invoice is not expected cash");
  assert.equal(await mini("Not yet invoiced").textContent(), "₹1,16,000", "unsent invoice shows as not yet invoiced");
  await page.getByText("Send invoice E2E-001").waitFor(); // listed in Needs attention
  await page.getByRole("button", { name: "Mark sent" }).first().click();
  await page.waitForTimeout(1200);
  await page.reload();
  assert.equal(await mini("Invoices expected").textContent(), "₹1,16,000");
  assert.equal(await mini("Not yet invoiced").textContent(), "₹0", "no double counting once sent");
  const { data: ob } = await admin.from("v_obligations").select("*").eq("owner_id", ownerId).eq("source_type", "invoice");
  assert.equal(ob.length, 1, "invoice appears once in obligations");
  await page.screenshot({ path: `${SHOTS}/flow4-dashboard-sent.png`, fullPage: true });

  await page.goto(`${BASE}/work/invoices/${invoiceId}`);
  await page.getByRole("button", { name: "Record receipt" }).click();
  await sheet(page).getByLabel("Received in bank").fill("50000");
  await submit(page, "Record receipt");
  await page.getByText("Part-paid").first().waitFor();
  await page.goto(`${BASE}/`);
  assert.equal(await mini("Invoices expected").textContent(), "₹66,000", "only the remaining net amount is expected");
});

await step("Flow 5a: PWA manifest, icons, service worker and offline screen", async () => {
  const m = await (await fetch(`${BASE}/manifest.webmanifest`)).json();
  assert.equal(m.display, "standalone");
  assert.ok(m.icons.some((i) => i.sizes === "512x512" && i.purpose === "maskable"));
  for (const i of m.icons) assert.equal((await fetch(BASE + i.src)).status, 200);
  assert.equal((await fetch(`${BASE}/apple-touch-icon.png`)).status, 200);
  await page.goto(`${BASE}/`);
  const active = await page.evaluate(async () => { const r = await navigator.serviceWorker.ready; return !!r.active; });
  assert.ok(active, "service worker active");
  await page.reload(); // now controlled by the SW
  await page.goto(`${BASE}/finance`);
  const cached = await page.evaluate(async () => {
    const out = [];
    for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) out.push(new URL(r.url).pathname);
    return out;
  });
  const sensitive = cached.filter((p) => !(p === "/offline" || p.startsWith("/_next/static/") || p.startsWith("/icons/") || p === "/manifest.webmanifest"));
  assert.deepEqual(sensitive, [], "no pages or data in SW caches");
  await ctx.setOffline(true);
  await page.goto(`${BASE}/work`).catch(() => {});
  await page.getByText("You're offline").first().waitFor();
  await page.screenshot({ path: `${SHOTS}/flow5-offline.png` });
  await ctx.setOffline(false);
});

await step("Flow 5b: notifications — 'Send test notification' delivers to the subscribed device", async () => {
  const before = pushHits.length;
  await page.goto(`${BASE}/settings`);
  await page.getByRole("button", { name: "Send test notification" }).click();
  await page.getByText(/Test sent to 1 device/).waitFor();
  assert.equal(pushHits.length, before + 1);
});

await step("Flow 5c: another account cannot see or change the owner's records", async () => {
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p2 = await ctx2.newPage();
  await signIn(p2, OTHER);
  for (const url of [`/work/invoices/${invoiceId}`, `/work/items/${itemId}`, `/finance/cards/${cardId}`]) {
    const r = await p2.goto(BASE + url);
    assert.equal(r.status(), 404, `${url} must 404 for another account`);
  }
  await p2.goto(`${BASE}/finance?view=paid`);
  assert.equal(await p2.getByText("E2E Card").count(), 0);
  await p2.goto(`${BASE}/search?q=E2E`);
  await p2.getByText("No matches").waitFor();
  const csv = await (await p2.request.get(`${BASE}/api/export/csv?type=invoices`)).text();
  assert.ok(!csv.includes("E2E-001"), "CSV export is owner-scoped");
  // Direct database API access with the other user's token
  const anonClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  await anonClient.auth.signInWithPassword(OTHER);
  const { data: rows } = await anonClient.from("invoices").select("id");
  assert.equal(rows.length, 0, "REST select returns nothing");
  const { data: upd } = await anonClient.from("invoices").update({ amount: 1 }).eq("id", invoiceId).select();
  assert.equal(upd.length, 0, "REST update affects nothing");
  const { error: rpcErr } = await anonClient.rpc("record_invoice_receipt", { p_invoice: invoiceId, p_bank: 1 });
  assert.ok(rpcErr, "cannot record a receipt on the owner's invoice");
  const { error: insErr } = await anonClient.from("invoice_receipts").insert({ invoice_id: invoiceId, bank_amount: 1 });
  assert.ok(insErr, "cannot attach a receipt to the owner's invoice");
  const pub = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: anonRows, error: anonErr } = await pub.from("invoices").select("id");
  assert.ok(anonErr || anonRows.length === 0, "signed-out access returns nothing");
  const { data: still } = await admin.from("v_invoices").select("amount, net_expected").eq("id", invoiceId).single();
  assert.equal(Number(still.amount), 100000);
  assert.equal(Number(still.net_expected), 66000);
  const r = await fetch(`${BASE}/api/cron/reminders`, { headers: { authorization: "Bearer wrong" } });
  assert.equal(r.status, 401, "scheduler endpoint rejects a wrong secret");
  await ctx2.close();
});

await step("Screenshots: iPhone layout with demo data", async () => {
  const phone = await browser.newContext({ ...playwright.devices["iPhone 13"] });
  const p = await phone.newPage();
  await signIn(p, OTHER);
  await p.goto(`${BASE}/settings`);
  await p.getByRole("button", { name: "Load demo data" }).click();
  await p.waitForTimeout(1500);
  for (const [name, url] of [["home", "/"], ["finance", "/finance"], ["work", "/work"], ["invoices", "/work/invoices"], ["inbox", "/inbox"]]) {
    await p.goto(BASE + url);
    await p.waitForLoadState("networkidle");
    await p.screenshot({ path: `${SHOTS}/iphone-${name}.png`, fullPage: name === "home" });
  }
  await p.getByRole("button", { name: "Quick add" }).click();
  await p.screenshot({ path: `${SHOTS}/iphone-quick-add.png` });
  const desk = await browser.newContext({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 2 });
  const d = await desk.newPage();
  await signIn(d, OTHER);
  await d.screenshot({ path: `${SHOTS}/desktop-home.png`, fullPage: true });
  await d.goto(`${BASE}/work`);
  await d.screenshot({ path: `${SHOTS}/desktop-jsr.png` });
  await phone.close(); await desk.close();
});

await browser.close();
server.kill();
pushServer.close();
writeFileSync(`${SHOTS}/../e2e-results.json`, JSON.stringify(results, null, 2));
const failed = results.filter((r) => r[1] === "FAIL");
console.log(`\n${results.length - failed.length}/${results.length} steps passed`);
if (failed.length) { console.log("\n--- server log (tail) ---\n" + serverLog.slice(-3000)); process.exit(1); }
process.exit(0);
