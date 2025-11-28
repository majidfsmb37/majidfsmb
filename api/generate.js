// api/generate.js
import fs from 'fs';
import path from 'path';

export const config = { runtime: 'edge' }; // optional edge runtime for faster response

const USERS_FILE = path.join(process.cwd(), 'users.json');
const API_KEYS_FILE = path.join(process.cwd(), 'apis.txt');
const KEY_INDEX_FILE = path.join(process.cwd(), 'key_index.txt');
const HISTORY_FILE = path.join(process.cwd(), 'history.json');

const SPEECHIFY_PRIMARY = "https://api.sws.speechify.com/v1/audio/stream";
const SPEECHIFY_BACKUP = "https://api.speechify.com/v1/audio/stream";
const CHUNK_LIMIT = 3000;
const CHUNK_RETRIES = 5;
const KEY_SWITCH_DELAY = 300; // milliseconds

async function loadKeys() {
  if (!fs.existsSync(API_KEYS_FILE)) return [];
  return fs.readFileSync(API_KEYS_FILE, 'utf-8').split('\n').map(k => k.trim()).filter(k => k);
}

async function sendRequest(url, key, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  return { body, status: res.status };
}

function cleanAudioBinary(body) {
  if (!body) return null;
  // detect ID3
  const id3Index = body.indexOf('ID3');
  if (id3Index !== -1) return body.slice(id3Index);
  // detect MP3 frame
  for (let i = 0; i < body.length - 1; i++) {
    if (body.charCodeAt(i) === 0xFF && (body.charCodeAt(i + 1) & 0xE0) === 0xE0) {
      return body.slice(i);
    }
  }
  try {
    const json = JSON.parse(body);
    for (let key of ['audio', 'audio_data', 'data', 'mp3', 'audioContent']) {
      if (json[key]) return Buffer.from(json[key], 'base64');
    }
  } catch { }
  // fallback base64 detection
  const match = body.match(/([A-Za-z0-9+\/=]{200,})/);
  if (match) return Buffer.from(match[1], 'base64');
  return null;
}

function stripId3(buffer) {
  if (!buffer || buffer.length < 10 || buffer.toString('utf8', 0, 3) !== 'ID3') return buffer;
  let size = 0;
  for (let i = 0; i < 4; i++) size = (size << 7) | (buffer[6 + i] & 0x7F);
  const tagLen = 10 + size;
  return tagLen < buffer.length ? buffer.slice(tagLen) : buffer;
}

function chunkText(text) {
  const chunks = [];
  let pos = 0;
  const len = text.length;
  while (pos < len) {
    let take = Math.min(CHUNK_LIMIT, len - pos);
    let chunk = text.slice(pos, pos + take);
    if (pos + take < len) {
      const lastDot = chunk.lastIndexOf('.');
      if (lastDot !== -1 && lastDot > take * 0.6) chunk = chunk.slice(0, lastDot + 1);
    }
    chunks.push(chunk.trim());
    pos += chunk.length;
  }
  return chunks;
}

export default async function handler(req) {
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Only POST allowed' }), { status: 405 });
  const data = await req.json();
  if (!data.text || !data.voice) return new Response(JSON.stringify({ error: 'Invalid input' }), { status: 400 });

  let text = data.text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  if (text.length < 2) return new Response(JSON.stringify({ error: 'Text too short' }), { status: 400 });

  const voice = data.voice;
  const title = (data.title || 'ultra-voice').replace(/[^a-zA-Z0-9_\-]/g, '_');
  const speed = parseFloat(data.speed || 1.0);
  const chars = text.length;

  // --- Users & Quota ---
  const users = fs.existsSync(USERS_FILE) ? JSON.parse(fs.readFileSync(USERS_FILE)) : {};
  const username = 'guest'; // modify if you have auth
  if (!users[username]) users[username] = { monthly_limit: 10000000, used_monthly: 0, used_today: 0 };
  const user = users[username];
  if (user.monthly_limit && user.used_monthly + chars > user.monthly_limit) {
    return new Response(JSON.stringify({ error: 'Monthly quota exhausted' }), { status: 400 });
  }

  // --- Load API keys ---
  let keys = await loadKeys();
  if (!keys.length) return new Response(JSON.stringify({ error: 'No API keys' }), { status: 500 });
  let keyIndex = fs.existsSync(KEY_INDEX_FILE) ? parseInt(fs.readFileSync(KEY_INDEX_FILE, 'utf-8')) : 0;

  const chunks = chunkText(text);
  let allAudio = Buffer.alloc(0);

  for (let i = 0; i < chunks.length; i++) {
    let chunk = chunks[i];
    if (!chunk) continue;

    let ok = false;
    for (let attempt = 0; attempt < CHUNK_RETRIES && !ok; attempt++) {
      const key = keys[keyIndex % keys.length];
      fs.writeFileSync(KEY_INDEX_FILE, keyIndex.toString());
      let res = await sendRequest(SPEECHIFY_PRIMARY, key, { voice_id: voice, input: chunk, audio_format: 'mp3', sample_rate: 44100, speed });
      if (!(res.status >= 200 && res.status < 300)) res = await sendRequest(SPEECHIFY_BACKUP, key, { voice_id: voice, input: chunk, audio_format: 'mp3', sample_rate: 44100, speed });
      const bin = cleanAudioBinary(res.body);
      if (bin && bin.length > 200) {
        if (i > 0) allAudio = Buffer.concat([allAudio, stripId3(bin)]);
        else allAudio = Buffer.concat([allAudio, bin]);
        ok = true;
        break;
      }
      keyIndex++;
      await new Promise(r => setTimeout(r, KEY_SWITCH_DELAY));
    }
    if (!ok) return new Response(JSON.stringify({ error: `Chunk ${i + 1} failed` }), { status: 500 });
  }

  if (!allAudio || allAudio.length < 10) return new Response(JSON.stringify({ error: 'No audio generated' }), { status: 500 });

  const audioBase64 = allAudio.toString('base64');

  // --- Update user usage ---
  user.used_today += chars;
  user.used_monthly += chars;
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));

  // --- Update history ---
  let history = fs.existsSync(HISTORY_FILE) ? JSON.parse(fs.readFileSync(HISTORY_FILE)) : [];
  history.push({ username, title, voice_name: voice, text, audio_data: audioBase64, filename: title + '.mp3', timestamp: Date.now() });
  history = history.slice(-100);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));

  return new Response(JSON.stringify({ progress: 100, audio_data: audioBase64, filename: title + '.mp3' }), { status: 200 });
}
