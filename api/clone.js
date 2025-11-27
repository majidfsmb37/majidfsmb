import formidable from "formidable";
import fs from "fs";
import fetch from "node-fetch";

export const config = {
  api: {
    bodyParser: false, // must disable for file uploads
    sizeLimit: "50mb", // max upload size
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const form = formidable({ multiples: false });

    // Parse multipart form
    const { fields, files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve({ fields, files });
      });
    });

    // Validate input
    const voiceName = fields.voice_name?.trim() || "Voice_" + Date.now();
    if (!files.audio) {
      return res.status(400).json({ ok: false, error: "No audio uploaded" });
    }

    const file = files.audio;
    if (file.size > 50 * 1024 * 1024) {
      return res.status(400).json({ ok: false, error: "File too large (max 50MB)" });
    }

    // Read file
    const buffer = fs.readFileSync(file.filepath);

    // API key
    const apiKey = process.env.SPEECHIFY_API_KEY || "";
    if (!apiKey) {
      return res.status(500).json({ ok: false, error: "No API key configured" });
    }

    // Prepare form data
    const formData = new FormData();
    formData.append("name", voiceName);
    formData.append("gender", "male");
    formData.append("consent", JSON.stringify({
      fullName: "VercelUser",
      email: "user@example.com",
    }));
    formData.append("sample", new Blob([buffer]), file.originalFilename || "sample.mp3");

    // Call Speechify API
    const response = await fetch("https://api.sws.speechify.com/v1/voices", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      console.error("Non-JSON API response:", text);
      return res.status(500).json({
        ok: false,
        error: "Speechify API returned non-JSON response",
        apiResponse: text,
        httpStatus: response.status,
      });
    }

    if (!data.id) {
      return res.status(response.status).json({
        ok: false,
        error: data.message || "Clone failed",
        httpStatus: response.status,
      });
    }

    // Success
    return res.status(200).json({
      ok: true,
      message: `Voice '${voiceName}' cloned successfully!`,
      voice: { id: data.id, name: data.display_name || voiceName },
      voice_name: voiceName,
    });

  } catch (err) {
    console.error("Clone error:", err);
    return res.status(500).json({ ok: false, error: "Server error: " + err.message });
  }
}
