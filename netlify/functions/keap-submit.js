/**
 * Netlify Function: Keap Form Submission Handler
 * ═══════════════════════════════════════════════════════════════════════════
 * Uses Keap REST API v1 with Personal Access Token
 *
 * DYNAMIC TAG SYSTEM:
 * - Automatically creates tags based on webinar date
 * - Tag format: "Webinar - March 18 2026"
 * - Finds existing tag if it already exists (no duplicates)
 * - Also applies a trigger tag for email automations
 *
 * REQUIRED ENV VARS:
 * - KEAP_ACCESS_TOKEN: Your Keap Personal Access Token
 * - KEAP_QUESTIONS_FIELD_ID: (optional) Custom field ID for questions
 *
 * NO LONGER NEEDED:
 * - KEAP_WORKSHOP_TAG_ID: Now dynamically generated from webinar date!
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { integrateWithKeap } = require('./shared/keap-helpers');

// Allowed origins for CORS - only these domains can submit forms
const ALLOWED_ORIGINS = [
  'https://liveworkshop.paradoxprocess.org',
  'http://localhost:8888',  // Netlify Dev
  'http://localhost:3000',  // Local development
];

exports.handler = async (event, context) => {
  // Get the origin of the request
  const origin = event.headers.origin || event.headers.Origin || '';

  // Only allow requests from approved domains
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  // Set CORS headers - restricted to specific domains
  const headers = {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, message: 'Method not allowed' })
    };
  }

  try {
    // Security: Limit request body size to prevent DoS attacks
    // A legitimate registration form should never exceed 10KB
    const MAX_BODY_SIZE = 10 * 1024; // 10KB
    if (event.body && event.body.length > MAX_BODY_SIZE) {
      console.warn('Request body too large:', event.body.length, 'bytes');
      return {
        statusCode: 413,
        headers,
        body: JSON.stringify({ success: false, message: 'Request too large' })
      };
    }

    // Check for access token
    if (!process.env.KEAP_ACCESS_TOKEN) {
      console.error('KEAP_ACCESS_TOKEN not set');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ success: false, message: 'Server configuration error' })
      };
    }

    // Parse request body
    const data = JSON.parse(event.body);

    // Security: Server-side honeypot validation
    // The "website" field is hidden from real users but bots often fill it
    // If it has a value, this is likely a spam bot - reject silently
    if (data.website) {
      console.warn('Honeypot triggered - likely bot submission');
      // Return 200 so bots think they succeeded (don't give them feedback)
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, message: 'Form submitted' })
      };
    }

    // Sanitize and validate all inputs
    // Trim whitespace and validate lengths to prevent junk data
    const firstName = (data['first-name'] || '').trim();
    const lastName = (data['last-name'] || '').trim();
    const questions = (data.questions || '').trim();

    // Validate required fields exist after trimming
    if (!firstName || !lastName || !data.email) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'First name, last name, and email are required' })
      };
    }

    // Validate name lengths (min 2, max 50 characters)
    if (firstName.length < 2 || firstName.length > 50) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'First name must be 2-50 characters' })
      };
    }
    if (lastName.length < 2 || lastName.length > 50) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Last name must be 2-50 characters' })
      };
    }

    // Validate questions length (max 2000 characters)
    if (questions.length > 2000) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Questions field is too long (max 2000 characters)' })
      };
    }

    // Update data with sanitized values
    data['first-name'] = firstName;
    data['last-name'] = lastName;
    data.questions = questions;

    // Validate email format with stricter regex
    // This catches common invalid patterns like "a@b.c" or "test@.com"
    // Requires: 2+ chars before @, valid domain with 2+ char TLD
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
    const email = data.email.trim().toLowerCase();

    if (!emailRegex.test(email) || email.length < 6) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Please enter a valid email address' })
      };
    }

    // Update data with normalized email
    data.email = email;

    // Validate webinar date is provided
    if (!data.webinarDate) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Webinar date is required' })
      };
    }

    console.log('Processing webinar registration:', {
      email: data.email,
      webinarDate: data.webinarDate
    });

    // Use the integrated Keap helper with dynamic tags
    const result = await integrateWithKeap({
      firstName: data['first-name'],
      lastName: data['last-name'],
      email: data.email,
      questions: data.questions || null,
      webinarDate: data.webinarDate,
    });

    if (!result.success) {
      // Check if it's a partial success (contact created but some tags failed)
      if (result.partialSuccess) {
        console.warn('Partial success - contact created but some tags failed:', result.statusMessage);
        // Use 202 Accepted - request was processed but with caveats
        // This lets the front-end know to show a warning
        return {
          statusCode: 202,
          headers,
          body: JSON.stringify({
            success: true,
            partialSuccess: true,
            message: 'You are registered! However, our confirmation email system experienced an issue. If you don\'t receive a confirmation email within 10 minutes, please contact us.',
            contactId: result.contactId
          })
        };
      }

      // Full failure
      throw new Error(result.error || result.statusMessage || 'Unknown error');
    }

    // Full success
    console.log('Registration successful:', result.statusMessage);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Form submitted successfully',
        contactId: result.contactId
      })
    };

  } catch (error) {
    // Log full error details server-side for debugging
    console.error('Keap submission error:', {
      message: error.message,
      stack: error.stack,
      // Don't log sensitive data like email addresses
    });

    // Return generic error to user - don't expose internal details
    // This prevents attackers from learning about our API structure
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        message: 'Registration failed. Please try again or contact support.'
        // Note: We intentionally don't include error.message here
      })
    };
  }
};
