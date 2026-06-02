/**
 * Pearl & Sir Gawain — Cloudflare Worker
 * ────────────────────────────────────────
 * This worker securely proxies requests to the Google Gemini API.
 * Your API key is stored as a Cloudflare Secret (never exposed to users).
 *
 * Environment variables required:
 *   GEMINI_API_KEY  — your Google Gemini API key
 *   GEMINI_MODEL    — (optional) defaults to "gemini-2.0-flash"
 *   ALLOWED_ORIGIN  — (optional) restrict to your domain, e.g. "https://yoursite.com"
 *                     Set to "*" to allow all origins (fine during development)
 */

export default {
  async fetch(request, env) {

    /* ── Allowed origin ────────────────────────────────────────── */
    const origin  = request.headers.get('Origin') || '*';
    const allowed = env.ALLOWED_ORIGIN || '*';
    const corsOrigin = (allowed === '*' || origin === allowed) ? origin : allowed;

    const corsHeaders = {
      'Access-Control-Allow-Origin':  corsOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age':       '86400',
    };

    /* ── CORS preflight ─────────────────────────────────────────── */
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    /* ── Only accept POST ───────────────────────────────────────── */
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    /* ── Check API key is configured ────────────────────────────── */
    if (!env.GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: 'GEMINI_API_KEY secret is not set in the Worker.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    /* ── Parse request body ─────────────────────────────────────── */
    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    /* ── Forward to Gemini ──────────────────────────────────────── */
    const model  = env.GEMINI_MODEL || 'gemini-2.0-flash';
    const apiURL = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;

    try {
      const geminiRes = await fetch(apiURL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });

      const data = await geminiRes.json();

      return new Response(JSON.stringify(data), {
        status:  geminiRes.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};
