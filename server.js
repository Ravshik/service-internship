import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

const port = Number(process.env.PORT || 3000);
const dataDir = process.env.DATA_DIR || path.join(__dirname, "data");
const dbPath = path.join(dataDir, "db.json");
const telegramToken = process.env.TELEGRAM_BOT_TOKEN || "";
const telegramBotUsername = (process.env.TELEGRAM_BOT_USERNAME || "").replace(/^@/, "");
let telegramOffset = 0;

app.use(express.json({ limit: "1mb" }));

function seedState() {
  return {
    shifts: [
      { id: 1, date: "2026-06-26", seats: 3, status: "open" },
      { id: 2, date: "2026-06-28", seats: 4, status: "open" },
      { id: 3, date: "2026-06-30", seats: 2, status: "open" }
    ],
    applications: [
      {
        id: 101,
        shiftId: 2,
        name: "Петрова Алина",
        training: "passed",
        attempt: "first",
        experience: "yes",
        limits: "Могу после 14:00, центр подходит.",
        status: "new",
        recruiterComment: "",
        candidateReport: false,
        mentorReport: false,
        createdAt: "2026-06-25"
      },
      {
        id: 102,
        shiftId: 1,
        name: "Смирнов Никита",
        training: "not_passed",
        attempt: "repeat",
        experience: "yes",
        limits: "Без ограничений.",
        status: "confirmed",
        recruiterComment: "Подтвержден на 26.06.",
        candidateReport: true,
        mentorReport: false,
        createdAt: "2026-06-25"
      },
      {
        id: 103,
        shiftId: null,
        name: "Козлова Мария",
        training: "passed",
        attempt: "first",
        experience: "no",
        limits: "Ограничений нет, готова на ближайшую дату.",
        status: "queue",
        recruiterComment: "",
        candidateReport: false,
        mentorReport: false,
        createdAt: "2026-06-25"
      }
    ],
    inviteGroups: []
  };
}

async function ensureDb() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(dbPath);
  } catch {
    await writeState(seedState());
  }
}

async function readState() {
  await ensureDb();
  let state;
  try {
    const raw = await fs.readFile(dbPath, "utf8");
    state = JSON.parse(raw);
  } catch (error) {
    const backupPath = path.join(dataDir, `db.corrupt-${Date.now()}.json`);
    try {
      await fs.rename(dbPath, backupPath);
      console.error(`State file was corrupted. Moved it to ${backupPath}`);
    } catch (renameError) {
      console.error("State file was corrupted and could not be moved", renameError);
    }
    state = await writeState(seedState());
  }
  return {
    shifts: Array.isArray(state.shifts) ? state.shifts : [],
    applications: Array.isArray(state.applications) ? state.applications : [],
    inviteGroups: Array.isArray(state.inviteGroups) ? state.inviteGroups : []
  };
}

async function writeState(state) {
  const cleanState = {
    shifts: Array.isArray(state.shifts) ? state.shifts : [],
    applications: Array.isArray(state.applications) ? state.applications : [],
    inviteGroups: Array.isArray(state.inviteGroups) ? state.inviteGroups : []
  };
  await fs.mkdir(dataDir, { recursive: true });
  const tempPath = `${dbPath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(cleanState, null, 2), "utf8");
  await fs.rename(tempPath, dbPath);
  return cleanState;
}

function injectState(html, state) {
  const payload = JSON.stringify(state).replace(/</g, "\\u003c");
  const botPayload = JSON.stringify(telegramBotUsername).replace(/</g, "\\u003c");
  return html.replace("</head>", `<script>window.__SERVER_STATE__=${payload};window.__TELEGRAM_BOT_USERNAME__=${botPayload};</script>\n</head>`);
}

async function telegramApi(method, payload) {
  if (!telegramToken) return { ok: false, skipped: "telegram_token_missing" };
  const response = await fetch(`https://api.telegram.org/bot${telegramToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!data.ok) {
    const message = data.description || "telegram_error";
    throw new Error(message);
  }
  return data;
}

async function sendTelegramMessage(chatId, text) {
  if (!chatId || !text) return { ok: false, skipped: "chat_or_text_missing" };
  return telegramApi("sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true
  });
}

async function registerTelegramChat(code, chatId) {
  if (!code || !chatId) return false;
  const state = await readState();
  let registered = false;
  state.applications = state.applications.map(application => {
    if (application.telegramCode !== code) return application;
    registered = true;
    return { ...application, telegramChatId: String(chatId) };
  });
  if (registered) await writeState(state);
  return registered;
}

async function pollTelegram() {
  if (!telegramToken) return;
  try {
    const data = await telegramApi("getUpdates", {
      offset: telegramOffset,
      timeout: 0,
      allowed_updates: ["message"]
    });
    for (const update of data.result || []) {
      telegramOffset = Math.max(telegramOffset, update.update_id + 1);
      const text = update.message?.text || "";
      const chatId = update.message?.chat?.id;
      const match = text.match(/^\/start\s+([A-Za-z0-9_-]+)/);
      if (!match || !chatId) continue;
      const registered = await registerTelegramChat(match[1], chatId);
      await sendTelegramMessage(
        chatId,
        registered
          ? "Telegram подключен. Теперь сюда будут приходить уведомления по стажировке."
          : "Не нашел вашу заявку. Сначала заполните данные и выберите дату в форме записи."
      );
    }
  } catch (error) {
    console.error("Telegram polling failed", error);
  }
}

app.get("/health", (_req, res) => {
  res.type("text").send("ok\n");
});

app.get("/api/state", async (_req, res, next) => {
  try {
    res.json(await readState());
  } catch (error) {
    next(error);
  }
});

app.post("/api/state", async (req, res, next) => {
  try {
    res.json(await writeState(req.body));
  } catch (error) {
    next(error);
  }
});

app.post("/api/notify", async (req, res, next) => {
  try {
    const { applicationId, text } = req.body || {};
    const state = await readState();
    const application = state.applications.find(item => String(item.id) === String(applicationId));
    if (!application?.telegramChatId) {
      res.json({ ok: false, skipped: "telegram_chat_missing" });
      return;
    }
    await sendTelegramMessage(application.telegramChatId, text);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get(["/", "/index.html"], async (_req, res, next) => {
  try {
    const [html, state] = await Promise.all([
      fs.readFile(path.join(__dirname, "index.html"), "utf8"),
      readState()
    ]);
    res.type("html").send(injectState(html, state));
  } catch (error) {
    next(error);
  }
});

app.use(express.static(__dirname));

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: "server_error" });
});

app.listen(port, "0.0.0.0", async () => {
  await ensureDb();
  if (telegramToken) {
    pollTelegram();
    setInterval(pollTelegram, 5000);
  }
  console.log(`Service internship booking is listening on ${port}`);
});
