// backend/services/quranFoundation.js
// Quran Foundation Content API server client for chapter audio + timing metadata.
// Keep QF_CLIENT_ID and QF_CLIENT_SECRET on the backend only.

const AUTH_BASE_BY_ENV = {
  prelive: 'https://prelive-oauth2.quran.foundation',
  production: 'https://oauth2.quran.foundation',
};

const API_BASE_BY_ENV = {
  prelive: 'https://apis-prelive.quran.foundation',
  production: 'https://apis.quran.foundation',
};

const QF_ENV = process.env.QF_ENV || 'prelive';
if (!AUTH_BASE_BY_ENV[QF_ENV]) {
  throw new Error(`Invalid QF_ENV: ${QF_ENV}`);
}

let cachedToken = null;
let expiresAt = 0;
let inflightTokenPromise = null;

async function fetchToken() {
  const clientId = process.env.QF_CLIENT_ID;
  const clientSecret = process.env.QF_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Missing QF_CLIENT_ID or QF_CLIENT_SECRET');
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch(`${AUTH_BASE_BY_ENV[QF_ENV]}/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'content',
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Quran Foundation token request failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  cachedToken = data.access_token;
  expiresAt = Date.now() + Number(data.expires_in || 3600) * 1000;
  return cachedToken;
}

async function getAccessToken() {
  if (cachedToken && Date.now() < expiresAt - 30_000) return cachedToken;
  if (!inflightTokenPromise) {
    inflightTokenPromise = fetchToken().finally(() => {
      inflightTokenPromise = null;
    });
  }
  return inflightTokenPromise;
}

function clearToken() {
  cachedToken = null;
  expiresAt = 0;
}

async function qfFetch(path, options = {}, retried = false) {
  const token = await getAccessToken();
  const response = await fetch(`${API_BASE_BY_ENV[QF_ENV]}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      'x-auth-token': token,
      'x-client-id': process.env.QF_CLIENT_ID,
    },
  });

  if (response.status === 401 && !retried) {
    clearToken();
    return qfFetch(path, options, true);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    const error = new Error(`Quran Foundation API failed (${response.status})`);
    error.status = response.status;
    error.body = body;
    throw error;
  }

  return response.json();
}

async function listChapterReciters() {
  return qfFetch('/content/api/v4/resources/chapter_reciters');
}

async function getChapterAudio(reciterId, chapterNumber, segments = true) {
  const id = Number(reciterId);
  const chapter = Number(chapterNumber);
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid chapter reciter ID');
  if (!Number.isInteger(chapter) || chapter < 1 || chapter > 114) throw new Error('Invalid chapter number');

  const query = segments ? '?segments=true' : '';
  return qfFetch(`/content/api/v4/chapter_recitations/${id}/${chapter}${query}`);
}

module.exports = {
  listChapterReciters,
  getChapterAudio,
};
