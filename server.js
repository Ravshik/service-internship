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
    ]
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
  const raw = await fs.readFile(dbPath, "utf8");
  const state = JSON.parse(raw);
  return {
    shifts: Array.isArray(state.shifts) ? state.shifts : [],
    applications: Array.isArray(state.applications) ? state.applications : []
  };
}

async function writeState(state) {
  const cleanState = {
    shifts: Array.isArray(state.shifts) ? state.shifts : [],
    applications: Array.isArray(state.applications) ? state.applications : []
  };
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(dbPath, JSON.stringify(cleanState, null, 2), "utf8");
  return cleanState;
}

function injectState(html, state) {
  const payload = JSON.stringify(state).replace(/</g, "\\u003c");
  return html.replace("</head>", `<script>window.__SERVER_STATE__=${payload};</script>\n</head>`);
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

app.get("/", async (_req, res, next) => {
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
  console.log(`Service internship booking is listening on ${port}`);
});
