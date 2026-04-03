// netlify/functions/shared/keap-helpers.js
// ═══════════════════════════════════════════════════════════════════════════
// KEAP INTEGRATION HELPERS FOR LIVE WORKSHOP PAGE
// ═══════════════════════════════════════════════════════════════════════════
//
// Shared helper functions for Keap CRM integration with dynamic tags.
//
// KEY FEATURES:
// - Dynamic tag creation based on webinar date
// - Finds existing tags or creates new ones (no duplicates)
// - Retry logic for robust API calls
// - Detailed logging for debugging
//
// ═══════════════════════════════════════════════════════════════════════════

const fetch = require('node-fetch');

// Import our utility modules
const { TRIGGER_TAGS, generateWebinarDateTag } = require('./tag-config');
const { withRetry } = require('./retry-utils');
const { TagOperationLogger } = require('./tag-logger');

const KEAP_API_BASE = 'https://api.infusionsoft.com/crm/rest/v1';

// ── Keap Contact Management ─────────────────────────────────────────

/**
 * Create a new contact or update an existing one by email.
 *
 * @param {string} accessToken - Keap API access token
 * @param {Object} contactData - Contact information
 * @param {string} contactData.firstName - First name
 * @param {string} contactData.lastName - Last name
 * @param {string} contactData.email - Email address
 * @param {string} [contactData.questions] - Optional questions/comments
 * @param {string} [contactData.webinarDate] - Webinar date in ISO format (e.g., "2026-03-18")
 * @returns {Promise<{id: number}>} Contact object with ID
 */
