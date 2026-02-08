// src/api/client.js

/* ===============================
   Client-side API utilities
   ---------------------------
   Helper functions for:
   - HTTP requests (GET / POST)
   - Server-Sent Events (SSE)
   - Using a configurable API base URL
================================ */

/**
 * Base API URL
 * - Loaded from Vite environment variables (VITE_API_BASE)
 * - Falls back to localhost for local development
 */
const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

/**
 * GET JSON helper
 * ---------------
 * Performs a GET request and automatically parses the JSON response.
 *
 * @param {string} path - API endpoint (e.g. "/api/users")
 * @returns {Promise<any>} Parsed JSON response
 * @throws {Error} If the HTTP status is not OK (non-2xx)
 */
export async function getJson(path) {
  const res = await fetch(`${API_BASE}${path}`);

  // Handle HTTP errors (4xx / 5xx)
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${path}`);
  }

  // Parse and return JSON body
  return await res.json();
}

/**
 * Server-Sent Events (SSE) helper
 * -------------------------------
 * Opens an EventSource connection and attaches handlers
 * for custom SSE event types.
 *
 * @param {string} path - SSE endpoint (e.g. "/api/stream")
 * @param {Object} handlers - Map of eventName -> callback
 *
 * Example:
 * openSSE("/events", {
 *   message: data => console.log(data),
 *   progress: data => updateProgress(data),
 * })
 *
 * @returns {EventSource} The EventSource instance (can be closed externally)
 */
export function openSSE(path, handlers = {}) {
  // Create SSE connection
  const es = new EventSource(`${API_BASE}${path}`);

  // Register event listeners
  for (const [eventName, fn] of Object.entries(handlers)) {
    es.addEventListener(eventName, (ev) => {
      try {
        // Try to parse JSON payload (most common case)
        fn(JSON.parse(ev.data));
      } catch {
        // Fallback for plain text payloads
        fn(ev.data);
      }
    });
  }

  // Generic SSE error handler
  es.onerror = (e) => {
    console.warn("SSE error", e);
  };

  // Return EventSource so caller can manage lifecycle (close, etc.)
  return es;
}

/**
 * POST JSON helper
 * ----------------
 * Sends a POST request with a JSON body and supports cookies/session auth.
 *
 * @param {string} path - API endpoint (e.g. "/api/login")
 * @param {Object} body - JSON payload
 * @param {Object} opts - Optional settings (e.g. custom headers)
 *
 * @returns {Promise<any>} Parsed JSON response
 * @throws {Error} If the request fails, including status and response body
 */
export async function postJson(path, body, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      // Standard JSON content type
      "Content-Type": "application/json",

      // Allow custom headers (e.g. Authorization)
      ...(opts.headers || {}),
    },

    // Serialize request body as JSON
    body: JSON.stringify(body ?? {}),

    // Include cookies for session-based authentication
    credentials: "include",
  });

  // Handle failed requests
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`POST ${path} failed: ${res.status} ${txt}`);
  }

  // Parse and return JSON response
  return res.json();
}
