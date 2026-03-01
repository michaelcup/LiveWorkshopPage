// netlify/functions/shared/retry-utils.js
// ═══════════════════════════════════════════════════════════════════════════
// RETRY UTILITIES WITH EXPONENTIAL BACKOFF
// ═══════════════════════════════════════════════════════════════════════════
//
// This file provides retry logic for API calls that might fail temporarily.
//
// WHY THIS EXISTS:
// - Network requests can fail for temporary reasons (network hiccup, server overload)
// - Without retry logic, a 500ms network glitch could break a registration
// - "Exponential backoff" means we wait longer between each retry, giving
//   overloaded servers time to recover
//
// HOW IT WORKS:
//   Attempt 1: Try immediately
//   Attempt 2: Wait 200ms, then try
//   Attempt 3: Wait 400ms, then try
//   Attempt 4: Wait 800ms, then try
//   (Each wait is 2x the previous, hence "exponential")
//
// HOW TO USE:
//   const { withRetry } = require('./retry-utils');
//
//   const result = await withRetry(async () => {
//     const response = await fetch('https://api.example.com/data');
//     if (!response.ok) throw new Error('Request failed');
//     return response.json();
//   });
//
// ═══════════════════════════════════════════════════════════════════════════

/**
 * HTTP status codes that indicate temporary failures worth retrying.
 *
 * 429 = Rate Limited (too many requests - wait and try again)
 * 500 = Internal Server Error (server had a problem)
 * 502 = Bad Gateway (server's upstream failed)
 * 503 = Service Unavailable (server is overloaded)
 * 504 = Gateway Timeout (upstream took too long)
 */
const RETRYABLE_STATUS_CODES = [429, 500, 502, 503, 504];

/**
 * Status codes that should NOT be retried (permanent failures).
 *
 * 400 = Bad Request (our request is malformed)
 * 401 = Unauthorized (bad API key)
 * 403 = Forbidden (not allowed)
 * 404 = Not Found (resource doesn't exist)
 * 422 = Unprocessable Entity (validation error)
 */
const NON_RETRYABLE_STATUS_CODES = [400, 401, 403, 404, 422];

/**
 * Default configuration for retry behavior.
 */
const DEFAULT_OPTIONS = {
  maxRetries: 3,          // Try up to 4 times total (1 initial + 3 retries)
  baseDelayMs: 200,       // Start with 200ms delay
  maxDelayMs: 2000,       // Never wait more than 2 seconds
  retryableStatuses: RETRYABLE_STATUS_CODES,
};

/**
 * Execute an async function with automatic retry on failure.
 *
 * @param {Function} fn - Async function to execute. Should throw on failure.
 * @param {Object} [options] - Configuration options
 * @param {number} [options.maxRetries=3] - Maximum retry attempts
 * @param {number} [options.baseDelayMs=200] - Initial delay between retries (ms)
 * @param {number} [options.maxDelayMs=2000] - Maximum delay between retries (ms)
 * @param {number[]} [options.retryableStatuses] - HTTP status codes to retry
 * @param {Function} [options.onRetry] - Callback called before each retry
 * @returns {Promise<*>} Result of the function
 * @throws {Error} If all retries fail
 *
 * @example
 * // Basic usage
 * const data = await withRetry(async () => {
 *   const res = await fetch(url);
 *   if (!res.ok) {
 *     const err = new Error('Failed');
 *     err.status = res.status;
 *     throw err;
 *   }
 *   return res.json();
 * });
 *
 * @example
 * // With custom options
 * const data = await withRetry(fetchData, {
 *   maxRetries: 5,
 *   onRetry: (attempt, error) => console.log(`Retry ${attempt}: ${error.message}`)
 * });
 */
async function withRetry(fn, options = {}) {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const { maxRetries, baseDelayMs, maxDelayMs, retryableStatuses, onRetry } = config;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Attempt the operation
      return await fn();

    } catch (error) {
      lastError = error;

      // Extract status code from error (can be set by caller)
      const status = error.status || error.statusCode || error.response?.status;

      // Check if this error is retryable
      const isRetryable = isRetryableError(error, status, retryableStatuses);

      // If not retryable or we've exhausted retries, give up
      if (!isRetryable || attempt === maxRetries) {
        // Add retry info to error for debugging
        error.retriesAttempted = attempt;
        error.wasRetryable = isRetryable;
        throw error;
      }

      // Calculate delay with exponential backoff
      // Formula: baseDelay * 2^attempt
      // Attempt 0: 200ms, Attempt 1: 400ms, Attempt 2: 800ms, etc.
      const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);

      // Add small random jitter (±10%) to prevent thundering herd
      // (If many requests fail at once, we don't want them all retrying at exact same time)
      const jitter = delay * 0.1 * (Math.random() - 0.5);
      const actualDelay = Math.round(delay + jitter);

      // Call onRetry callback if provided
      if (onRetry) {
        onRetry(attempt + 1, error, actualDelay);
      }

      // Wait before next attempt
      await sleep(actualDelay);
    }
  }

  // Should never reach here, but just in case
  throw lastError;
}

/**
 * Determine if an error is worth retrying.
 *
 * @param {Error} error - The error that occurred
 * @param {number|undefined} status - HTTP status code if available
 * @param {number[]} retryableStatuses - List of status codes to retry
 * @returns {boolean} True if the operation should be retried
 */
function isRetryableError(error, status, retryableStatuses) {
  // Network errors (no status) are usually retryable
  if (!status) {
    // Check for specific non-retryable error types
    const message = error.message?.toLowerCase() || '';

    // Authentication/authorization errors aren't retryable
    if (message.includes('unauthorized') || message.includes('forbidden')) {
      return false;
    }

    // Network errors are retryable
    if (message.includes('network') ||
        message.includes('timeout') ||
        message.includes('econnreset') ||
        message.includes('econnrefused')) {
      return true;
    }

    // Default: retry if no status (might be transient)
    return true;
  }

  // Check if status is in our retryable list
  return retryableStatuses.includes(status);
}

/**
 * Simple sleep/delay function.
 *
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a fetch wrapper that includes retry logic.
 * This is a convenience function for common HTTP requests.
 *
 * @param {string} url - URL to fetch
 * @param {Object} [fetchOptions] - Standard fetch options (method, headers, body, etc.)
 * @param {Object} [retryOptions] - Retry configuration options
 * @returns {Promise<Response>} Fetch response
 * @throws {Error} If all retries fail
 *
 * @example
 * const response = await fetchWithRetry('https://api.example.com/data', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({ foo: 'bar' })
 * });
 */
async function fetchWithRetry(url, fetchOptions = {}, retryOptions = {}) {
  return withRetry(async () => {
    const response = await fetch(url, fetchOptions);

    // If response is not OK, throw with status for retry logic
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
      error.status = response.status;
      error.response = response;

      // Try to get error body for debugging
      try {
        error.body = await response.text();
      } catch {
        error.body = 'Could not read response body';
      }

      throw error;
    }

    return response;
  }, retryOptions);
}

module.exports = {
  withRetry,
  fetchWithRetry,
  isRetryableError,
  sleep,
  RETRYABLE_STATUS_CODES,
  NON_RETRYABLE_STATUS_CODES,
  DEFAULT_OPTIONS,
};
