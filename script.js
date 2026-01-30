// Form Validation and Submission Handler
document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('corporate-contact-form');
    const submitButton = document.getElementById('submit-button');
    const buttonText = submitButton.querySelector('.button-text');
    const buttonLoading = submitButton.querySelector('.button-loading');
    const formSuccess = document.getElementById('form-success');
    const formError = document.getElementById('form-error');

    // Validation functions
    const validators = {
        'first-name': function(value) {
            if (!value.trim()) {
                return 'Please enter your first name';
            }
            if (value.trim().length < 2) {
                return 'First name must be at least 2 characters';
            }
            return null;
        },
        'last-name': function(value) {
            if (!value.trim()) {
                return 'Please enter your last name';
            }
            if (value.trim().length < 2) {
                return 'Last name must be at least 2 characters';
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

    // Real-time validation for text inputs
    ['first-name', 'last-name', 'email'].forEach(fieldName => {
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

        // Validate required text fields
        const requiredFields = ['first-name', 'last-name', 'email'];

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
            // Submit to Keap via Netlify Function
            const response = await fetch('/.netlify/functions/keap-submit', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.message || 'Form submission failed');
            }

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
                    const firstField = document.getElementById('first-name');
                    if (firstField) {
                        firstField.focus();
                    }
                }, 500);
            }
        });
    });
});

// Sticky Navigation - Always visible (no scroll behavior needed)
// The sticky nav is now always visible at the top of the page

// Countdown Timer
document.addEventListener('DOMContentLoaded', function() {
    const countdownContainer = document.getElementById('countdown-container');
    if (!countdownContainer) return;

    // Webinar date: February 4th, 2026 at 7:00 PM ET
    const workshopDate = new Date('2026-02-04T19:00:00-05:00').getTime();

    function updateCountdown() {
        const now = new Date().getTime();
        const distance = workshopDate - now;

        // If the countdown is finished
        if (distance < 0) {
            document.getElementById('countdown-days').textContent = '00';
            document.getElementById('countdown-hours').textContent = '00';
            document.getElementById('countdown-minutes').textContent = '00';
            document.getElementById('countdown-seconds').textContent = '00';
            document.querySelector('.countdown-label').textContent = 'Webinar is Live!';
            return;
        }

        // Calculate time units
        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);

        // Update the display with leading zeros
        document.getElementById('countdown-days').textContent = days.toString().padStart(2, '0');
        document.getElementById('countdown-hours').textContent = hours.toString().padStart(2, '0');
        document.getElementById('countdown-minutes').textContent = minutes.toString().padStart(2, '0');
        document.getElementById('countdown-seconds').textContent = seconds.toString().padStart(2, '0');
    }

    // Update immediately and then every second
    updateCountdown();
    setInterval(updateCountdown, 1000);
});

// Scroll Reveal Animation with staggered delays
document.addEventListener('DOMContentLoaded', function() {
    const revealElements = document.querySelectorAll('.reveal-on-scroll');

    if (revealElements.length === 0) return;

    // Group elements by their parent section for staggered reveal
    const sectionGroups = new Map();
    revealElements.forEach(element => {
        const section = element.closest('section') || element.closest('header');
        if (!sectionGroups.has(section)) {
            sectionGroups.set(section, []);
        }
        sectionGroups.get(section).push(element);
    });

    // Assign stagger delays within each section
    sectionGroups.forEach(elements => {
        elements.forEach((el, index) => {
            el.style.transitionDelay = (index * 0.08) + 's';
        });
    });

    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('revealed');
                revealObserver.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: '0px 0px -40px 0px'
    });

    revealElements.forEach(element => {
        revealObserver.observe(element);
    });
});
