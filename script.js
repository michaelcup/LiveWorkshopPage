// Form Validation and Submission Handler
document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('corporate-contact-form');
    const submitButton = document.getElementById('submit-button');
    const buttonText = submitButton.querySelector('.button-text');
    const buttonLoading = submitButton.querySelector('.button-loading');
    const formSuccess = document.getElementById('form-success');
    const formError = document.getElementById('form-error');

    // Detect which form type we're on
    const isWorkshopForm = !document.getElementById('organization');

    // Validation functions
    const validators = {
        name: function(value) {
            if (!value.trim()) {
                return 'Please enter your name';
            }
            if (value.trim().length < 2) {
                return 'Name must be at least 2 characters';
            }
            return null;
        },
        organization: function(value) {
            if (!value.trim()) {
                return 'Please enter your organization name';
            }
            return null;
        },
        email: function(value) {
            if (!value.trim()) {
                return 'Please enter your email address';
            }
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(value)) {
                return 'Please enter a valid email address';
            }
            return null;
        },
        interest: function() {
            const checkboxes = document.querySelectorAll('input[name="interest"]:checked');
            if (checkboxes.length === 0) {
                return 'Please select at least one option';
            }
            return null;
        },
        role: function() {
            const checkboxes = document.querySelectorAll('input[name="role"]:checked');
            if (checkboxes.length === 0) {
                return 'Please select at least one option';
            }
            return null;
        }
    };

    // Show error message
    function showError(fieldName, message) {
        const field = document.getElementById(fieldName) || document.querySelector(`input[name="${fieldName}"]`);
        const errorElement = document.getElementById(`${fieldName}-error`);

        if (field) {
            field.classList.add('error');
            field.setAttribute('aria-invalid', 'true');
        }

        if (errorElement) {
            errorElement.textContent = message;
            errorElement.classList.add('show');
        }
    }

    // Clear error message
    function clearError(fieldName) {
        const field = document.getElementById(fieldName) || document.querySelector(`input[name="${fieldName}"]`);
        const errorElement = document.getElementById(`${fieldName}-error`);

        if (field) {
            field.classList.remove('error');
            field.setAttribute('aria-invalid', 'false');
        }

        if (errorElement) {
            errorElement.textContent = '';
            errorElement.classList.remove('show');
        }
    }

    // Clear all checkboxes error
    function clearCheckboxError(fieldName) {
        const checkboxes = document.querySelectorAll(`input[name="${fieldName}"]`);
        checkboxes.forEach(checkbox => {
            checkbox.classList.remove('error');
            checkbox.setAttribute('aria-invalid', 'false');
        });

        const errorElement = document.getElementById(`${fieldName}-error`);
        if (errorElement) {
            errorElement.textContent = '';
            errorElement.classList.remove('show');
        }
    }

    // Real-time validation for text inputs
    ['name', 'organization', 'email'].forEach(fieldName => {
        const field = document.getElementById(fieldName);
        if (field) {
            field.addEventListener('blur', function() {
                const error = validators[fieldName](this.value);
                if (error) {
                    showError(fieldName, error);
                } else {
                    clearError(fieldName);
                }
            });

            // Clear error on input
            field.addEventListener('input', function() {
                if (this.classList.contains('error')) {
                    clearError(fieldName);
                }
            });
        }
    });

    // Real-time validation for checkboxes
    const interestCheckboxes = document.querySelectorAll('input[name="interest"]');
    interestCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            clearCheckboxError('interest');
        });
    });

    // Real-time validation for role checkboxes (workshop form)
    const roleCheckboxes = document.querySelectorAll('input[name="role"]');
    roleCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            clearCheckboxError('role');
        });
    });

    // Form submission
    form.addEventListener('submit', async function(e) {
        e.preventDefault();

        // Check honeypot field (spam protection)
        const honeypot = document.getElementById('website');
        if (honeypot && honeypot.value !== '') {
            // Silently fail - likely a bot
            console.log('Spam detected');
            return;
        }

        // Hide previous messages
        formSuccess.style.display = 'none';
        formError.style.display = 'none';

        // Validate all fields
        let isValid = true;
        const errors = {};

        // Validate required text fields based on form type
        const requiredFields = isWorkshopForm
            ? ['name', 'email']
            : ['name', 'organization', 'email'];

        requiredFields.forEach(fieldName => {
            const field = document.getElementById(fieldName);
            if (field) {
                const error = validators[fieldName](field.value);
                if (error) {
                    errors[fieldName] = error;
                    showError(fieldName, error);
                    isValid = false;
                } else {
                    clearError(fieldName);
                }
            }
        });

        // Validate checkboxes based on form type
        if (isWorkshopForm) {
            // Validate role checkboxes for workshop form
            const roleError = validators.role();
            if (roleError) {
                errors.role = roleError;
                showError('role', roleError);
                isValid = false;
            } else {
                clearCheckboxError('role');
            }
        } else {
            // Validate interest checkboxes for corporate form
            const interestError = validators.interest();
            if (interestError) {
                errors.interest = interestError;
                showError('interest', interestError);
                isValid = false;
            } else {
                clearCheckboxError('interest');
            }
        }

        if (!isValid) {
            formError.style.display = 'block';
            // Focus on first error
            const firstErrorField = Object.keys(errors)[0];
            const firstField = document.getElementById(firstErrorField) || document.querySelector(`input[name="${firstErrorField}"]`);
            if (firstField) {
                firstField.focus();
            }
            return;
        }

        // Disable submit button and show loading state
        submitButton.disabled = true;
        buttonText.style.display = 'none';
        buttonLoading.style.display = 'inline';

        // Collect form data
        const formData = new FormData(form);
        const data = {};

        // Process regular fields
        for (let [key, value] of formData.entries()) {
            if (key === 'interest' || key === 'contact-method' || key === 'role') {
                // Handle multiple checkboxes
                if (!data[key]) {
                    data[key] = [];
                }
                data[key].push(value);
            } else if (key !== 'website') { // Exclude honeypot
                data[key] = value;
            }
        }

        try {
            // Submit to Keap
            // You'll need to set up a web form in Keap and get the submission URL
            // Go to Keap > Marketing > Landing Pages > Web Forms
            const keapEndpoint = isWorkshopForm
                ? 'YOUR_KEAP_WORKSHOP_FORM_URL' // Replace with your Keap workshop form URL
                : 'YOUR_KEAP_CORPORATE_FORM_URL'; // Replace with your Keap corporate form URL

            // Prepare Keap-compatible form data
            const keapFormData = new FormData();

            // Standard Keap fields (adjust field names to match your Keap form)
            keapFormData.append('inf_field_FirstName', data.name.split(' ')[0] || data.name);
            keapFormData.append('inf_field_LastName', data.name.split(' ').slice(1).join(' ') || '');
            keapFormData.append('inf_field_Email', data.email);

            if (isWorkshopForm) {
                // Workshop-specific fields
                if (data.role && data.role.length > 0) {
                    keapFormData.append('inf_custom_Role', data.role.join(', '));
                }
                if (data.questions) {
                    keapFormData.append('inf_custom_Questions', data.questions);
                }
                // Add a tag to identify workshop registrants
                keapFormData.append('inf_field_Tag', 'Workshop Registration - Dec 10');
            } else {
                // Corporate form-specific fields
                if (data.organization) {
                    keapFormData.append('inf_field_Company', data.organization);
                }
                if (data.interest && data.interest.length > 0) {
                    keapFormData.append('inf_custom_Interest', data.interest.join(', '));
                }
                if (data.challenges) {
                    keapFormData.append('inf_custom_Challenges', data.challenges);
                }
                if (data['contact-method'] && data['contact-method'].length > 0) {
                    keapFormData.append('inf_custom_PreferredContact', data['contact-method'].join(', '));
                }
                if (data.phone) {
                    keapFormData.append('inf_field_Phone1', data.phone);
                }
                // Add a tag to identify corporate leads
                keapFormData.append('inf_field_Tag', 'Corporate Contact Form');
            }

            await fetch(keapEndpoint, {
                method: 'POST',
                body: keapFormData,
                mode: 'no-cors' // Keap forms typically require this
            });

            // Note: With no-cors mode, we can't read the response
            // We'll assume success if no error was thrown

            // Show success message
            formSuccess.style.display = 'block';
            formError.style.display = 'none';

            // Reset form
            form.reset();

            // Scroll to success message
            formSuccess.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // Re-enable button
            submitButton.disabled = false;
            buttonText.style.display = 'inline';
            buttonLoading.style.display = 'none';

        } catch (error) {
            console.error('Form submission error:', error);

            // Show error message
            formError.style.display = 'block';
            formSuccess.style.display = 'none';

            // Re-enable button
            submitButton.disabled = false;
            buttonText.style.display = 'inline';
            buttonLoading.style.display = 'none';

            // Scroll to error message
            formError.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    });
});