async function createOrUpdateContact(accessToken, contactData) {
  const { firstName, lastName, email, questions, webinarDate } = contactData;

  console.log('createOrUpdateContact called for:', email);

  // Search for existing contact
  const searchResponse = await fetch(
    `${KEAP_API_BASE}/contacts?email=${encodeURIComponent(email)}`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!searchResponse.ok) {
    throw new Error(`Failed to search for contact: ${searchResponse.status}`);
  }

  const searchData = await searchResponse.json();
  console.log('Contact search found:', searchData.contacts?.length || 0, 'contacts');

  // Build contact payload
  const payload = {
    given_name: firstName.trim(),
    family_name: lastName.trim(),
    email_addresses: [{ email: email, field: 'EMAIL1' }],
    opt_in_reason: 'Webinar registration form - Mastering The Paradox Process',
  };

  // Add custom fields if provided
  const customFields = [];

  const questionsFieldId = process.env.KEAP_QUESTIONS_FIELD_ID;
  if (questions && questionsFieldId) {
    customFields.push({ id: parseInt(questionsFieldId), content: questions });
  }

  if (webinarDate) {
    customFields.push({ id: 339, content: webinarDate });
  }

  if (customFields.length > 0) {
    payload.custom_fields = customFields;
  }

  let contact;

  if (searchData.contacts && searchData.contacts.length > 0) {
    // Update existing contact
    const contactId = searchData.contacts[0].id;
    console.log('Updating existing contact:', contactId);

    const updateResponse = await fetch(
      `${KEAP_API_BASE}/contacts/${contactId}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      throw new Error(`Failed to update contact: ${updateResponse.status} - ${errorText}`);
    }

    contact = await updateResponse.json();
    contact.id = contactId;
    console.log('Contact updated successfully');
  } else {
    // Create new contact
    console.log('Creating new contact...');

    const createResponse = await fetch(
      `${KEAP_API_BASE}/contacts`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      throw new Error(`Failed to create contact: ${createResponse.status} - ${errorText}`);
    }

    contact = await createResponse.json();
    console.log('Contact created:', contact.id);
  }

  return contact;
}

// ── Keap Tag Management ─────────────────────────────────────────────

/**
 * Search for an existing tag or create a new one.
 * This is the KEY function that enables dynamic tags!
 *
 * @param {string} accessToken - Keap API access token
 * @param {string} tagName - Name of the tag to find or create
 * @param {TagOperationLogger} [logger] - Optional logger for tracking operations
 * @returns {Promise<{id: number, name: string, wasCreated: boolean}>} Tag object with creation status
 */
async function createTag(accessToken, tagName, logger = null) {
  try {
    // Step 1: Search for existing tag (with retry)
    const searchData = await withRetry(async () => {
      const response = await fetch(
        `${KEAP_API_BASE}/tags?name=${encodeURIComponent(tagName)}`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );

      if (!response.ok) {
        const error = new Error(`Tag search failed: ${response.status}`);
        error.status = response.status;
        throw error;
      }

      return response.json();
    }, {
      maxRetries: 2,
      onRetry: (attempt, error) => {
        if (logger) logger.log(`Retrying tag search for "${tagName}" (attempt ${attempt})`, { error: error.message });
      }
    });

    // Use exact name match (Keap search is substring-based)
    const exactMatch = searchData.tags?.find(t => t.name === tagName);
    if (exactMatch) {
      if (logger) logger.logTagCreate(tagName, exactMatch.id, true, null, false);
      return { ...exactMatch, wasCreated: false };
    }

    // Step 2: Create new tag (with retry)
    const newTag = await withRetry(async () => {
      const response = await fetch(`${KEAP_API_BASE}/tags`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: tagName,
          description: `Auto-created for Paradox Process Webinar - ${new Date().toISOString()}`,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'no body');
        const error = new Error(`Tag creation failed: ${response.status} - ${errorBody}`);
        error.status = response.status;
        throw error;
      }

      return response.json();
    }, {
      maxRetries: 2,
      onRetry: (attempt, error) => {
        if (logger) logger.log(`Retrying tag creation for "${tagName}" (attempt ${attempt})`, { error: error.message });
      }
    });

    if (logger) logger.logTagCreate(tagName, newTag.id, true, null, true);
    return { ...newTag, wasCreated: true };

  } catch (error) {
    if (logger) logger.logTagCreate(tagName, null, false, error);
    throw error; // Re-throw so caller knows it failed
  }
}

/**
 * Create all tags needed for a webinar registration.
 * - One trigger tag (fires email automation)
 * - One date-specific tag (for tracking which webinar)
 *
 * @param {string} accessToken - Keap API access token
 * @param {string} webinarDate - ISO date string (e.g., "2026-03-18")
 * @param {TagOperationLogger} [logger] - Optional logger for tracking
 * @returns {Promise<{tagIds: number[], triggerTagIds: number[], tagNames: Map}>}
 */
async function createDynamicTags(accessToken, webinarDate, logger = null) {
  const tagIds = [];
  const triggerTagIds = []; // Tags that trigger email automations — need remove-then-apply
  const tagNames = new Map(); // Map tagId -> tagName for reference

  if (logger) logger.log('Creating dynamic tags', { webinarDate });

  // 1. Trigger tag - fires the email automation
  // This tag gets removed by Keap after emails are sent
  const triggerTag = await createTag(accessToken, TRIGGER_TAGS.WEBINAR_EMAILS, logger);
  tagIds.push(triggerTag.id);
  triggerTagIds.push(triggerTag.id);
  tagNames.set(triggerTag.id, TRIGGER_TAGS.WEBINAR_EMAILS);

  // 2. Date-specific tag - for tracking which webinar date
  const dateTagName = generateWebinarDateTag(webinarDate);
  const dateTag = await createTag(accessToken, dateTagName, logger);
  tagIds.push(dateTag.id);
  tagNames.set(dateTag.id, dateTagName);

  if (logger) logger.log('Tag creation complete', { totalTags: tagIds.length, triggerTags: triggerTagIds.length });

  return { tagIds, triggerTagIds, tagNames };
}

/**
 * Apply tags to a contact with retry logic and proper error tracking.
 *
 * @param {string} accessToken - Keap API access token
 * @param {string|number} contactId - Keap contact ID
 * @param {number[]} tagIds - All tag IDs to apply
 * @param {number[]} triggerTagIds - Tag IDs that fire automations (subset of tagIds)
 * @param {Map} [tagNames] - Map of tagId -> tagName for better logging
 * @param {TagOperationLogger} [logger] - Optional logger for tracking
 * @returns {Promise<{applied: number[], failed: Array, criticalFailure: boolean}>}
 */
async function applyTagsToContact(accessToken, contactId, tagIds, triggerTagIds = [], tagNames = new Map(), logger = null) {
  const results = {
    applied: [],
    failed: [],
    criticalFailure: false,
  };

  if (logger) logger.log('Starting tag application', { contactId, totalTags: tagIds.length, triggerTags: triggerTagIds.length });

  // Step 1: Remove trigger tags first so re-applying them re-fires the Keap automation
  // This allows returning customers to receive confirmation emails again
  for (const tagId of triggerTagIds) {
    const tagName = tagNames.get(tagId) || `ID:${tagId}`;

    try {
      await withRetry(async () => {
        const response = await fetch(
          `${KEAP_API_BASE}/contacts/${contactId}/tags/${tagId}`,
          {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${accessToken}` },
          }
        );

        // 404 is OK (tag wasn't on contact) - only retry on server errors
        if (!response.ok && response.status !== 404) {
          const error = new Error(`Tag removal failed: ${response.status}`);
          error.status = response.status;
          throw error;
        }

        return response;
      }, {
        maxRetries: 2,
        onRetry: (attempt, error) => {
          if (logger) logger.log(`Retrying tag removal for "${tagName}" (attempt ${attempt})`);
        }
      });

      if (logger) logger.logTagRemove(tagId, tagName, true);

    } catch (error) {
      // Tag removal failure is non-critical - we'll still try to apply the tag
      if (logger) logger.logTagRemove(tagId, tagName, false, error);
    }
  }

  // Step 2: Apply all tags
  for (const tagId of tagIds) {
    const tagName = tagNames.get(tagId) || `ID:${tagId}`;
    const isTrigger = triggerTagIds.includes(tagId);

    try {
      await withRetry(async () => {
        const response = await fetch(
          `${KEAP_API_BASE}/contacts/${contactId}/tags`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ tagIds: [tagId] }),
          }
        );

        if (!response.ok) {
          const errorBody = await response.text().catch(() => 'no body');
          const error = new Error(`Tag application failed: ${response.status} - ${errorBody}`);
          error.status = response.status;
          throw error;
        }

        return response;
      }, {
        maxRetries: 3, // More retries for application since this is critical
        onRetry: (attempt, error) => {
          if (logger) logger.log(`Retrying tag application for "${tagName}" (attempt ${attempt})`, { error: error.message });
        }
      });

      // Success!
      results.applied.push(tagId);
      if (logger) logger.logTagApply(tagId, tagName, true);

    } catch (error) {
      // Tag application failed even after retries
      results.failed.push({
        tagId,
        tagName,
        isTrigger,
        error: error.message,
        status: error.status,
      });

      if (logger) logger.logTagApply(tagId, tagName, false, error);

      // If a TRIGGER tag fails, mark as critical failure
      if (isTrigger) {
        results.criticalFailure = true;
        if (logger) logger.error(`CRITICAL: Trigger tag "${tagName}" failed to apply!`, error);
      }
    }
  }

  if (logger) {
    logger.log('Tag application complete', {
      applied: results.applied.length,
      failed: results.failed.length,
      criticalFailure: results.criticalFailure,
    });
  }

  return results;
}

