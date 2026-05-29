import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, "data");
const memoryPath = path.join(dataDir, "memory.json");
const messagesPath = path.join(dataDir, "messages.json");

const app = express();
const port = process.env.PORT || 5000;
const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const allowedOrigins = [
  ...(process.env.CLIENT_ORIGIN || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  "http://localhost:5173",
  "http://127.0.0.1:5173"
];

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS blocked origin: ${origin}`));
    }
  })
);
app.use(express.json({ limit: "1mb" }));

async function readJson(filePath, fallback) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    if (error.code === "ENOENT") {
      await writeJson(filePath, fallback);
      return fallback;
    }
    throw error;
  }
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

function extractCandidateMemory(message) {
  const normalized = message.trim().replace(/\s+/g, " ");
  const patterns = [
    /(?:please\s+)?remember that (.+)$/i,
    /my name is ([a-z][a-z\s.'-]{1,60})$/i,
    /i like ([^.!?]{2,120})/i,
    /i prefer ([^.!?]{2,120})/i,
    /i am ([^.!?]{2,120})/i,
    /i'm ([^.!?]{2,120})/i
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match) continue;

    const fact = match[1].trim();
    if (!fact) continue;

    if (pattern.source.includes("my name is")) {
      return `The user's name is ${fact}.`;
    }

    return `The user said: ${fact}.`;
  }

  return null;
}

function buildPrompt({ memory, recentMessages, message }) {
  const facts = memory.facts.length
    ? memory.facts.map((fact) => `- ${fact}`).join("\n")
    : "- No saved personal facts yet.";

  const conversation = recentMessages.length
    ? recentMessages
        .slice(-12)
        .map((item) => `${item.role === "user" ? "User" : "Assistant"}: ${item.text}`)
        .join("\n")
    : "No previous messages.";

  return [
    "You are a warm, helpful English-only voice assistant.",
    "Answer general questions clearly and conversationally.",
    "Use saved memory when it helps, but do not invent personal facts.",
    "If the user asks you to remember something, acknowledge it naturally.",
    "",
    "Saved memory:",
    facts,
    "",
    "Recent conversation:",
    conversation,
    "",
    `Current user message: ${message}`
  ].join("\n");
}

async function askGemini(prompt) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY. Add it to backend/.env.");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 700
        }
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    const message = data?.error?.message || "Gemini request failed.";
    throw new Error(message);
  }

  return (
    data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text)
      .filter(Boolean)
      .join("\n")
      .trim() || "I could not generate a reply. Please try again."
  );
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/api/memory", async (req, res, next) => {
  try {
    const memory = await readJson(memoryPath, { facts: [] });
    res.json(memory);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/memory", async (req, res, next) => {
  try {
    const emptyMemory = { facts: [] };
    await writeJson(memoryPath, emptyMemory);
    res.json(emptyMemory);
  } catch (error) {
    next(error);
  }
});

app.post("/api/chat", async (req, res, next) => {
  try {
    const message = String(req.body?.message || "").trim();

    if (!message) {
      return res.status(400).json({ error: "Message is required." });
    }

    const memory = await readJson(memoryPath, { facts: [] });
    const messages = await readJson(messagesPath, []);
    const newFact = extractCandidateMemory(message);

    if (newFact && !memory.facts.some((fact) => fact.toLowerCase() === newFact.toLowerCase())) {
      memory.facts.push(newFact);
      await writeJson(memoryPath, memory);
    }

    const prompt = buildPrompt({ memory, recentMessages: messages, message });
    const reply = await askGemini(prompt);

    const updatedMessages = [
      ...messages,
      { role: "user", text: message, at: new Date().toISOString() },
      { role: "assistant", text: reply, at: new Date().toISOString() }
    ].slice(-40);

    await writeJson(messagesPath, updatedMessages);
    res.json({ reply, memory: memory.facts });
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: error.message || "Something went wrong." });
});

app.listen(port, () => {
  console.log(`Backend running at http://localhost:${port}`);
});

const keepAliveUrl = process.env.KEEP_ALIVE_URL;
const keepAliveIntervalMinutes = Number(process.env.KEEP_ALIVE_INTERVAL_MINUTES || 14);

if (keepAliveUrl) {
  const intervalMs = Math.max(1, keepAliveIntervalMinutes) * 60 * 1000;

  setInterval(async () => {
    try {
      const response = await fetch(keepAliveUrl);
      console.log(`Keep-alive ping: ${response.status}`);
    } catch (error) {
      console.error(`Keep-alive ping failed: ${error.message}`);
    }
  }, intervalMs);

  console.log(`Keep-alive enabled every ${keepAliveIntervalMinutes} minutes.`);
}
