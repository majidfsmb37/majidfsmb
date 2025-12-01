import fs from "fs";
import path from "path";

export const config = {
  runtime: "nodejs"
};

// ---------- PATHS ----------
const ROOT = process.cwd();
const DATA = path.join(ROOT, "data");

const USERS_FILE = path.join(DATA, "users.json");
const HISTORY_FILE = path.join(DATA, "history.json");
const API_KEYS_FILE = path.join(DATA, "apis.txt");
const KEY_INDEX_FILE = path.join(DATA, "key_index.txt");

// ---------- SPEECHIFY ----------
const API_PRIMARY = "https://api.sws.speechify.com/v1/audio/stream";
const API_BACKUP  = "https://api.speechify.com/v1/audio/stream";

const CHUNK_SIZE = 3000;
const RETRIES = 5;

// ---------- HELPERS ----------
function ensureFile(file, defaultData) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(defaultData, null, 2));
    return defaultData;
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function chunkText(text) {
  const out = [];
  let i = 0;
  while (i < text.length) {
    let cut = Math.min(i + CHUNK_SIZE, text.length);
    out.push(text.slice(i, cut));
    i = cut;
  }
  return out;
}

async function ttsCall(url, key, text, voice, speed) {
  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      input: text,
      voice_id: voice,
      audio_format: "mp3",
      sample_rate: 44100,
      speed
    })
  });

  if (!r.ok) throw new Error("API failed");
  return Buffer.from(await r.arrayBuffer());
}

// ---------- HANDLER ----------
export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405 });
  }

  fs.mkdirSync(DATA, { recursive: true });

  const { text, voice, title = "speech", speed = 1 } = await req.json();

  if (!text || !voice) {
    return new Response(JSON.stringify({ error: "Invalid input" }), { status: 400 });
  }

  const users = ensureFile(USERS_FILE, {});
  const history = ensureFile(HISTORY_FILE, []);

  const keys = fs.existsSync(API_KEYS_FILE)
    ? fs.readFileSync(API_KEYS_FILE, "utf8").split(/\r?\n/).filter(Boolean)
    : [];

  if (!keys.length) {
    return new Response(JSON.stringify({ error: "No API keys" }), { status: 500 });
  }

  let keyIndex = fs.existsSync(KEY_INDEX_FILE)
    ? Number(fs.readFileSync(KEY_INDEX_FILE, "utf8"))
    : 0;

  const chunks = chunkText(text);
  let audio = Buffer.alloc(0);

  for (const part of chunks) {
    let done = false;

    for (let i = 0; i < RETRIES && !done; i++) {
      const key = keys[keyIndex % keys.length];
      try {
        const buf =
          await ttsCall(API_PRIMARY, key, part, voice, speed)
            .catch(() => ttsCall(API_BACKUP, key, part, voice, speed));

        audio = Buffer.concat([audio, buf]);
        done = true;
      } catch {
        keyIndex++;
        fs.writeFileSync(KEY_INDEX_FILE, String(keyIndex));
      }
    }

    if (!done) {
      return new Response(JSON.stringify({ error: "Chunk failed" }), { status: 500 });
    }
  }

  const base64 = audio.toString("base64");

  history.push({
    title,
    voice,
    chars: text.length,
    time: Date.now()
  });

  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history.slice(-100), null, 2));

  return new Response(JSON.stringify({
    success: true,
    audio_data: base64,
    filename: `${title}.mp3`
  }), { status: 200 });
}
