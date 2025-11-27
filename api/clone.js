import formidable from "formidable";
import fs from "fs";
import fetch from "node-fetch";

export const config = {
  api: {
    bodyParser: false,
    sizeLimit: "50mb", // Max upload size
  },
};

// Use a single API key from environment
const SPEECHIFY_API_KEY = process.env.SPEECHIFY_API_KEY;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  if (!SPEECHIFY_API_KEY) {
    return res.status(500).json({ ok: false, error: "No API key configured" });
  }

  try {
    // Parse multipart form (audio + optional voice_name)
    const form = formidable({ multiples: false });
    const { fields, files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => (err ? reject(err) : resolve({ fields, files })));
    });

    const voiceName = fields.voice_name?.trim() || `Voice_${Math.random().toString(16).slice(2, 10)}`;
    const audioFile = files.audio;

    if (!audioFile) {
      return res.status(400).json({ ok: false, error: "No audio uploaded" });
    }

    if (audioFile.size > 50 * 1024 * 1024) {
      return res.status(400).json({ ok: false, error: "File too large (max 50MB)" });
    }

    // Read the uploaded file buffer
    const fileBuffer = fs.readFileSync(audioFile.filepath);

    // Prepare form data for Speechify API
    const formData = new FormData();
    formData.append("name", voiceName);
    formData.append("gender", "male");
    formData.append("consent", JSON.stringify({ fullName: "User", email: "user@example.com" }));
    formData.append("sample", new Blob([fileBuffer]), audioFile.originalFilename);

    // Call Speechify voice clone API
    const response = await fetch("https://api.sws.speechify.com/v1/voices", {
      method: "POST",
      headers: { Authorization: `Bearer ${SPEECHIFY_API_KEY}` },
      body: formData,
    });

    const contentType = response.headers.get("content-type") || "";
    let data;

    if (contentType.includes("application/json")) {
      data = await response.json();
    } else {
      const text = await response.text();
      console.error("Non-JSON API response:", text);
      return res.status(500).json({ ok: false, error: "Unexpected API response", response: text });
    }

    if (!response.ok || !data.id) {
      return res.status(500).json({ ok: false, error: data.message || "Clone failed", response: data });
    }

    // Success response
    return res.status(200).json({
      ok: true,
      message: `Voice '${voiceName}' cloned successfully!`,
      voice: { id: data.id, name: data.display_name || voiceName },
      voice_name: voiceName,
    });
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ ok: false, error: "Server error", details: err.message });
  }
}
