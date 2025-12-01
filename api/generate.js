// api/generate.js - Vercel Serverless Function for Voice Generation
// This replaces generate.php

const https = require('https');
const http = require('http');

// Configuration
const ENDPOINT_PRIMARY = "https://api.sws.speechify.com/v1/audio/stream";
const ENDPOINT_BACKUP = "https://api.speechify.com/v1/audio/stream";
const CHUNK_CHAR_LIMIT = 2900;
const MAX_ATTEMPTS_PER_CHUNK = 3;
const REQUEST_TIMEOUT = 8000; // 8 seconds (Vercel has 10s limit on Hobby plan)

// Helper function to make HTTP request
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
    
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

// Split text into chunks
function chunkText(text) {
  const chunks = [];
  let pos = 0;
  const len = text.length;
  
  while (pos < len) {
    let end = Math.min(pos + CHUNK_CHAR_LIMIT, len);
    
    if (end < len) {
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

// Strip ID3 tags from MP3
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

// Main handler
module.exports = async (req, res) => {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const { text, voice, apiKeys, speed = 1.0 } = req.body;
    
    // Validation
    if (!text || !voice || !apiKeys || !Array.isArray(apiKeys) || apiKeys.length === 0) {
      return res.status(400).json({ 
        error: 'Missing required fields: text, voice, apiKeys (array)' 
      });
    }
    
    if (text.length < 2) {
      return res.status(400).json({ error: 'Text too short' });
    }
    
    // Split text into chunks
    const chunks = chunkText(text);
    const audioBuffers = [];
    let currentKeyIndex = 0;
    
    // Process each chunk
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (!chunk) continue;
      
      let chunkSuccess = false;
      
      // Try multiple times with different API keys
      for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_CHUNK; attempt++) {
        const apiKey = apiKeys[currentKeyIndex % apiKeys.length];
        
        const payload = JSON.stringify({
          voice_id: voice,
          input: chunk,
          audio_format: "mp3",
          sample_rate: 44100,
          speed: speed
        });
        
        const options = {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
          }
        };
        
        try {
          // Try primary endpoint
          let response = await makeRequest(ENDPOINT_PRIMARY, options, payload);
          
          // If primary fails, try backup
          if (response.statusCode < 200 || response.statusCode >= 300) {
            response = await makeRequest(ENDPOINT_BACKUP, options, payload);
          }
          
          // Check if we got valid audio
          if (response.statusCode >= 200 && response.statusCode < 300 && response.body.length > 1000) {
            // Strip ID3 tags from subsequent chunks for seamless concatenation
            const audioData = i > 0 ? stripId3(response.body) : response.body;
            audioBuffers.push(audioData);
            chunkSuccess = true;
            break;
          }
        } catch (error) {
          // Try next key
        }
        
        currentKeyIndex++;
        
        // Small delay between attempts
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      if (!chunkSuccess) {
        return res.status(500).json({ 
          error: `Failed to generate chunk ${i + 1} of ${chunks.length}` 
        });
      }
    }
    
    // Concatenate all audio buffers
    const finalAudio = Buffer.concat(audioBuffers);
    
    // Return audio as MP3
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', finalAudio.length);
    return res.status(200).send(finalAudio);
    
  } catch (error) {
    console.error('Generation error:', error);
    return res.status(500).json({ 
      error: error.message || 'Internal server error' 
    });
  }
};
