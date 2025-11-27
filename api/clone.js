const https = require('https' );
const FormData = require('form-data');

const API_ENDPOINT = "https://api.sws.speechify.com/v1/voices";
const REQUEST_TIMEOUT = 60000;

function makeMultipartRequest(url, apiKey, formData ) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    
    const options = {
      method: 'POST',
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        ...formData.getHeaders()
      }
    };
    
    const req = https.request(options, (res ) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          body: Buffer.concat(chunks).toString('utf8')
        });
      });
    });
    
    req.on('error', reject);
    req.setTimeout(REQUEST_TIMEOUT, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    formData.pipe(req);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  
  try {
    const { voiceName, audioBase64, apiKey, username = 'user' } = req.body;
    
    if (!voiceName || !audioBase64 || !apiKey) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Missing required fields: voiceName, audioBase64, apiKey' 
      });
    }
    
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    
    if (audioBuffer.length > 50 * 1024 * 1024) {
      return res.status(400).json({ 
        ok: false, 
        error: 'File too large (max 50MB)' 
      });
    }
    
    const formData = new FormData();
    formData.append('name', voiceName);
    formData.append('gender', 'male');
    formData.append('consent', JSON.stringify({
      fullName: username,
      email: `${username}@example.com`
    }));
    formData.append('sample', audioBuffer, {
      filename: `${voiceName}.mp3`,
      contentType: 'audio/mpeg'
    });
    
    const response = await makeMultipartRequest(API_ENDPOINT, apiKey, formData);
    
    let data;
    try {
      data = JSON.parse(response.body);
    } catch (e) {
      return res.status(500).json({ 
        ok: false, 
        error: 'Invalid response from Speechify API' 
      });
    }
    
    if ((response.statusCode === 200 || response.statusCode === 201) && data.id) {
      return res.status(200).json({
        ok: true,
        message: 'Voice cloned successfully!',
        voice: {
          id: data.id,
          name: voiceName
        },
        voice_name: voiceName
      });
    } else {
      return res.status(response.statusCode || 500).json({
        ok: false,
        error: data.error || data.message || 'Failed to clone voice'
      });
    }
    
  } catch (error) {
    console.error('Clone error:', error);
    return res.status(500).json({ 
      ok: false, 
      error: error.message || 'Internal server error' 
    });
  }
};
