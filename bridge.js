// جسر نبراس — نسخة سحابية. نفس منطق النسخة المحلية، والإعداد من متغيرات البيئة.
// لا أسرار في هذا الملف إطلاقاً.
const fs = require("fs");
const path = require("path");

const DIR = __dirname;
const PROJECT_DIR = process.env.PROJECT_DIR || "/app";
const BOT_TOKEN = process.env.BOT_TOKEN || "";
const ALLOWED = (process.env.ALLOWED_USERS || "").split(",").map((s) => s.trim()).filter(Boolean);
const MODEL = {
  providerID: process.env.MODEL_PROVIDER || "opencode",
  id: process.env.MODEL_ID || "muse-spark-1.3-contributor-free",
};
const POLL = parseInt(process.env.POLL_SECONDS || "30", 10);
const WAIT = parseInt(process.env.WAIT_TIMEOUT_MS || "300000", 10);
const SERVER_URL = "http://127.0.0.1:" + (process.env.PORT || "10000");
const SERVER_PASS = process.env.OPENCODE_SERVER_PASSWORD || "nibras-internal-pass";
const AUTH_HEADER = "Basic " + Buffer.from("opencode:" + SERVER_PASS).toString("base64");
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

async function oc(method, apiPath, data, timeoutMs) {
  const url = SERVER_URL + apiPath;
  const headers = {
    "Authorization": AUTH_HEADER,
    "Content-Type": "application/json",
  };
  const opts = {
    method: method.toUpperCase(),
    headers,
    signal: AbortSignal.timeout(timeoutMs || 60000),
  };
  if (data !== undefined) opts.body = JSON.stringify(data);
  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenCode ${method} ${apiPath} HTTP ${res.status}: ${text}`);
  }
  const text = await res.text();
  return text.trim() ? JSON.parse(text) : {};
}

async function getSession(userId) {
  const sessions = loadSessions();
  if (sessions[userId]) return sessions[userId];
  const s = await oc("post", "/api/session", {
    agent: "nibras", location: { directory: PROJECT_DIR }, model: MODEL, title: "tg-" + userId,
  });
  sessions[userId] = s.data.id;
  saveSessions(sessions);
  log("new session for " + userId + ": " + s.data.id);
  return s.data.id;
}

async function askNibras(sessionId, text, chatId) {
  const getMsgs = async () => {
    try {
      const res = await oc("get", "/api/session/" + sessionId + "/message", undefined, 30000);
      return res.data || [];
    } catch {
      return [];
    }
  };
  for (let attempt = 1; attempt <= 3; attempt++) {
    const msgsBefore = await getMsgs();
    const before = msgsBefore.length;
    await oc("post", "/api/session/" + sessionId + "/prompt", { text }, 60000);
    const t0 = Date.now();
    let stable = 0, lastId = null, best = null, quota = false;
    for (;;) {
      if (Date.now() - t0 > WAIT) break;
      if (chatId) tg("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});
      await delay(5000);
      const msgs = await getMsgs();
      if (!msgs.length) continue;
      const fresh = msgs.slice(before);
      const errs = fresh.filter((m) => m.type === "assistant" && m.finish === "error");
      if (errs.length) {
        const e = errs[errs.length - 1].error || {};
        log("model error: " + JSON.stringify(e).slice(0, 300));
        if (e.status === 429 && attempt < 3) { quota = true; break; }
        return "multiple"; // إشارة للجسر ليرد برسالة تعثر عامة
      }
      const stops = fresh.filter((m) => m.type === "assistant" && m.finish === "stop" && m.content && m.content.some((c) => c.text && c.text.trim()));
      if (stops.length) {
        best = stops[stops.length - 1].content.filter((c) => c.text).map((c) => c.text).join("\n").trim().slice(0, 3900);
        const newestId = msgs[msgs.length - 1].id;
        if (newestId === lastId) { stable++; if (stable >= 2 && best) return best; }
        else { stable = 0; lastId = newestId; }
      }
    }
    if (quota) { log("quota 429 — retry " + attempt + "/3 after 60s"); await delay(60000); continue; }
    return best || "multiple";
  }
  return "multiple";
}

async function handleUpdate(u) {
  const msg = u.message;
  if (!msg || !msg.text) return;
  const uid = String(msg.from.id);
  log("msg from " + uid + ": " + (msg.text || "?").slice(0, 80));
  if (!ALLOWED.includes(uid)) { log("ignored stranger " + uid); return; }
  const chatId = msg.chat.id;
  try {
    if (msg.text === "/new") {
      const sessions = loadSessions(); delete sessions[uid]; saveSessions(sessions);
      await tg("sendMessage", { chat_id: chatId, text: "بدأت جلسة جديدة — ذاكرتك الدائمة محفوظة." });
      return;
    }
    const sessionId = await getSession(uid);
    let reply = await askNibras(sessionId, msg.text, chatId);
    if (reply === "multiple") reply = "النموذج متعثر الآن — جرّب بعد دقيقة.";
    await tg("sendMessage", { chat_id: chatId, text: reply });
  } catch (e) {
    log("error: " + e.message);
    await tg("sendMessage", { chat_id: chatId, text: "حدث خطأ غير متوقع أثناء معالجة رسالتك." }).catch(() => {});
  }
}

async function waitForServe() {
  const url = SERVER_URL + "/api/session";
  for (let i = 0; i < 24; i++) {
    try {
      const r = await fetch(url, {
        headers: { "Authorization": AUTH_HEADER },
        signal: AbortSignal.timeout(5000),
      });
      if (r.ok) { log("serve is up and authenticated"); return; }
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
  let backlog = [];
  if (!offset) {
    const old = await tg("getUpdates", { timeout: 0 });
    if (old.length) {
      offset = old[old.length - 1].update_id + 1;
      // بعد النوم/إعادة النشر: عالج حديث آخر 30 دقيقة بدل رميه، وتجاهل الأقدم
      const now = Date.now() / 1000;
      backlog = old.filter((u) => u.message && u.message.text && now - (u.message.date || 0) < 1800);
      if (old.length !== backlog.length) log("skipped " + (old.length - backlog.length) + " stale messages");
    }
    saveOffset(offset);
  }
  for (const u of backlog) { await handleUpdate(u); }
  for (;;) {
    try {
      const updates = await tg("getUpdates", { offset, timeout: POLL });
      for (const u of updates) { offset = u.update_id + 1; saveOffset(offset); await handleUpdate(u); }
    } catch (e) { log("transient: " + e.message); await delay(5000); }
  }
}
main().catch((err) => {
  console.error(JSON.stringify({ t: new Date().toISOString(), fatal: err.message, stack: err.stack }));
  process.exit(1);
});
