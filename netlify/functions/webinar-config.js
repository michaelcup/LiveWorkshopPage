/**
 * Netlify Function: Webinar Config Manager
 *
 * GET              → returns stored override config (no auth required)
 * POST action=verify → validates password only, saves nothing
 * POST action=save   → validates password then writes config to Netlify Blobs
 *
 * Environment variables required in Netlify dashboard:
 *   ADMIN_PASSWORD — password for the admin page
 */

const { getStore } = require('@netlify/blobs');

const STORE_NAME = 'liveworkshop';
const BLOB_KEY   = 'webinar';

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // ── GET ─────────────────────────────────────────────────────────────────────
  // Public endpoint: returns whatever is stored (or {found:false})
  if (event.httpMethod === 'GET') {
    try {
      const store = getStore(STORE_NAME);
      const raw = await store.get(BLOB_KEY);
      if (!raw) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ found: false })
        };
      }
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ found: true, config: JSON.parse(raw) })
      };
    } catch (err) {
      console.error('GET error:', err);
      // If Blobs aren't available (local dev without env vars), gracefully signal no override
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ found: false })
      };
    }
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, message: 'Method not allowed' })
    };
  }

  // ── POST ─────────────────────────────────────────────────────────────────────
  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ success: false, message: 'Invalid JSON body' })
    };
  }

  const { action, password, config } = body;

  // Password guard (applies to both verify and save)
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
  if (!ADMIN_PASSWORD) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: 'ADMIN_PASSWORD environment variable not configured' })
    };
  }
  if (!password || password !== ADMIN_PASSWORD) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ success: false, message: 'Incorrect password' })
    };
  }

  // action=verify — just confirm the password is correct, nothing else
  if (action === 'verify') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true })
    };
  }

  // action=save — validate and persist the config
  if (action === 'save') {
    if (!config) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'No config provided' })
      };
    }

    const { date, timeLocal, tzOffset, timeDisplay, durationMins, zoomUrl } = config;

    if (!date || !timeLocal || !tzOffset || !timeDisplay || !zoomUrl) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Missing required config fields' })
      };
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Invalid date format — use YYYY-MM-DD' })
      };
    }

    if (!/^\d{2}:\d{2}:\d{2}$/.test(timeLocal)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Invalid time format — use HH:MM:SS' })
      };
    }

    const toStore = {
      date,
      timeLocal,
      tzOffset,
      timeDisplay,
      durationMins: Number(durationMins) || 45,
      zoomUrl
    };

    try {
      const store = getStore(STORE_NAME);
      await store.set(BLOB_KEY, JSON.stringify(toStore));
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, message: 'Config saved successfully' })
      };
    } catch (err) {
      console.error('Save error:', err);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ success: false, message: 'Failed to save config: ' + err.message })
      };
    }
  }

  return {
    statusCode: 400,
    headers,
    body: JSON.stringify({ success: false, message: 'Unknown action — expected verify or save' })
  };
};
