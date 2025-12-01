// api/generate.js - Vercel Serverless Function for Speechify TTS

const https = require('https');

const ENDPOINT_PRIMARY = "https://api.sws.speechify.com/v1/audio/stream";
const ENDPOINT_BACKUP  = "https://api.speechify.com/v1/audio/stream";
const CHUNK_CHAR_LIMIT = 2900;
const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT = 8000; // 8s timeout

// Helper function to make HTTPS request
function makeRequest(url, apiKey, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      },
      timeout: REQUEST_TIMEOUT
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Split text into chunks
function chunkText(text) {
  const chunks = [];
  let pos = 0;
  while(pos < text.length) {
    let end = Math.min(pos + CHUNK_CHAR_LIMIT, text.length);
    if (end < text.length) {
      const lastDot = text.lastIndexOf('.', end);
      if(lastDot > pos && lastDot > end * 0.6) end = lastDot + 1;
    }
    chunks.push(text.slice(pos, end).trim());
    pos = end;
  }
  return chunks;
}

// Strip ID3 tags for concatenation
function stripId3(buffer) {
  if(buffer.length < 10 || buffer.toString('utf8',0,3) !== 'ID3') return buffer;
  let size = 0;
  for(let i=0;i<4;i++) size = (size<<7) | (buffer[6+i] & 0x7F);
  const tagLen = 10+size;
  return tagLen < buffer.length ? buffer.slice(tagLen) : buffer;
}

// Main handler
module.exports = async (req, res) => {
  if(req.method !== 'POST') return res.status(405).json({ error: 'Only POST allowed' });

  try {
    const { text, voice, apiKeys, speed=1.0 } = req.body;

    if(!text || !voice || !apiKeys || !Array.isArray(apiKeys) || apiKeys.length===0)
      return res.status(400).json({ error: 'Missing required fields: text, voice, apiKeys (array)' });

    if(text.length < 2) return res.status(400).json({ error: 'Text too short' });

    const chunks = chunkText(text);
    const audioBuffers = [];
    let keyIndex = 0;

    for(let i=0;i<chunks.length;i++){
      const chunk = chunks[i];
      let success = false;

      for(let attempt=0; attempt<MAX_ATTEMPTS && !success; attempt++){
        const apiKey = apiKeys[keyIndex % apiKeys.length];

        const payload = { voice_id: voice, input: chunk, audio_format: "mp3", sample_rate: 44100, speed };

        try {
          let response = await makeRequest(ENDPOINT_PRIMARY, apiKey, payload);
          if(response.status < 200 || response.status >= 300) 
            response = await makeRequest(ENDPOINT_BACKUP, apiKey, payload);

          if(response.status >=200 && response.status <300 && response.body.length>1000){
            audioBuffers.push(i>0 ? stripId3(response.body) : response.body);
            success = true;
            break;
          }
        } catch(err){ /* try next key */ }

        keyIndex++;
        await new Promise(r=>setTimeout(r,100));
      }

      if(!success) return res.status(500).json({ error: `Failed to generate chunk ${i+1} of ${chunks.length}` });
    }

    const finalAudio = Buffer.concat(audioBuffers);
    res.setHeader('Content-Type','audio/mpeg');
    res.setHeader('Content-Length', finalAudio.length);
    return res.status(200).send(finalAudio);

  } catch(err){
    console.error('Generation error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};