// ── Keap Integration Orchestrator ───────────────────────────────────

/**
 * Main orchestrator for Keap integration.
 * Creates/updates contact, creates dynamic tags, applies tags.
 *
 * @param {Object} data - Registration data
 * @param {string} data.firstName - First name
 * @param {string} data.lastName - Last name
 * @param {string} data.email - Email address
 * @param {string} [data.questions] - Optional questions
 * @param {string} data.webinarDate - Webinar date (ISO format)
 * @returns {Promise<Object>} Detailed integration result
 */
async function integrateWithKeap(data) {
  const { firstName, lastName, email, questions, webinarDate } = data;

  // Create logger to track all operations for this customer
  const logger = new TagOperationLogger(email, 'webinar');
  logger.log('Starting Keap integration', { email, webinarDate });

  try {
    const accessToken = process.env.KEAP_ACCESS_TOKEN;
    if (!accessToken) {
      throw new Error('Keap Personal Access Token not configured');
    }

    // Step 1: Create or update contact
    logger.log('Creating/updating contact');
    const contact = await createOrUpdateContact(accessToken, {
      firstName,
      lastName,
      email,
      questions,
      webinarDate,
    });
    logger.setContactId(contact.id);
    logger.log('Contact created/updated successfully', { contactId: contact.id });

    // Step 2: Create dynamic tags based on webinar date
    const { tagIds, triggerTagIds, tagNames } = await createDynamicTags(
      accessToken,
      webinarDate,
      logger
    );

    // Step 3: Apply tags to contact
    const tagResults = await applyTagsToContact(
      accessToken,
      contact.id,
      tagIds,
      triggerTagIds,
      tagNames,
      logger
    );

    // Generate summary
    const summary = logger.getSummary();
    const statusMessage = logger.getStatusMessage();

    // Determine overall success
    const hasSuccess = tagResults.applied.length > 0;
    const hasCriticalFailure = tagResults.criticalFailure;
    const hasAnyFailure = tagResults.failed.length > 0;

    // Log final status
    console.log(`[KEAP] Integration complete for ${email}: ${statusMessage}`);
    if (hasCriticalFailure) {
      console.error(`[KEAP] CRITICAL FAILURE for ${email}:`, JSON.stringify(tagResults.failed.filter(f => f.isTrigger)));
    }

    return {
      // Overall status
      success: hasSuccess && !hasCriticalFailure,
      partialSuccess: hasSuccess && hasAnyFailure && !hasCriticalFailure,

      // Contact info
      contactId: contact.id,

      // Tagging details
      tagging: {
        total: tagIds.length,
        applied: tagResults.applied.length,
        failed: tagResults.failed.length,
        criticalFailure: hasCriticalFailure,
        failedTags: tagResults.failed,
      },

      // Status message (human-readable)
      statusMessage,

      // Full summary for debugging
      summary,
    };

  } catch (error) {
    const summary = logger.getSummary();
    logger.error('Keap integration failed', error);

    console.error(`[KEAP] Integration FAILED for ${email}:`, error.message);
    console.error('[KEAP] Operation summary:', JSON.stringify(summary, null, 2));

    return {
      success: false,
      partialSuccess: false,
      error: error.message,
      summary,
    };
  }
}

module.exports = {
  createOrUpdateContact,
  createTag,
  createDynamicTags,
  applyTagsToContact,
  integrateWithKeap,
};
