// api/generate.js
const https = require('https');

// Config
const ENDPOINT_PRIMARY = "https://api.sws.speechify.com/v1/audio/stream";
const ENDPOINT_BACKUP = "https://api.speechify.com/v1/audio/stream";
const CHUNK_CHAR_LIMIT = 2800;
const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT = 8000; // 8s Vercel limit

// Helper: HTTP POST request
function makeRequest(url, apiKey, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const options = {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = https.request(url, options, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
    });

    req.on('error', reject);
    req.setTimeout(REQUEST_TIMEOUT, () => { req.destroy(); reject(new Error('Request timeout')); });
    req.write(data);
    req.end();
  });
}

// Split text into chunks
function chunkText(text) {
  const chunks = [];
  let pos = 0;
  while (pos < text.length) {
    let end = Math.min(pos + CHUNK_CHAR_LIMIT, text.length);
    if (end < text.length) {
      const lastDot = text.lastIndexOf('.', end);
      if (lastDot > pos) end = lastDot + 1;
    }
    chunks.push(text.slice(pos, end).trim());
    pos = end;
  }
  return chunks;
}

// Strip ID3 tags from MP3
function stripId3(buffer) {
  if (!buffer || buffer.length < 10 || buffer.toString('utf8', 0, 3) !== 'ID3') return buffer;
  let size = 0;
  for (let i = 0; i < 4; i++) size = (size << 7) | (buffer[6 + i] & 0x7F);
  const tagLen = 10 + size;
  return tagLen < buffer.length ? buffer.slice(tagLen) : buffer;
}

// Main handler
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Only POST allowed' });

  try {
    const { text, voice, apiKeys = [], speed = 1.0 } = req.body;

    if (!text || !voice || !apiKeys.length) {
      return res.status(400).json({ error: 'Missing text, voice, or apiKeys' });
    }

    const cleanText = text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    if (cleanText.length < 2) return res.status(400).json({ error: 'Text too short' });

    const chunks = chunkText(cleanText);
    const audioBuffers = [];
    let keyIndex = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      let success = false;

      for (let attempt = 0; attempt < MAX_ATTEMPTS && !success; attempt++) {
        const apiKey = apiKeys[keyIndex % apiKeys.length];
        const payload = { voice_id: voice, input: chunk, audio_format: 'mp3', sample_rate: 44100, speed };

        try {
          // Primary endpoint
          let response = await makeRequest(ENDPOINT_PRIMARY, apiKey, payload);

          // Backup if failed
          if (response.status < 200 || response.status >= 300) {
            console.log(`Primary failed (chunk ${i + 1}), trying backup`);
            response = await makeRequest(ENDPOINT_BACKUP, apiKey, payload);
          }

          if (response.status >= 200 && response.status < 300 && response.body.length > 1000) {
            const audioData = i > 0 ? stripId3(response.body) : response.body;
            audioBuffers.push(audioData);
            success = true;
            break;
          } else {
            console.log(`Chunk ${i + 1} failed with status ${response.status}`);
          }

        } catch (err) {
          console.error(`Chunk ${i + 1} attempt ${attempt + 1} error:`, err.message);
        }

        keyIndex++;
        await new Promise(r => setTimeout(r, 100));
      }

      if (!success) {
        return res.status(500).json({ error: `Failed to generate chunk ${i + 1}` });
      }
    }

    const finalAudio = Buffer.concat(audioBuffers);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', finalAudio.length);
    return res.status(200).send(finalAudio);

  } catch (err) {
    console.error('Generation error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};
