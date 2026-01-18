// api/generate.js
const https = require('https');

// ================= CONFIG =================
const ENDPOINT_PRIMARY = "https://api.sws.speechify.com/v1/audio/stream";
const ENDPOINT_BACKUP = "https://api.speechify.com/v1/audio/stream";

const CHUNK_CHAR_LIMIT = 1200;  // safe chunk size
const MAX_ATTEMPTS = 3;          // retry attempts
const REQUEST_TIMEOUT = 25000;   // 25s timeout
const MIN_AUDIO_LENGTH = 1000;   // minimum MP3 length
const RETRY_DELAY = 200;         // ms delay between retries
// ========================================

// ====== LOGGING UTILS ======
const logInfo = (msg) => console.log(`[INFO] [${new Date().toISOString()}] ${msg}`);
const logWarn = (msg) => console.warn(`[WARN] [${new Date().toISOString()}] ${msg}`);
const logError = (msg) => console.error(`[ERROR] [${new Date().toISOString()}] ${msg}`);

// ====== HTTP REQUEST WITH RETRY ======
async function makeRequest(url, apiKey, payload, chunkNum, attempt, endpointName) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const options = {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    };

    logInfo(`Chunk ${chunkNum} | Attempt ${attempt} | Endpoint: ${endpointName} | Payload preview: "${payload.input.slice(0, 50)}${payload.input.length > 50 ? '...' : ''}"`);

    const req = https.request(url, options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        logInfo(`Chunk ${chunkNum} | Attempt ${attempt} | ${endpointName} response: Status=${res.statusCode}, Length=${buffer.length}`);
        resolve({ status: res.statusCode, body: buffer });
      });
    });

    req.on('error', (err) => {
      logError(`Chunk ${chunkNum} | Attempt ${attempt} | ${endpointName} error: ${err.message}`);
      reject(err);
    });

    req.setTimeout(REQUEST_TIMEOUT, () => {
      req.destroy();
      logError(`Chunk ${chunkNum} | Attempt ${attempt} | ${endpointName} timeout`);
      reject(new Error('Request timeout'));
    });

    req.write(data);
    req.end();
  });
}

// ====== TEXT CHUNKING ======
function chunkText(text) {
  const chunks = [];
  let pos = 0;

  while (pos < text.length) {
    let end = Math.min(pos + CHUNK_CHAR_LIMIT, text.length);

    // Prefer sentence boundary
    if (end < text.length) {
      const lastDot = text.lastIndexOf('.', end);
      if (lastDot > pos) end = lastDot + 1;
    }

    const chunk = text.slice(pos, end).trim();
    if (chunk) chunks.push(chunk);
    pos = end;
  }

  return chunks;
}

// ====== ID3 STRIP ======
function stripId3(buffer) {
  if (!buffer || buffer.length < 10 || buffer.toString('utf8', 0, 3) !== 'ID3') return buffer;
  let size = 0;
  for (let i = 0; i < 4; i++) size = (size << 7) | (buffer[6 + i] & 0x7F);
  const tagLen = 10 + size;
  return tagLen < buffer.length ? buffer.slice(tagLen) : buffer;
}

// ====== GENERATE AUDIO ======
async function generateChunk(chunk, voice, apiKeys, chunkNum) {
  let keyIndex = 0;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const apiKey = apiKeys[keyIndex % apiKeys.length];
    const payload = {
      voice_id: voice,
      input: chunk,
      audio_format: 'mp3',
      sample_rate: 44100,
      speed: 1.0,
    };

    try {
      // Try primary
      let response = await makeRequest(ENDPOINT_PRIMARY, apiKey, payload, chunkNum, attempt, 'Primary');

      // Fallback to backup if failed
      if (response.status < 200 || response.status >= 300 || response.body.length < MIN_AUDIO_LENGTH) {
        logWarn(`Chunk ${chunkNum} Attempt ${attempt} - Primary failed, trying backup`);
        response = await makeRequest(ENDPOINT_BACKUP, apiKey, payload, chunkNum, attempt, 'Backup');
      }

      if (response.status >= 200 && response.status < 300 && response.body.length >= MIN_AUDIO_LENGTH) {
        return response.body;
      } else {
        logWarn(`Chunk ${chunkNum} Attempt ${attempt} failed: Status=${response.status}, Length=${response.body.length}`);
      }

    } catch (err) {
      logError(`Chunk ${chunkNum} Attempt ${attempt} request error: ${err.message}`);
    }

    keyIndex++;
    await new Promise(r => setTimeout(r, RETRY_DELAY));
  }

  throw new Error(`Failed to generate chunk ${chunkNum} after ${MAX_ATTEMPTS} attempts`);
}

// ====== API HANDLER ======
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Only POST allowed' });

  try {
    const { text, voice, apiKeys } = req.body;

    if (!text || !voice || !apiKeys?.length) {
      return res.status(400).json({ error: 'Missing text, voice, or apiKeys' });
    }

    const cleanText = text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    if (cleanText.length < 2) return res.status(400).json({ error: 'Text too short' });

    const chunks = chunkText(cleanText);
    logInfo(`Total chunks to generate: ${chunks.length}`);

    const audioBuffers = [];

    for (let i = 0; i < chunks.length; i++) {
      logInfo(`Generating chunk ${i + 1}/${chunks.length}, length=${chunks[i].length}`);
      const audioData = await generateChunk(chunks[i], voice, apiKeys, i + 1);
      audioBuffers.push(i > 0 ? stripId3(audioData) : audioData);
      logInfo(`Chunk ${i + 1} generated successfully`);
    }

    const finalAudio = Buffer.concat(audioBuffers);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', finalAudio.length);
    res.status(200).send(finalAudio);

  } catch (err) {
    logError(`Generation error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
};