// Smooth scroll for CTA buttons
document.addEventListener('DOMContentLoaded', function() {
    const ctaLinks = document.querySelectorAll('a[href="#contact-form"], a[href="#registration-form"]');

    ctaLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const href = this.getAttribute('href');
            const targetId = href.substring(1); // Remove the #
            const target = document.getElementById(targetId);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                // Focus on first form field for accessibility
                setTimeout(() => {
                    const firstField = document.getElementById('name');
                    if (firstField) {
                        firstField.focus();
                    }
                }, 500);
            }
        });
    });
});

// Sticky Navigation on Scroll
document.addEventListener('DOMContentLoaded', function() {
    const stickyNav = document.getElementById('sticky-nav');
    const header = document.querySelector('header');
    let lastScroll = 0;
    let headerHeight = 0;

    // Calculate header height after page loads
    setTimeout(() => {
        headerHeight = header ? header.offsetHeight : 500;
    }, 100);

    window.addEventListener('scroll', function() {
        const currentScroll = window.pageYOffset || document.documentElement.scrollTop;

        // Show sticky nav after scrolling past the header
        if (currentScroll > headerHeight && currentScroll > lastScroll) {
            // Scrolling down and past header
            stickyNav.classList.add('show');
        } else if (currentScroll < headerHeight) {
            // Scrolled back to top
            stickyNav.classList.remove('show');
        }

        lastScroll = currentScroll <= 0 ? 0 : currentScroll;
    });
});
