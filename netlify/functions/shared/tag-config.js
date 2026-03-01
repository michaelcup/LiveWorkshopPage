// netlify/functions/shared/tag-config.js
// ═══════════════════════════════════════════════════════════════════════════
// CENTRALIZED TAG CONFIGURATION FOR LIVE WORKSHOP PAGE
// ═══════════════════════════════════════════════════════════════════════════
//
// This file is the SINGLE SOURCE OF TRUTH for all Keap tag names.
//
// WHY THIS EXISTS:
// - Prevents typos (one wrong character creates a duplicate tag in Keap)
// - Makes renaming tags easy (change once here, works everywhere)
// - Documents all tags in one place for easy reference
// - Enables DYNAMIC tags based on webinar date
//
// HOW TO USE:
//   const { TRIGGER_TAGS, generateWebinarDateTag } = require('./tag-config');
//   const tagName = generateWebinarDateTag('2026-03-18');  // 'Webinar - March 18 2026'
//
// ═══════════════════════════════════════════════════════════════════════════

/**
 * TRIGGER TAGS
 * These tags fire Keap email automations when applied.
 * They use a "remove-then-apply" pattern so returning customers
 * can re-enter the automation workflow.
 *
 * WORKFLOW:
 * 1. Tag is applied → triggers email automation in Keap
 * 2. After emails are sent, Keap removes this tag
 * 3. Date-specific tag remains for tracking purposes
 */
const TRIGGER_TAGS = {
  // Applied after webinar registration - triggers confirmation email sequence
  // Keap automation should REMOVE this tag after emails are sent
  WEBINAR_EMAILS: 'Webinar - Emails In Progress',
};

/**
 * TAG PREFIXES
 * Used when generating dynamic date-based tags.
 */
const TAG_PREFIXES = {
  // For webinar date tracking
  WEBINAR: 'Webinar',
};

/**
 * Generate a date-specific webinar tag name.
 * Example: "Webinar - March 18 2026"
 *
 * WHY WE FORMAT DATES THIS WAY:
 * - Keap rejects commas in tag names, so we strip them
 * - Using a consistent format prevents duplicate tags
 *   (e.g., "Mar 18 2026" vs "March 18, 2026" would create TWO tags)
 *
 * @param {string} dateString - ISO date string (e.g., "2026-03-18")
 * @returns {string} Tag name like "Webinar - March 18 2026"
 */
function generateWebinarDateTag(dateString) {
  const date = new Date(dateString);

  // Format the date consistently
  const formattedDate = date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'  // Use UTC to avoid timezone shifts
  }).replace(/,/g, ''); // Remove commas (Keap doesn't allow them)

  return `${TAG_PREFIXES.WEBINAR} - ${formattedDate}`;
}

/**
 * Check if a tag name is a trigger tag (fires automations).
 * Useful for determining if a failed tag application is critical.
 *
 * @param {string} tagName - The tag name to check
 * @returns {boolean} True if this is a trigger tag
 */
function isTriggerTag(tagName) {
  return Object.values(TRIGGER_TAGS).includes(tagName);
}

/**
 * Get all trigger tag names as an array.
 * Useful for bulk operations.
 *
 * @returns {string[]} Array of trigger tag names
 */
function getAllTriggerTagNames() {
  return Object.values(TRIGGER_TAGS);
}

module.exports = {
  TRIGGER_TAGS,
  TAG_PREFIXES,
  generateWebinarDateTag,
  isTriggerTag,
  getAllTriggerTagNames,
};
