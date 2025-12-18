/**
 * Custom Auth Modal Logic (Clerk Replica)
 * Handles Modal Open/Close, Tab Switching, API Calls
 */

// Define Global Functions Immediately
window.openAuthModal = (view = 'login') => {
    const modalOverlay = document.getElementById('auth-modal-overlay');
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const authTitle = document.getElementById('auth-title');
    // Clear errors when opening
    const errorMsg = document.getElementById('auth-error-msg');
    if(errorMsg) {
        errorMsg.innerText = '';
        errorMsg.classList.remove('visible');
    }

    if(modalOverlay) {
        modalOverlay.style.display = 'flex';
        // Slight delay for opacity transition
        setTimeout(() => modalOverlay.classList.add('visible'), 10);
        
        if (view === 'signup') {
            // Show Signup
            if(authTitle) authTitle.innerText = "Create account";
            if(loginForm) loginForm.classList.remove('visible');
            if(signupForm) signupForm.classList.add('visible');
        } else {
            // Show Login
            if(authTitle) authTitle.innerText = "Sign In";
            if(loginForm) loginForm.classList.add('visible');
            if(signupForm) signupForm.classList.remove('visible');
        }
    } else {
        console.error("Auth modal overlay not found!");
    }
};

window.closeAuthModal = () => {
    const modalOverlay = document.getElementById('auth-modal-overlay');
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    
    if(modalOverlay) {
        modalOverlay.classList.remove('visible');
        setTimeout(() => {
            modalOverlay.style.display = 'none';
            // Reset forms
            if(loginForm) loginForm.reset();
            if(signupForm) signupForm.reset();
        }, 300); 
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements - Attach Listeners
    const closeBtn = document.getElementById('auth-close-btn');
    const switchToSignup = document.getElementById('switch-to-signup');
    const switchToLogin = document.getElementById('switch-to-login');
    const modalOverlay = document.getElementById('auth-modal-overlay');
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const errorMsg = document.getElementById('auth-error-msg');
    
    // Close Button
    if(closeBtn) closeBtn.addEventListener('click', window.closeAuthModal);
    
    // Close on background click
    if(modalOverlay) {
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) window.closeAuthModal();
        });
    }

    // --- Tab Switching ---
    if(switchToSignup) {
        switchToSignup.addEventListener('click', (e) => {
            e.preventDefault();
            window.openAuthModal('signup');
        });
    }

    if(switchToLogin) {
        switchToLogin.addEventListener('click', (e) => {
            e.preventDefault();
            window.openAuthModal('login');
        });
    }

    // --- Password Toggle ---
    document.querySelectorAll('.toggle-password').forEach(icon => {
        icon.addEventListener('click', () => {
            const input = icon.previousElementSibling;
            if (input.type === 'password') {
                input.type = 'text';
                icon.classList.remove('fa-eye');
                icon.classList.add('fa-eye-slash');
            } else {
                input.type = 'password';
                icon.classList.add('fa-eye');
                icon.classList.remove('fa-eye-slash');
            }
        });
    });

    // --- API Interactions ---
    
    // Helper: Show Error
    function showError(msg) {
        if(errorMsg) {
            errorMsg.innerText = msg;
            errorMsg.classList.add('visible');
            const card = document.querySelector('.auth-modal-card');
            if(card) {
                card.classList.add('shake');
                setTimeout(() => card.classList.remove('shake'), 500);
            }
        }
    }
    
    // Helper: Set Loading
    function setLoading(form, isLoading) {
        const btn = form.querySelector('.auth-submit-btn');
        if(btn) {
            if(isLoading) {
                btn.classList.add('loading');
                btn.disabled = true;
            } else {
                btn.classList.remove('loading');
                btn.disabled = false;
            }
        }
    }

    // Login Submit
    if(loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            setLoading(loginForm, true);
            if(errorMsg) errorMsg.classList.remove('visible');

            const formData = new FormData(loginForm);
            const data = Object.fromEntries(formData.entries());

            try {
                const response = await fetch('/api/auth/login/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': getCookie('csrftoken')
                    },
                    body: JSON.stringify(data)
                });

                const result = await response.json();

                if (response.ok) {
                    window.location.href = '/dashboard/';
                } else {
                    showError(result.error || 'Login failed');
                }
            } catch (err) {
                showError('Network error. Please try again.');
                console.error(err);
            } finally {
                setLoading(loginForm, false);
            }
        });
    }

    // Signup Submit
    if(signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            setLoading(signupForm, true);
             if(errorMsg) errorMsg.classList.remove('visible');

            const formData = new FormData(signupForm);
            const data = Object.fromEntries(formData.entries());

            if (data.password !== data.confirm_password) {
                showError("Passwords do not match");
                setLoading(signupForm, false);
                return;
            }

            try {
                const response = await fetch('/api/auth/register/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': getCookie('csrftoken')
                    },
                    body: JSON.stringify(data)
                });

                const result = await response.json();

                if (response.ok) {
                     window.location.href = '/dashboard/';
                } else {
                    showError(result.error || 'Registration failed');
                }
            } catch (err) {
                showError('Network error. Please try again.');
                console.error(err);
            } finally {
                setLoading(signupForm, false);
            }
        });
    }

    // Django CSRF Token Helper
    function getCookie(name) {
        let cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                if (cookie.substring(0, name.length + 1) === (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }
});
