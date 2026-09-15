import dotenv from "dotenv";

dotenv.config();

const ENV = process.env.QF_ENV || "prelive";

const CONFIG = {
  prelive: {
    auth: "https://prelive-oauth2.quran.foundation",
    api: "https://apis-prelive.quran.foundation",
  },

  production: {
    auth: "https://oauth2.quran.foundation",
    api: "https://apis.quran.foundation",
  },
};

if (!CONFIG[ENV]) {
  throw new Error(
      `Invalid QF_ENV "${ENV}". Expected "prelive" or "production".`
  );
}

const { auth: AUTH_BASE_URL, api: API_BASE_URL } = CONFIG[ENV];

let cachedToken = null;
let tokenExpiresAt = 0;
let tokenRequestPromise = null;

/**
 * Request a new Quran Foundation Content API token.
 */
async function requestAccessToken() {
  const clientId = process.env.QF_CLIENT_ID;
  const clientSecret = process.env.QF_CLIENT_SECRET;

  if (!clientId) {
    throw new Error("QF_CLIENT_ID is missing from backend/.env");
  }

  if (!clientSecret) {
    throw new Error("QF_CLIENT_SECRET is missing from backend/.env");
  }

  const credentials = Buffer.from(
      `${clientId}:${clientSecret}`
  ).toString("base64");

  const response = await fetch(
      `${AUTH_BASE_URL}/oauth2/token`,
      {
        method: "POST",

        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type":
              "application/x-www-form-urlencoded",
        },

        body: new URLSearchParams({
          grant_type: "client_credentials",
          scope: "content",
        }),
      }
  );

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
        `Quran Foundation authentication failed (${response.status}): ${errorText}`
    );
  }

  const data = await response.json();

  if (!data.access_token) {
    throw new Error(
        "Quran Foundation did not return an access token."
    );
  }

  cachedToken = data.access_token;

  /*
   * The documented token lifetime is normally 3600 seconds.
   * Refresh 60 seconds before expiry.
   */
  const expiresIn =
      Number(data.expires_in) || 3600;

  tokenExpiresAt =
      Date.now() + (expiresIn * 1000) - 60_000;

  return cachedToken;
}

/**
 * Get a valid cached token.
 *
 * Multiple simultaneous API requests share the
 * same token request instead of requesting tokens
 * repeatedly.
 */
async function getAccessToken() {
  if (
      cachedToken &&
      Date.now() < tokenExpiresAt
  ) {
    return cachedToken;
  }

  if (!tokenRequestPromise) {
    tokenRequestPromise = requestAccessToken()
        .finally(() => {
          tokenRequestPromise = null;
        });
  }

  return tokenRequestPromise;
}

/**
 * Clear the cached token.
 */
function clearAccessToken() {
  cachedToken = null;
  tokenExpiresAt = 0;
}

/**
 * Make an authenticated Quran Foundation
 * Content API request.
 *
 * Automatically retries once when the token
 * has expired / become invalid.
 */
export async function qfRequest(
    path,
    options = {}
) {
  const makeRequest = async (token) => {
    const headers = {
      Accept: "application/json",

      /*
       * Required by Quran Foundation Content APIs.
       */
      "x-auth-token": token,

      "x-client-id": process.env.QF_CLIENT_ID,

      ...(options.headers || {}),
    };

    return fetch(
        `${API_BASE_URL}${path}`,
        {
          ...options,
          headers,
        }
    );
  };

  let token = await getAccessToken();

  let response = await makeRequest(token);

  /*
   * Token expired/invalid.
   * Clear it, get a new one and retry exactly once.
   */
  if (response.status === 401) {
    clearAccessToken();

    token = await getAccessToken();

    response = await makeRequest(token);
  }

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
        `Quran Foundation API request failed (${response.status}): ${errorText}`
    );
  }

  return response.json();
}

/**
 * Test endpoint.
 *
 * GET /content/api/v4/chapters
 */
export async function getChapters() {
  return qfRequest(
      "/content/api/v4/chapters"
  );
}

/**
 * Get available Chapter Reciters.
 *
 * IMPORTANT:
 * These IDs are CHAPTER RECITER IDs.
 *
 * They are different from ayah-by-ayah
 * recitation IDs.
 */
export async function getChapterReciters(
    language = "en"
) {
  const params = new URLSearchParams();

  if (language) {
    params.set("language", language);
  }

  const query = params.toString();

  return qfRequest(
      `/content/api/v4/resources/chapter_reciters${
          query ? `?${query}` : ""
      }`
  );
}

/**
 * Get chapter audio.
 *
 * This is the important endpoint for our
 * synchronized Quran player.
 *
 * We request segments=true so the response
 * contains timing information that can be
 * associated with the chapter audio.
 */
export async function getChapterAudio(
    reciterId,
    chapterNumber,
    includeSegments = true
) {
  const params = new URLSearchParams({
    segments: String(includeSegments),
  });

  return qfRequest(
      `/content/api/v4/chapter_recitations/${reciterId}/${chapterNumber}?${params.toString()}`
  );
}

/**
 * Export the environment for diagnostics.
 *
 * Does NOT expose the client secret.
 */
export function getQuranFoundationEnvironment() {
  return ENV;
}