// api/clone_speechify.js
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import fetch from 'node-fetch';
import { parse } from 'formidable';

export const config = {
  api: { bodyParser: false }
};

const API_KEY = "VmvqmOk0NoTKBdEmLiEI87WS-mMfvbd9Sj_Uq7OuhPM=";
const API_ENDPOINT = "https://api.sws.speechify.com/v1/voices";
const USERS_FILE = path.join(process.cwd(), 'users.json');
const VOICES_FILE = path.join(process.cwd(), 'voices.json');

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Only POST allowed' }), { status: 405 });
  }

  // Parse form-data
  const data = await new Promise((resolve, reject) => {
    const form = new parse.IncomingForm();
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });

  const username = data.fields.username;
  if (!username) return new Response(JSON.stringify({ ok: false, error: 'Not logged in' }), { status: 401 });

  let voiceName = (data.fields.voice_name || '').trim();
  if (!voiceName) voiceName = 'Voice_' + Math.random().toString(16).slice(2, 10);

  const audioFile = data.files.audio;
  if (!audioFile) return new Response(JSON.stringify({ ok: false, error: 'No audio uploaded' }), { status: 400 });

  const formData = new FormData();
  formData.append('name', voiceName);
  formData.append('gender', 'male');
  formData.append('consent', JSON.stringify({ fullName: username, email: `${username}@example.com` }));
  formData.append('sample', fs.createReadStream(audioFile.filepath), audioFile.originalFilename);

  // Call Speechify API
  const response = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}` },
    body: formData
  });
  const result = await response.json();

  if (response.ok && result.id) {
    // Persist to users.json
    const users = fs.existsSync(USERS_FILE) ? JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8')) : {};
    if (!users[username]) users[username] = {};
    if (!Array.isArray(users[username].voices)) users[username].voices = [];
    if (!users[username].voices.find(v => v.id === result.id)) {
      users[username].voices.push({ id: result.id, name: voiceName });
    }
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));

    // Persist to voices.json
    const voices = fs.existsSync(VOICES_FILE) ? JSON.parse(fs.readFileSync(VOICES_FILE, 'utf-8')) : [];
    if (!voices.find(v => v.id === result.id)) {
      voices.push({ id: result.id, name: voiceName, language: result.language || null, created_by: username, created_at: new Date().toISOString() });
      fs.writeFileSync(VOICES_FILE, JSON.stringify(voices, null, 2));
    }

    return new Response(JSON.stringify({
      ok: true,
      message: `Voice '${voiceName}' cloned successfully!`,
      voice: { id: result.id, name: voiceName },
      voice_name: voiceName
    }), { status: 200 });
  }

  return new Response(JSON.stringify({ ok: false, error: result.message || 'Clone failed', http: response.status, response: result }), { status: 500 });
}
