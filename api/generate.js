export const config = {
  runtime: "edge"
};

const SPEECHIFY_PRIMARY = "https://api.sws.speechify.com/v1/audio/stream";
const SPEECHIFY_BACKUP  = "https://api.speechify.com/v1/audio/stream";

const CHUNK_LIMIT = 3000;
const RETRIES = 3;

function chunkText(text) {
  const parts = [];
  let i = 0;
  while (i < text.length) {
    parts.push(text.slice(i, i + CHUNK_LIMIT));
    i += CHUNK_LIMIT;
  }
  return parts;
}

function extractAudio(body) {
  // if binary mp3 starts
  for (let i = 0; i < body.length - 2; i++) {
    if (body.charCodeAt(i) === 0xff && (body.charCodeAt(i + 1) & 0xe0) === 0xe0) {
      return body.slice(i);
    }
  }

  // base64 JSON fallback
  try {
    const j = JSON.parse(body);
    if (j.audio) return Buffer.from(j.audio, "base64");
    if (j.audio_data) return Buffer.from(j.audio_data, "base64");
  } catch {}

  return null;
}

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405 });
  }

  let data;
  try {
    data = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const text  = (data.text || "").trim();
  const voice = data.voice;

  if (!text || !voice) {
    return new Response(JSON.stringify({ error: "Missing text or voice" }), { status: 400 });
  }

  const KEYS = process.env.SPEECHIFY_KEYS?.split(",").map(k => k.trim()).filter(Boolean);
  if (!KEYS || KEYS.length === 0) {
    return new Response(JSON.stringify({ error: "No API keys configured" }), { status: 500 });
  }

  const chunks = chunkText(text);
  let fullAudio = new Uint8Array();

  for (let i = 0; i < chunks.length; i++) {
    let success = false;

    for (let r = 0; r < RETRIES && !success; r++) {
      const key = KEYS[(i + r) % KEYS.length];

      try {
        let res = await fetch(SPEECHIFY_PRIMARY, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${key}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            voice_id: voice,
            input: chunks[i],
            audio_format: "mp3",
            sample_rate: 44100
          })
        });

        if (!res.ok) {
          res = await fetch(SPEECHIFY_BACKUP, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${key}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              voice_id: voice,
              input: chunks[i],
              audio_format: "mp3",
              sample_rate: 44100
            })
          });
        }

        const body = await res.text();
        const audio = extractAudio(body);

        if (!audio || audio.length < 500) throw "Audio empty";

        const merged = new Uint8Array(fullAudio.length + audio.length);
        merged.set(fullAudio);
        merged.set(audio, fullAudio.length);
        fullAudio = merged;

        success = true;
      } catch (e) {
        if (r === RETRIES - 1) {
          return new Response(JSON.stringify({
            error: "Speechify failed",
            detail: String(e)
          }), { status: 500 });
        }
      }
    }
  }

  return new Response(JSON.stringify({
    success: true,
    audio_base64: Buffer.from(fullAudio).toString("base64"),
    filename: "output.mp3"
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
