import fs from "fs";
import path from "path";
import formidable from "formidable";

const USERS_FILE = path.join(process.cwd(), "users.json");
const VOICES_FILE = path.join(process.cwd(), "voices.json");
const VOICES_DIR = path.join(process.cwd(), "voices");

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const API_ENDPOINT = "https://api.sws.speechify.com/v1/voices";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const apiKey = process.env.SPEECHIFY_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ ok: false, error: "API key not configured" });
    }

    // Parse form-data
    const form = formidable({ multiples: false, maxFileSize: MAX_FILE_SIZE });
    const data = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) return reject(err);
        resolve({ fields, files });
      });
    });

    const username = data.fields.username;
    if (!username) return res.status(401).json({ ok: false, error: "Not logged in" });

    // Ensure storage files/directories exist
    if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify({}, null, 2));
    if (!fs.existsSync(VOICES_FILE)) fs.writeFileSync(VOICES_FILE, JSON.stringify([], null, 2));
    if (!fs.existsSync(VOICES_DIR)) fs.mkdirSync(VOICES_DIR, { recursive: true });

    const users = JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
    if (!users[username]) return res.status(400).json({ ok: false, error: "User not found" });

    const voiceName = data.fields.voice_name?.trim() || "Voice_" + Math.random().toString(16).slice(2, 10);

    const audioFile = data.files.audio;
    if (!audioFile || !audioFile.filepath) return res.status(400).json({ ok: false, error: "No audio uploaded" });
    if (audioFile.size > MAX_FILE_SIZE) return res.status(400).json({ ok: false, error: "File too large (max 50MB)" });

    // Prepare form data for Speechify API
    const FormData = (await import("form-data")).default;
    const formData = new FormData();
    formData.append("name", voiceName);
    formData.append("gender", "male");
    formData.append("consent", JSON.stringify({ fullName: username, email: `${username}@example.com` }));
    formData.append("sample", fs.createReadStream(audioFile.filepath), audioFile.originalFilename);

    // Send request to Speechify API
    const fetch = (await import("node-fetch")).default;
    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    const json = await response.json();
    if (!response.ok || !json.id) {
      return res.status(500).json({ ok: false, error: json.message || "Clone failed", response: json });
    }

    const voice_id = json.id;
    const voice_name = json.display_name || voiceName;

    // Save voice to user
    if (!Array.isArray(users[username].voices)) users[username].voices = [];
    if (!users[username].voices.find(v => v.id === voice_id)) {
      users[username].voices.push({ id: voice_id, name: voice_name });
    }

    // Remove from removed_voices if exists
    if (Array.isArray(users[username].removed_voices)) {
      users[username].removed_voices = users[username].removed_voices.filter(v => v !== voice_id);
    }

    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));

    // Save to global voices.json
    const voices = JSON.parse(fs.readFileSync(VOICES_FILE, "utf-8"));
    if (!voices.find(v => v.id === voice_id)) {
      voices.push({
        id: voice_id,
        name: voice_name,
        language: json.language || null,
        created_by: username,
        created_at: new Date().toISOString(),
      });
      fs.writeFileSync(VOICES_FILE, JSON.stringify(voices, null, 2));
    }

    return res.status(200).json({
      ok: true,
      message: `Voice '${voice_name}' cloned successfully!`,
      voice: { id: voice_id, name: voice_name },
      voice_name,
    });

  } catch (err) {
    console.error("Clone error:", err);
    return res.status(500).json({ ok: false, error: "Server error: " + err.message });
  }
}
