/**
 * Netlify Function: Keap Form Submission Handler
 * Handles both Workshop Registration and Corporate Contact forms
 * Uses Keap REST API v2
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
    return {
      statusCode: 200,
      headers,
      body: ''
    };
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
    // Get environment variables from Netlify
    const KEAP_ACCESS_TOKEN = process.env.KEAP_ACCESS_TOKEN;

    // Custom field IDs (set these in Netlify environment variables)
    const ROLE_FIELD_ID = process.env.KEAP_ROLE_FIELD_ID;
    const QUESTIONS_FIELD_ID = process.env.KEAP_QUESTIONS_FIELD_ID;
    const INTEREST_FIELD_ID = process.env.KEAP_INTEREST_FIELD_ID;
    const CHALLENGES_FIELD_ID = process.env.KEAP_CHALLENGES_FIELD_ID;
    const PREFERRED_CONTACT_FIELD_ID = process.env.KEAP_PREFERRED_CONTACT_FIELD_ID;

    // Tag IDs (set these in Netlify environment variables)
    const WORKSHOP_TAG_ID = process.env.KEAP_WORKSHOP_TAG_ID;
    const CORPORATE_TAG_ID = process.env.KEAP_CORPORATE_TAG_ID;

    if (!KEAP_ACCESS_TOKEN) {
      console.error('KEAP_ACCESS_TOKEN not set in environment variables');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ success: false, message: 'Server configuration error' })
      };
    }

    // Parse request body
    const data = JSON.parse(event.body);

    // Validate required fields
    if (!data.name || !data.email) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Name and email are required' })
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

    // Detect form type
    const isWorkshopForm = !data.organization;

    // Prepare contact data for Keap
    const nameParts = data.name.split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ') || '';

    const contactData = {
      given_name: firstName,
      family_name: lastName,
      email_addresses: [
        {
          email: data.email,
          field: 'EMAIL1'
        }
      ]
    };

    // Add form-specific fields
    const customFields = [];
    let tagIds = [];

    if (isWorkshopForm) {
      // Workshop Registration
      if (data.role && Array.isArray(data.role) && ROLE_FIELD_ID) {
        customFields.push({
          content: data.role.join(', '),
          id: parseInt(ROLE_FIELD_ID)
        });
      }
      if (data.questions && QUESTIONS_FIELD_ID) {
        customFields.push({
          content: data.questions,
          id: parseInt(QUESTIONS_FIELD_ID)
        });
      }
      if (WORKSHOP_TAG_ID) {
        tagIds = [parseInt(WORKSHOP_TAG_ID)];
      }
    } else {
      // Corporate Contact Form
      if (data.organization) {
        contactData.company = { company_name: data.organization };
      }
      if (data.phone) {
        contactData.phone_numbers = [
          {
            number: data.phone,
            field: 'PHONE1'
          }
        ];
      }
      if (data.interest && Array.isArray(data.interest) && INTEREST_FIELD_ID) {
        customFields.push({
          content: data.interest.join(', '),
          id: parseInt(INTEREST_FIELD_ID)
        });
      }
      if (data.challenges && CHALLENGES_FIELD_ID) {
        customFields.push({
          content: data.challenges,
          id: parseInt(CHALLENGES_FIELD_ID)
        });
      }
      if (data['contact-method'] && Array.isArray(data['contact-method']) && PREFERRED_CONTACT_FIELD_ID) {
        customFields.push({
          content: data['contact-method'].join(', '),
          id: parseInt(PREFERRED_CONTACT_FIELD_ID)
        });
      }
      if (CORPORATE_TAG_ID) {
        tagIds = [parseInt(CORPORATE_TAG_ID)];
      }
    }

    if (customFields.length > 0) {
      contactData.custom_fields = customFields;
    }

    const keapApiBase = 'https://api.infusionsoft.com/crm/rest/v2';

    // Search for existing contact by email
    const searchUrl = `${keapApiBase}/contacts?email=${encodeURIComponent(data.email)}`;
    const searchResponse = await keapApiCall(searchUrl, 'GET', null, KEAP_ACCESS_TOKEN);

    let contactId = null;

    if (searchResponse.contacts && searchResponse.contacts.length > 0) {
      // Update existing contact
      contactId = searchResponse.contacts[0].id;
      const updateUrl = `${keapApiBase}/contacts/${contactId}`;
      await keapApiCall(updateUrl, 'PATCH', contactData, KEAP_ACCESS_TOKEN);
    } else {
      // Create new contact
      const createUrl = `${keapApiBase}/contacts`;
      const createResponse = await keapApiCall(createUrl, 'POST', contactData, KEAP_ACCESS_TOKEN);
      contactId = createResponse.id;
    }

    if (!contactId) {
      throw new Error('Failed to create/update contact in Keap');
    }

    // Apply tags
    if (tagIds.length > 0) {
      const tagUrl = `${keapApiBase}/contacts/${contactId}/tags`;
      await keapApiCall(tagUrl, 'POST', { tagIds }, KEAP_ACCESS_TOKEN);
    }

    // Send notification email (using Netlify's email service or external service)
    // Note: You may want to use a service like SendGrid, Mailgun, or Keap's own email automation
    await sendNotificationEmail(data, isWorkshopForm);

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
        message: 'Failed to submit form. Please try again.'
      })
    };
  }
};

/**
 * Make API call to Keap REST API
 */
async function keapApiCall(url, method, data, accessToken) {
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  };

  if (data && ['POST', 'PUT', 'PATCH'].includes(method)) {
    options.body = JSON.stringify(data);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Keap API error (${response.status}): ${errorText}`);
  }

  // Handle empty responses
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

/**
 * Send notification email
 * You can use SendGrid, Mailgun, or another email service
 * Or rely on Keap's campaign automation to send notifications
 */
async function sendNotificationEmail(data, isWorkshopForm) {
  // Option 1: Use an email service like SendGrid
  // Requires SENDGRID_API_KEY environment variable

  // Option 2: Use Keap's built-in email automation instead
  // This is often the easier approach - just set up a campaign in Keap
  // that triggers when the tags are applied

  // For now, this is a placeholder
  // Uncomment and configure if you want to send emails from here

  /*
  const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
  if (!SENDGRID_API_KEY) {
    console.warn('SENDGRID_API_KEY not set, skipping email notification');
    return;
  }

  const subject = isWorkshopForm
    ? 'New Workshop Registration - December 10th'
    : 'New Corporate Contact Form Submission';

  let emailBody = `You have a new form submission:\n\nName: ${data.name}\nEmail: ${data.email}\n`;

  if (isWorkshopForm) {
    emailBody += `Role(s): ${data.role ? data.role.join(', ') : 'N/A'}\n`;
    emailBody += `What they hope to learn: ${data.questions || 'N/A'}\n`;
  } else {
    emailBody += `Organization: ${data.organization || 'N/A'}\n`;
    emailBody += `Phone: ${data.phone || 'N/A'}\n`;
    emailBody += `Interested in: ${data.interest ? data.interest.join(', ') : 'N/A'}\n`;
    emailBody += `Challenges: ${data.challenges || 'N/A'}\n`;
    emailBody += `Preferred contact: ${data['contact-method'] ? data['contact-method'].join(', ') : 'N/A'}\n`;
  }

  await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SENDGRID_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      personalizations: [{
        to: [{ email: 'info@paradoxprocess.org' }],
        subject
      }],
      from: { email: 'noreply@paradoxprocess.org' },
      content: [{
        type: 'text/plain',
        value: emailBody
      }]
    })
  });
  */
}
