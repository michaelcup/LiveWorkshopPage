// netlify/functions/shared/tag-logger.js
// ═══════════════════════════════════════════════════════════════════════════
// TAG OPERATION LOGGER
// ═══════════════════════════════════════════════════════════════════════════
//
// This file provides structured logging for tag operations.
//
// WHY THIS EXISTS:
// - When a customer reports "I didn't get my confirmation email", you need
//   to know EXACTLY what happened: Which tags applied? Which failed? Why?
// - The old code just logged "Failed to apply tag 12345" with no context
// - This logger tracks everything with timestamps, customer info, and results
//
// HOW TO USE:
//   const { TagOperationLogger } = require('./tag-logger');
//
//   const logger = new TagOperationLogger('customer@email.com', 'webinar');
//   logger.logTagCreate('Webinar - March 18 2026', 123, true);
//   logger.logTagApply(123, 'Webinar - March 18 2026', false, new Error('API error'));
//   console.log(logger.getSummary());
//
// ═══════════════════════════════════════════════════════════════════════════

const { isTriggerTag } = require('./tag-config');

/**
 * Logger class that tracks all tag operations for a single customer transaction.
 *
 * Creates a detailed audit trail of:
 * - Tag creations (search + create if needed)
 * - Tag applications (adding tags to contact)
 * - Tag removals (for trigger tag re-application)
 * - Any errors that occurred
 */
class TagOperationLogger {
  /**
   * Create a new logger for a customer transaction.
   *
   * @param {string} customerEmail - Customer's email (for identification)
   * @param {string} operationType - 'webinar' for webinar registrations
   * @param {string} [contactId] - Keap contact ID (if known at creation time)
   */
  constructor(customerEmail, operationType, contactId = null) {
    this.customerEmail = customerEmail;
    this.operationType = operationType;
    this.contactId = contactId;
    this.operations = [];
    this.startTime = Date.now();

    // Track tag names for better error messages
    this.tagNameMap = new Map(); // tagId -> tagName
  }

  /**
   * Set the contact ID (useful when contact is created during the flow).
   * @param {string|number} contactId - Keap contact ID
   */
  setContactId(contactId) {
    this.contactId = contactId;
  }

  /**
   * Log a tag creation operation (searching for or creating a tag).
   *
   * @param {string} tagName - Name of the tag
   * @param {number|null} tagId - Tag ID if successful, null if failed
   * @param {boolean} success - Whether the operation succeeded
   * @param {Error|null} [error] - Error if operation failed
   * @param {boolean} [wasCreated] - True if tag was created, false if found existing
   */
  logTagCreate(tagName, tagId, success, error = null, wasCreated = false) {
    if (tagId) {
      this.tagNameMap.set(tagId, tagName);
    }

    this.operations.push({
      action: 'create',
      tagName,
      tagId,
      success,
      wasCreated, // Useful for knowing if we created new vs found existing
      isTrigger: isTriggerTag(tagName),
      error: error ? this._formatError(error) : null,
      timestamp: Date.now(),
      elapsed: Date.now() - this.startTime,
    });

    // Log to console for Netlify function logs
    if (success) {
      console.log(`[TAG] ${wasCreated ? 'Created' : 'Found'} tag: "${tagName}" (ID: ${tagId})`);
    } else {
      console.error(`[TAG] Failed to create tag: "${tagName}"`, error?.message);
    }
  }

  /**
   * Log a tag application operation (adding tag to contact).
   *
   * @param {number} tagId - Tag ID being applied
   * @param {string} [tagName] - Tag name (optional, will use cached if not provided)
   * @param {boolean} success - Whether the operation succeeded
   * @param {Error|null} [error] - Error if operation failed
   */
  logTagApply(tagId, tagName = null, success, error = null) {
    const name = tagName || this.tagNameMap.get(tagId) || `Unknown (ID: ${tagId})`;

    this.operations.push({
      action: 'apply',
      tagId,
      tagName: name,
      success,
      isTrigger: isTriggerTag(name),
      error: error ? this._formatError(error) : null,
      timestamp: Date.now(),
      elapsed: Date.now() - this.startTime,
    });

    // Log to console
    if (success) {
      console.log(`[TAG] Applied tag: "${name}" (ID: ${tagId}) to contact ${this.contactId}`);
    } else {
      console.error(`[TAG] Failed to apply tag: "${name}" (ID: ${tagId}) to contact ${this.contactId}`, error?.message);
    }
  }

  /**
   * Log a tag removal operation (removing tag from contact before re-applying).
   *
   * @param {number} tagId - Tag ID being removed
   * @param {string} [tagName] - Tag name
   * @param {boolean} success - Whether the operation succeeded
   * @param {Error|null} [error] - Error if operation failed
   * @param {string} [reason] - Why the tag was removed (e.g., 'trigger_reset')
   */
  logTagRemove(tagId, tagName = null, success, error = null, reason = 'trigger_reset') {
    const name = tagName || this.tagNameMap.get(tagId) || `Unknown (ID: ${tagId})`;

    this.operations.push({
      action: 'remove',
      tagId,
      tagName: name,
      success,
      reason,
      isTrigger: isTriggerTag(name),
      error: error ? this._formatError(error) : null,
      timestamp: Date.now(),
      elapsed: Date.now() - this.startTime,
    });

    // Log to console (removals are expected to sometimes "fail" if tag wasn't on contact)
    if (success) {
      console.log(`[TAG] Removed tag: "${name}" (ID: ${tagId}) from contact ${this.contactId}`);
    } else {
      // Don't log as error since 404 (tag not on contact) is expected
      console.log(`[TAG] Tag removal skipped/failed: "${name}" - ${error?.message || 'unknown reason'}`);
    }
  }

