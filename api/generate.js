const https = require('https');
const http = require('http');

const ENDPOINT = "https://api.sws.speechify.com/v1/audio/stream";
const CHUNK_CHAR_LIMIT = 2000;
const REQUEST_TIMEOUT = 50000;
const MAX_PARALLEL_CHUNKS = 30; // ~60k chars

// ---------- Error helpers ----------

function createHttpError(statusCode, code, message, meta) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  if (meta) err.meta = meta;
  return err;
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------- HTTP request helper ----------

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
          headers: res.headers,
          body: Buffer.concat(chunks),
        });
      });
    });

    req.on('error', (err) => {
      console.error('Request error for URL:', url, err);
      reject(err);
    });

    req.setTimeout(REQUEST_TIMEOUT, () => {
      console.error('Request timeout for URL:', url);
      req.destroy();
      reject(
        createHttpError(
          504,
          'REQUEST_TIMEOUT',
          `Request to Speechify timed out after ${REQUEST_TIMEOUT}ms`
        )
      );
    });

    if (postData) req.write(postData);
    req.end();
  });
}

// ---------- Text chunking ----------

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

// ---------- Audio helpers ----------

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

// ---------- API key parsing & validation ----------

function getApiKeys() {
  const raw = process.env.SPEECHIFY_API_KEYS;

  if (!raw) {
    throw createHttpError(
      500,
      'SPEECHIFY_API_KEYS_MISSING',
      'SPEECHIFY_API_KEYS environment variable is not set.'
    );
  }

  // Support newline/comma/semicolon separated keys
  const allKeys = raw
    .split(/[\r\n,;]+/)
    .map((k) => k.trim())
    .filter(Boolean);

  if (allKeys.length === 0) {
    throw createHttpError(
      500,
      'SPEECHIFY_API_KEYS_EMPTY',
      'SPEECHIFY_API_KEYS is defined but contains no keys.'
    );
  }

  const invalidKeys = allKeys.filter((k) => /\s/.test(k));
  const validKeys = allKeys.filter((k) => !/\s/.test(k));

  if (invalidKeys.length) {
    console.warn(
      `Ignoring ${invalidKeys.length} invalid Speechify API keys (contain whitespace).`
    );
  }

  if (validKeys.length === 0) {
    throw createHttpError(
      500,
      'SPEECHIFY_API_KEYS_INVALID',
      'No usable Speechify API keys found in SPEECHIFY_API_KEYS. Keys must not contain spaces.'
    );
  }

  const uniqueKeys = [...new Set(validKeys)];

  if (uniqueKeys.length !== validKeys.length) {
    console.warn(
      `Duplicate Speechify API keys detected; using ${uniqueKeys.length} unique key(s).`
    );
  }

  return uniqueKeys;
}

// ---------- Speechify call per chunk ----------

