// generate.js

const https = require('https');
const http = require('http');

// ---------- Config ----------

const CONFIG = {
  ENDPOINT: 'https://api.sws.speechify.com/v1/audio/stream',
  CHUNK_CHAR_LIMIT: 2000,
  REQUEST_TIMEOUT_MS: 50000,
  MAX_PARALLEL_CHUNKS: 30, // ~60k chars
  MIN_AUDIO_BYTES: 1000,   // minimum size to treat audio as valid
};

// ---------- Utility helpers ----------

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createHttpError(statusCode, code, message, details) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  if (details) err.details = details;
  return err;
}

function sendErrorResponse(res, error) {
  const status =
    typeof error.statusCode === 'number' && error.statusCode >= 400
      ? error.statusCode
      : 500;

  const payload = {
    success: false,
    error: {
      code: error.code || 'INTERNAL_ERROR',
      message: error.message || 'Internal server error',
    },
  };

  if (process.env.NODE_ENV !== 'production') {
    if (error.details) payload.error.details = error.details;
    if (error.stack) payload.error.stack = error.stack;
  }

  if (status === 405) {
    res.setHeader('Allow', 'POST');
  }

  res.status(status).json(payload);
}

// ---------- Low-level HTTP helper ----------

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
      reject(
        createHttpError(502, 'SPEECHIFY_NETWORK_ERROR', 'Network error calling Speechify.', {
          originalError: err.message || String(err),
          code: err.code,
        })
      );
    });

    req.setTimeout(CONFIG.REQUEST_TIMEOUT_MS, () => {
      req.destroy();
      reject(
        createHttpError(
          504,
          'SPEECHIFY_TIMEOUT',
          `Speechify request timed out after ${CONFIG.REQUEST_TIMEOUT_MS}ms.`
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
    let end = Math.min(pos + CONFIG.CHUNK_CHAR_LIMIT, text.length);

    if (end < text.length) {
      const lastPeriod = text.lastIndexOf('.', end);
      if (lastPeriod > pos && lastPeriod > end * 0.6) {
        end = lastPeriod + 1;
      }
    }

    const chunk = text.substring(pos, end).trim();
    if (chunk) chunks.push(chunk);

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

  // Allow newline / comma / semicolon-separated keys
  const allKeys = raw
    .split(/[\r\n,;]+/)
    .map((k) => k.trim())
    .filter(Boolean);

  if (allKeys.length === 0) {
    throw createHttpError(
      500,
      'SPEECHIFY_API_KEYS_EMPTY',
      'SPEECHIFY_API_KEYS is defined but contains no non-empty keys.'
    );
  }

  const invalidKeys = allKeys.filter((k) => /\s/.test(k));
  const validKeys = allKeys.filter((k) => !/\s/.test(k));

  if (invalidKeys.length) {
    console.warn(
      `Ignoring ${invalidKeys.length} invalid Speechify API key(s) (whitespace not allowed).`
    );
  }

  if (validKeys.length === 0) {
    throw createHttpError(
      500,
      'SPEECHIFY_API_KEYS_INVALID',
      'No usable Speechify API keys found in SPEECHIFY_API_KEYS (whitespace not allowed).'
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

// ---------- Speechify per-chunk request ----------

async function processChunk(chunkTextValue, voice, speed, apiKeys, keyIndex) {
  const maxAttempts = 3;
  let lastError = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const keyPos = (keyIndex + attempt) % apiKeys.length;
    const apiKey = apiKeys[keyPos];

    const payload = JSON.stringify({
      voice_id: voice,
      input: chunkTextValue,
      audio_format: 'mp3',
      sample_rate: 44100,
      speed,
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
      const { statusCode, body } = await makeRequest(CONFIG.ENDPOINT, options, payload);

      // 2xx → success path
      if (statusCode >= 200 && statusCode < 300) {
        if (body.length >= CONFIG.MIN_AUDIO_BYTES) {
          return body;
        }

        lastError = createHttpError(
          502,
          'SPEECHIFY_EMPTY_AUDIO',
          `Speechify returned success but audio payload was too small (length=${body.length}).`,
          { statusCode, length: body.length }
        );
        console.warn('[Speechify] 2xx with too-small body:', lastError.details);
      } else {
        // Non-2xx → decode message if possible
        const bodyPreview = body.slice(0, 2000).toString('utf8') || '';
        let parsed;
        try {
          parsed = JSON.parse(bodyPreview);
        } catch {
          parsed = null;
        }

        const upstreamMessage =
          parsed?.error || parsed?.message || bodyPreview || 'No body';

        console.warn(
          `[Speechify] Non-2xx status: ${statusCode} (attempt ${attempt + 1}/${maxAttempts})`,
          { statusCode, keyIndex: keyPos, upstreamMessage }
        );

        // Auth-related: do not retry (config issue)
        if (statusCode === 401 || statusCode === 403) {
          throw createHttpError(
            500,
            'SPEECHIFY_AUTH_FAILED',
            'Speechify rejected the API key. Check SPEECHIFY_API_KEYS.',
            { statusCode, upstreamMessage }
          );
        }

        // Client request issue: do not retry
        if (statusCode >= 400 && statusCode < 500 && statusCode !== 429) {
          throw createHttpError(
            400,
            'SPEECHIFY_BAD_REQUEST',
            `Speechify rejected the request (status ${statusCode}). Check voice, text, and parameters.`,
            { statusCode, upstreamMessage }
          );
        }

        // 429 or 5xx → treat as transient; may retry
        lastError = createHttpError(
          502,
          'SPEECHIFY_UNAVAILABLE',
          `Speechify is unavailable or rate-limited (status ${statusCode}).`,
          { statusCode, upstreamMessage }
        );
      }
    } catch (err) {
      // Known non-retriable custom errors: bubble immediately
      if (
        err &&
        err.code &&
        ['SPEECHIFY_AUTH_FAILED', 'SPEECHIFY_BAD_REQUEST'].includes(err.code)
      ) {
        throw err;
      }

      lastError = err;
      console.error(
        `[Speechify] Request error (attempt ${attempt + 1}/${maxAttempts}):`,
        err
      );
    }

    // If we reached here, we will retry (if attempts left)
    await delay(150);
  }

  if (lastError) {
    if (lastError.statusCode && lastError.code) {
      throw lastError;
    }

    throw createHttpError(
      502,
      'SPEECHIFY_FAILED',
      'Failed to generate audio from Speechify after multiple attempts.',
      { originalError: lastError.message || String(lastError) }
    );
  }

  throw createHttpError(
    502,
    'SPEECHIFY_FAILED',
    'Failed to generate audio from Speechify after multiple attempts.'
  );
}

// ---------- Main handler ----------

module.exports = async (req, res) => {
  // Method check
  if (req.method !== 'POST') {
    return sendErrorResponse(
      res,
      createHttpError(
        405,
        'METHOD_NOT_ALLOWED',
        'Only POST is allowed on this endpoint.',
        { allowedMethods: ['POST'] }
      )
    );
  }

  // Content-Type check (for JSON payloads)
  const contentType = (req.headers['content-type'] || '').toLowerCase();
  if (contentType && !contentType.includes('application/json')) {
    return sendErrorResponse(
      res,
      createHttpError(
        415,
        'UNSUPPORTED_MEDIA_TYPE',
        'Content-Type must be application/json.'
      )
    );
  }

  try {
    const apiKeys = getApiKeys();

    // In many frameworks (Next.js/Express), req.body is already parsed JSON
    const body = req.body && typeof req.body === 'object' ? req.body : {};

    const { text, voice } = body;
    const speedRaw = body.speed;

    // ----- Request validation -----

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

    let speed = 1.0;
    if (speedRaw !== undefined) {
      const numericSpeed = Number(speedRaw);
      if (
        !Number.isFinite(numericSpeed) ||
        numericSpeed <= 0 ||
        numericSpeed > 4
      ) {
        throw createHttpError(
          400,
          'INVALID_SPEED',
          'Field "speed" must be a number between 0 and 4 if provided.'
        );
      }
      speed = numericSpeed;
    }

    const chunks = chunkText(text);

    if (chunks.length === 0) {
      throw createHttpError(
        400,
        'EMPTY_TEXT',
        'Text must contain at least one non-empty chunk after processing.'
      );
    }

    if (chunks.length > CONFIG.MAX_PARALLEL_CHUNKS) {
      throw createHttpError(
        400,
        'TEXT_TOO_LONG',
        `Text too long. Max ${CONFIG.MAX_PARALLEL_CHUNKS} chunks allowed.`
      );
    }

    console.log(`Processing ${chunks.length} Speechify chunks in parallel...`);

    const audioChunks = await Promise.all(
      chunks.map((chunk, i) => processChunk(chunk, voice, speed, apiKeys, i))
    );

    console.log(`All ${chunks.length} chunks completed!`);

    const finalAudio = Buffer.concat(
      audioChunks.map((a, i) => (i > 0 ? stripId3(a) : a))
    );

    // ----- Success response (binary audio) -----
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', finalAudio.length);
    // Optional: some clients may like a success hint
    res.setHeader('X-Generation-Status', 'success');

    return res.status(200).send(finalAudio);
  } catch (error) {
    console.error('Generation error:', error);
    return sendErrorResponse(res, error);
  }
};