  /**
   * Log a general message (for debugging or info).
   *
   * @param {string} message - Message to log
   * @param {Object} [data] - Additional data to include
   */
  log(message, data = null) {
    this.operations.push({
      action: 'info',
      message,
      data,
      timestamp: Date.now(),
      elapsed: Date.now() - this.startTime,
    });
    console.log(`[TAG] ${message}`, data ? JSON.stringify(data) : '');
  }

  /**
   * Log a warning (non-critical issue).
   *
   * @param {string} message - Warning message
   * @param {Object} [data] - Additional data
   */
  warn(message, data = null) {
    this.operations.push({
      action: 'warning',
      message,
      data,
      timestamp: Date.now(),
      elapsed: Date.now() - this.startTime,
    });
    console.warn(`[TAG WARNING] ${message}`, data ? JSON.stringify(data) : '');
  }

  /**
   * Log an error (critical issue).
   *
   * @param {string} message - Error message
   * @param {Error|null} [error] - Error object
   */
  error(message, error = null) {
    this.operations.push({
      action: 'error',
      message,
      error: error ? this._formatError(error) : null,
      timestamp: Date.now(),
      elapsed: Date.now() - this.startTime,
    });
    console.error(`[TAG ERROR] ${message}`, error);
  }

  /**
   * Get a comprehensive summary of all operations.
   * Useful for debugging and returning to calling code.
   *
   * @returns {Object} Summary object with counts and details
   */
  getSummary() {
    const createOps = this.operations.filter(o => o.action === 'create');
    const applyOps = this.operations.filter(o => o.action === 'apply');
    const removeOps = this.operations.filter(o => o.action === 'remove');

    const successfulCreates = createOps.filter(o => o.success);
    const failedCreates = createOps.filter(o => !o.success);
    const successfulApplies = applyOps.filter(o => o.success);
    const failedApplies = applyOps.filter(o => !o.success);

    // Check for critical failures (trigger tags that failed)
    const criticalFailures = failedApplies.filter(o => o.isTrigger);
    const hasCriticalFailure = criticalFailures.length > 0;

    return {
      // Identification
      customer: this.customerEmail,
      contactId: this.contactId,
      type: this.operationType,

      // Timing
      startTime: new Date(this.startTime).toISOString(),
      duration: Date.now() - this.startTime,

      // Counts
      totalOperations: this.operations.length,
      tagsCreated: successfulCreates.length,
      tagsApplied: successfulApplies.length,
      tagsRemoved: removeOps.filter(o => o.success).length,

      // Failures
      createFailures: failedCreates.length,
      applyFailures: failedApplies.length,
      hasCriticalFailure,
      criticalFailureCount: criticalFailures.length,

      // Details for debugging
      failedOperations: [
        ...failedCreates.map(o => ({ ...o, type: 'create' })),
        ...failedApplies.map(o => ({ ...o, type: 'apply' })),
      ],
      criticalFailures: criticalFailures.map(o => ({
        tagName: o.tagName,
        tagId: o.tagId,
        error: o.error,
      })),

      // Full operation log (for detailed debugging)
      allOperations: this.operations,
    };
  }

  /**
   * Get a human-readable status message.
   * Useful for logging or showing to users.
   *
   * @returns {string} Status message
   */
  getStatusMessage() {
    const summary = this.getSummary();

    if (summary.hasCriticalFailure) {
      return `CRITICAL: ${summary.criticalFailureCount} trigger tag(s) failed to apply. ` +
             `Customer may not receive confirmation emails. ` +
             `Failed tags: ${summary.criticalFailures.map(f => f.tagName).join(', ')}`;
    }

    if (summary.applyFailures > 0) {
      return `WARNING: ${summary.applyFailures} tag(s) failed to apply, but no critical failures. ` +
             `Customer should receive emails but tracking may be incomplete.`;
    }

    if (summary.createFailures > 0) {
      return `WARNING: ${summary.createFailures} tag(s) could not be created. ` +
             `Some tags were not applied.`;
    }

    return `SUCCESS: All ${summary.tagsApplied} tags applied successfully in ${summary.duration}ms.`;
  }

  /**
   * Format an error object for storage.
   * @private
   */
  _formatError(error) {
    return {
      message: error.message,
      status: error.status || error.statusCode,
      stack: error.stack?.split('\n').slice(0, 3).join('\n'), // First 3 lines of stack
    };
  }
}

/**
 * Create a simple logger function for one-off logging.
 * Useful when you don't need the full TagOperationLogger class.
 *
 * @param {string} prefix - Prefix for log messages
 * @returns {Object} Logger with log, warn, error methods
 */
function createSimpleLogger(prefix) {
  return {
    log: (message, data) => console.log(`[${prefix}] ${message}`, data || ''),
    warn: (message, data) => console.warn(`[${prefix} WARNING] ${message}`, data || ''),
    error: (message, error) => console.error(`[${prefix} ERROR] ${message}`, error || ''),
  };
}

module.exports = {
  TagOperationLogger,
  createSimpleLogger,
};