async function processChunk(chunkTextValue, voice, speed, apiKeys, keyIndex) {
  const maxAttempts = 3;
  let lastError = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const apiKey = apiKeys[(keyIndex + attempt) % apiKeys.length];

    const payload = JSON.stringify({
      voice_id: voice,
      input: chunkTextValue,
      audio_format: 'mp3',
      sample_rate: 44100,
      speed: speed,
    });

    const options = {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    try {
      const response = await makeRequest(ENDPOINT, options, payload);
      const { statusCode, body } = response;

      // Success path
      if (statusCode >= 200 && statusCode < 300) {
        if (body.length > 1000) {
          return body;
        }

        // Too small body even though 2xx
        lastError = createHttpError(
          502,
          'SPEECHIFY_EMPTY_AUDIO',
          `Speechify returned success but audio payload was unexpectedly small (length=${body.length}).`,
          { statusCode, length: body.length }
        );
        console.warn('[Speechify] 2xx with too-small body:', lastError.meta);
      } else {
        // Non-2xx: inspect body (limit size for logs)
        const textPreview = body.slice(0, 2000).toString('utf8');
        let parsed;
        try {
          parsed = JSON.parse(textPreview);
        } catch {
          parsed = null;
        }

        const upstreamMessage =
          parsed?.error || parsed?.message || textPreview || 'No body';

        console.warn(
          `[Speechify] Non-2xx status: ${statusCode} (attempt ${attempt + 1}/${maxAttempts})`,
          {
            statusCode,
            attempt: attempt + 1,
            keyIndex: (keyIndex + attempt) % apiKeys.length,
            upstreamMessage,
          }
        );

        // Auth errors: do not retry; configuration problem
        if (statusCode === 401 || statusCode === 403) {
          throw createHttpError(
            500,
            'SPEECHIFY_AUTH_FAILED',
            'Speechify rejected the API key. Check SPEECHIFY_API_KEYS.',
            { statusCode, upstreamMessage }
          );
        }

        // Rate limiting or server errors: may be transient -> retry
        if (statusCode === 429 || statusCode >= 500) {
          lastError = createHttpError(
            502,
            'SPEECHIFY_UNAVAILABLE',
            `Speechify is unavailable or rate-limited (status ${statusCode}).`,
            { statusCode, upstreamMessage }
          );
        } else if (statusCode >= 400 && statusCode < 500) {
          // Client-side issue in our request (bad params/voice/etc). Don't retry.
          throw createHttpError(
            400,
            'SPEECHIFY_BAD_REQUEST',
            `Speechify rejected the request (status ${statusCode}). Check voice id, text, and parameters.`,
            { statusCode, upstreamMessage }
          );
        } else {
          lastError = createHttpError(
            502,
            'SPEECHIFY_ERROR',
            `Unexpected response from Speechify (status ${statusCode}).`,
            { statusCode, upstreamMessage }
          );
        }
      }
    } catch (err) {
      // Our own HttpError for non-retriable conditions: propagate immediately
      if (
        err &&
        err.code &&
        ['SPEECHIFY_AUTH_FAILED', 'SPEECHIFY_BAD_REQUEST'].includes(err.code)
      ) {
        throw err;
      }

      // Network or other errors: capture and maybe retry
      lastError = err;
      console.error(
        `[Speechify] Request error (attempt ${attempt + 1}/${maxAttempts}):`,
        err
      );
    }

    // Small delay before retrying with same/next key
    await delay(150);
  }

  // After all attempts failed
  if (lastError) {
    // If the last error is already an HttpError, propagate it
    if (lastError.statusCode && lastError.code) {
      throw lastError;
    }

    // Wrap generic error
    throw createHttpError(
      502,
      'SPEECHIFY_FAILED',
      'Failed to generate audio from Speechify after multiple attempts.',
      { originalError: lastError.message || String(lastError) }
    );
  }

  // Fallback (should not reach here)
  throw createHttpError(
    502,
    'SPEECHIFY_FAILED',
    'Failed to generate audio from Speechify after multiple attempts.'
  );
}

// ---------- Main handler ----------

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res
      .status(405)
      .json({ error: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' });
  }

  try {
    const apiKeys = getApiKeys();

    const { text, voice, speed = 1.0 } = req.body || {};

    // Request validation
    if (typeof text !== 'string' || !text.trim()) {
      throw createHttpError(
        400,
        'MISSING_TEXT',
        'Field "text" is required and must be a non-empty string.'
      );
    }

    if (typeof voice !== 'string' || !voice.trim()) {
      throw createHttpError(
        400,
        'MISSING_VOICE',
        'Field "voice" is required and must be a non-empty string.'
      );
    }

    if (
      speed !== undefined &&
      (typeof speed !== 'number' ||
        !Number.isFinite(speed) ||
        speed <= 0 ||
        speed > 4)
    ) {
      throw createHttpError(
        400,
        'INVALID_SPEED',
        'Field "speed" must be a number between 0 and 4.'
      );
    }

    const chunks = chunkText(text);

    if (chunks.length > MAX_PARALLEL_CHUNKS) {
      throw createHttpError(
        400,
        'TEXT_TOO_LONG',
        `Text too long. Max ${MAX_PARALLEL_CHUNKS} chunks allowed.`
      );
    }

    console.log(`Processing ${chunks.length} chunks in parallel...`);

    const audioChunks = await Promise.all(
      chunks.map((chunk, i) => processChunk(chunk, voice, speed, apiKeys, i))
    );

    console.log(`All ${chunks.length} chunks completed!`);

    const finalAudio = Buffer.concat(
      audioChunks.map((a, i) => (i > 0 ? stripId3(a) : a))
    );

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', finalAudio.length);
    return res.status(200).send(finalAudio);
  } catch (error) {
    console.error('Generation error:', error);

    const status =
      typeof error.statusCode === 'number' && error.statusCode >= 400
        ? error.statusCode
        : 500;

    const payload = {
      error: error.code || 'INTERNAL_ERROR',
      message: error.message || 'Internal server error',
    };

    // In non-production, return a bit more detail (no secrets)
    if (process.env.NODE_ENV !== 'production') {
      if (error.meta) payload.meta = error.meta;
      if (error.code && !payload.error) payload.error = error.code;
      if (error.stack) payload.stack = error.stack;
    }

    return res.status(status).json(payload);
  }
};
