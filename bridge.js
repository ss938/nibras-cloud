// جسر نبراس — نسخة سحابية. نفس منطق النسخة المحلية، والإعداد من متغيرات البيئة.
// لا أسرار في هذا الملف إطلاقاً.
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const DIR = __dirname;
const CLI = process.env.CLI_PATH || "opencode";
const PROJECT_DIR = process.env.PROJECT_DIR || "/app";
const BOT_TOKEN = process.env.BOT_TOKEN || "";
const ALLOWED = (process.env.ALLOWED_USERS || "").split(",").map((s) => s.trim()).filter(Boolean);
const MODEL = { providerID: "zenfree", id: "bunny" };
const POLL = parseInt(process.env.POLL_SECONDS || "30", 10);
const WAIT = parseInt(process.env.WAIT_TIMEOUT_MS || "300000", 10);
const OFFSET_FILE = path.join(DIR, "bridge-offset.txt");
const SESSIONS_FILE = path.join(DIR, "bridge-sessions.json");

const log = (m) => console.log(JSON.stringify({ t: new Date().toISOString(), m }));
const loadSessions = () => { try { return JSON.parse(fs.readFileSync(SESSIONS_FILE, "utf8")); } catch { return {}; } };
const saveSessions = (s) => fs.writeFileSync(SESSIONS_FILE, JSON.stringify(s, null, 2));
const loadOffset = () => { try { return parseInt(fs.readFileSync(OFFSET_FILE, "utf8").trim(), 10) || 0; } catch { return 0; } };
const saveOffset = (o) => fs.writeFileSync(OFFSET_FILE, String(o));
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function tg(method, params = {}) {
  const r = await fetch("https://api.telegram.org/bot" + BOT_TOKEN + "/" + method, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const j = await r.json();
  if (!j.ok) throw new Error("Telegram " + method + ": " + j.description);
  return j.result;
}

function oc(method, apiPath, data, timeoutMs) {
  const args = ["api", method, apiPath];
  if (data !== undefined) args.push("--data", JSON.stringify(data));
  const out = execFileSync(CLI, args, { timeout: timeoutMs || 60000, maxBuffer: 8 * 1024 * 1024, encoding: "utf8", cwd: PROJECT_DIR });
  return out.trim() ? JSON.parse(out) : {};
}

function getSession(userId) {
  const sessions = loadSessions();
  if (sessions[userId]) return sessions[userId];
  const s = oc("post", "/api/session", {
    agent: "nibras", location: { directory: PROJECT_DIR }, model: MODEL, title: "tg-" + userId,
  });
  sessions[userId] = s.data.id;
  saveSessions(sessions);
  log("new session for " + userId);
  return s.data.id;
}

async function askNibras(sessionId, text, chatId) {
  const before = ((oc("get", "/api/session/" + sessionId + "/message", undefined, 30000).data) || []).length;
  oc("post", "/api/session/" + sessionId + "/prompt", { text }, 60000);
  const t0 = Date.now();
  let stable = 0, lastId = null, best = null;
  for (;;) {
    if (Date.now() - t0 > WAIT) break;
    if (chatId) tg("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});
    await delay(5000);
    let msgs = [];
    try { msgs = (oc("get", "/api/session/" + sessionId + "/message", undefined, 30000).data) || []; }
    catch { continue; }
    if (!msgs.length) continue;
    const fresh = msgs.slice(before);
    const errs = fresh.filter((m) => m.type === "assistant" && m.finish === "error");
    if (errs.length) { log("model error: " + JSON.stringify(errs[errs.length - 1].error || {}).slice(0, 300)); return "multiple"; } // إشارة للجسر ليرد برسالة تعثر عامة
    const stops = fresh.filter((m) => m.type === "assistant" && m.finish === "stop" && m.content && m.content.some((c) => c.text && c.text.trim()));
    if (stops.length) {
      best = stops[stops.length - 1].content.filter((c) => c.text).map((c) => c.text).join("\n").trim().slice(0, 3900);
      const newestId = msgs[msgs.length - 1].id;
      if (newestId === lastId) { stable++; if (stable >= 2 && best) return best; }
      else { stable = 0; lastId = newestId; }
    }
  }
  return best || "multiple";
}

async function handleUpdate(u) {
  const msg = u.message;
  if (!msg || !msg.text) return;
  const uid = String(msg.from.id);
  if (!ALLOWED.includes(uid)) { log("ignored stranger " + uid); return; }
  const chatId = msg.chat.id;
  try {
    if (msg.text === "/new") {
      const sessions = loadSessions(); delete sessions[uid]; saveSessions(sessions);
      await tg("sendMessage", { chat_id: chatId, text: "new session started" });
      return;
    }
    let reply = await askNibras(getSession(uid), msg.text, chatId);
    if (reply === "multiple") reply = "النموذج متعثر الآن — جرّب بعد دقيقة.";
    await tg("sendMessage", { chat_id: chatId, text: reply });
  } catch (e) { log("error: " + e.message); }
}

async function waitForServe() {
  const url = "http://127.0.0.1:" + (process.env.PORT || "10000") + "/";
  for (let i = 0; i < 24; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (r.ok) { log("serve is up"); return; }
    } catch {}
    await delay(5000);
  }
  log("serve not responding yet — continuing anyway");
}

async function main() {
  if (!BOT_TOKEN) { console.error("BOT_TOKEN missing"); process.exit(1); }
  await waitForServe();
  const me = await tg("getMe");
  log("connected as @" + me.username);
  let offset = loadOffset();
  if (!offset) {
    const old = await tg("getUpdates", { timeout: 0 });
    if (old.length) offset = old[old.length - 1].update_id + 1;
    saveOffset(offset);
  }
  for (;;) {
    try {
      const updates = await tg("getUpdates", { offset, timeout: POLL });
      for (const u of updates) { offset = u.update_id + 1; saveOffset(offset); await handleUpdate(u); }
    } catch (e) { log("transient: " + e.message); await delay(5000); }
  }
}
main();
