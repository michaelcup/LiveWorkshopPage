/**
 * Netlify Function: Keap Form Submission Handler
 * Uses Keap REST API v1 with Personal Access Token
 */

const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
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
    // Get environment variables
    const KEAP_ACCESS_TOKEN = process.env.KEAP_ACCESS_TOKEN;
    const ROLE_FIELD_ID = process.env.KEAP_ROLE_FIELD_ID;
    const QUESTIONS_FIELD_ID = process.env.KEAP_QUESTIONS_FIELD_ID;
    const WORKSHOP_TAG_ID = process.env.KEAP_WORKSHOP_TAG_ID;

    if (!KEAP_ACCESS_TOKEN) {
      console.error('KEAP_ACCESS_TOKEN not set');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ success: false, message: 'Server configuration error' })
      };
    }

    // Parse request body
    const data = JSON.parse(event.body);

    // Validate required fields
    if (!data['first-name'] || !data['last-name'] || !data.email) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'First name, last name, and email are required' })
      };
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Invalid email address' })
      };
    }

    // Prepare contact data for Keap REST API v1
    // Build contact object for Keap v1 API
    const contactData = {
      given_name: data['first-name'].trim(),
      family_name: data['last-name'].trim(),
      email_addresses: [
        {
          email: data.email,
          field: 'EMAIL1'
        }
      ],
      opt_in_reason: 'Workshop registration form - December 10th Live Workshop'
    };

    // Add custom fields if provided
    const customFields = [];

    if (data.role && Array.isArray(data.role) && ROLE_FIELD_ID) {
      customFields.push({
        id: parseInt(ROLE_FIELD_ID),
        content: data.role.join(', ')
      });
    }

    if (data.questions && QUESTIONS_FIELD_ID) {
      customFields.push({
        id: parseInt(QUESTIONS_FIELD_ID),
        content: data.questions
      });
    }

    if (customFields.length > 0) {
      contactData.custom_fields = customFields;
    }

    const keapApiBase = 'https://api.infusionsoft.com/crm/rest/v1';

    // First, try to find existing contact by email
    console.log('Searching for existing contact...');
    const searchUrl = `${keapApiBase}/contacts?email=${encodeURIComponent(data.email)}`;
    const searchResponse = await keapApiCall(searchUrl, 'GET', null, KEAP_ACCESS_TOKEN);

    let contactId = null;

    if (searchResponse.contacts && searchResponse.contacts.length > 0) {
      // Update existing contact
      contactId = searchResponse.contacts[0].id;
      console.log('Found existing contact:', contactId);

      const updateUrl = `${keapApiBase}/contacts/${contactId}`;
      await keapApiCall(updateUrl, 'PATCH', contactData, KEAP_ACCESS_TOKEN);
      console.log('Updated contact');
    } else {
      // Create new contact
      console.log('Creating new contact...');
      const createUrl = `${keapApiBase}/contacts`;
      const createResponse = await keapApiCall(createUrl, 'POST', contactData, KEAP_ACCESS_TOKEN);
      contactId = createResponse.id;
      console.log('Created contact:', contactId);
    }

    if (!contactId) {
      throw new Error('Failed to create/update contact in Keap');
    }

    // Apply tag if configured
    if (WORKSHOP_TAG_ID) {
      console.log('Applying tag:', WORKSHOP_TAG_ID);
      const tagUrl = `${keapApiBase}/contacts/${contactId}/tags`;
      await keapApiCall(tagUrl, 'POST', { tagIds: [parseInt(WORKSHOP_TAG_ID)] }, KEAP_ACCESS_TOKEN);
      console.log('Tag applied');
    }

    // Success response
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Form submitted successfully',
        contactId
      })
    };

  } catch (error) {
    console.error('Keap submission error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        message: 'Failed to submit form. Please try again.',
        error: error.message
      })
    };
  }
};

/**
 * Make API call to Keap REST API v1
 */
async function keapApiCall(url, method, data, accessToken) {
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }
  };

  if (data && ['POST', 'PUT', 'PATCH'].includes(method)) {
    options.body = JSON.stringify(data);
  }

  console.log(`Making ${method} request to: ${url}`);
  const response = await fetch(url, options);

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`API error: ${response.status} - ${errorText}`);
    throw new Error(`Keap API error (${response.status}): ${errorText}`);
  }

  // Handle empty responses
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}
