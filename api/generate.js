const https = require('https');
const http = require('http');

const ENDPOINT_PRIMARY = "https://api.sws.speechify.com/v1/audio/stream";
const ENDPOINT_BACKUP  = "https://api.speechify.com/v1/audio/stream";
const CHUNK_CHAR_LIMIT = 2000;
const REQUEST_TIMEOUT = 50000;
const MAX_PARALLEL_CHUNKS = 20;

function makeRequest(url, options, postData) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const protocol = urlObj.protocol === 'https:' ? https : http;

    const req = protocol.request(url, options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          body: Buffer.concat(chunks)
        });
      });
    });

    req.on('error', reject);
    req.setTimeout(REQUEST_TIMEOUT, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (postData) req.write(postData);
    req.end();
  });
}

function chunkText(text) {
  const chunks = [];
  let pos = 0;

  while (pos < text.length) {
    let end = Math.min(pos + CHUNK_CHAR_LIMIT, text.length);

    if (end < text.length) {
      const lastPeriod = text.lastIndexOf('.', end);
      if (lastPeriod > pos && lastPeriod > end * 0.6) {
        end = lastPeriod + 1;
      }
    }

    chunks.push(text.substring(pos, end).trim());
    pos = end;
  }

  return chunks;
}

function stripId3(buffer) {
  if (buffer.length < 10 || buffer.toString('utf8', 0, 3) !== 'ID3') {
    return buffer;
  }

  let size = 0;
  for (let i = 0; i < 4; i++) {
    size = (size << 7) | (buffer[6 + i] & 0x7F);
  }

  const tagLen = 10 + size;
  return tagLen < buffer.length ? buffer.slice(tagLen) : buffer;
}

function getApiKeys() {
  const raw = process.env.SPEECHIFY_API_KEYS;
  if (!raw) return [];

  return raw
    .split(/\r?\n/)        // ✅ newline split (MAIN FIX)
    .map(k => k.trim())    // ✅ remove spaces
    .filter(Boolean);      // ✅ remove empty lines
}

async function processChunk(chunkText, voice, speed, apiKeys, keyIndex) {
  const maxAttempts = 3;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const apiKey = apiKeys[(keyIndex + attempt) % apiKeys.length];

    const payload = JSON.stringify({
      voice_id: voice,
      input: chunkText,
      audio_format: "mp3",
      sample_rate: 44100,
      speed: speed
    });

    const options = {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`, // ✅ clean single-line key
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    try {
      let response = await makeRequest(ENDPOINT_PRIMARY, options, payload);

      if (response.statusCode < 200 || response.statusCode >= 300) {
        response = await makeRequest(ENDPOINT_BACKUP, options, payload);
      }

      if (response.statusCode >= 200 && response.statusCode < 300 && response.body.length > 1000) {
        return response.body;
      }
    } catch (err) {
      if (attempt === maxAttempts - 1) throw err;
    }

    await new Promise(r => setTimeout(r, 100));
  }

  throw new Error('Failed to generate chunk after all attempts');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const apiKeys = getApiKeys(); // ✅ FIXED
    const { text, voice, speed = 1.0 } = req.body;

    if (!text || !voice) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (apiKeys.length === 0) {
      return res.status(500).json({ error: 'No API keys configured' });
    }

    const chunks = chunkText(text);

    if (chunks.length > MAX_PARALLEL_CHUNKS) {
      return res.status(400).json({
        error: `Text too long. Max ${MAX_PARALLEL_CHUNKS} chunks allowed`
      });
    }

    const audioChunks = await Promise.all(
      chunks.map((chunk, i) => processChunk(chunk, voice, speed, apiKeys, i))
    );

    const finalAudio = Buffer.concat(
      audioChunks.map((a, i) => (i > 0 ? stripId3(a) : a))
    );

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', finalAudio.length);
    return res.status(200).send(finalAudio);

  } catch (error) {
    console.error('Generation error:', error);
    return res.status(500).json({ error: error.message });
  }
};
