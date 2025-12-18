
# Session Settings - Explicitly set for Local Development Stability
SESSION_COOKIE_SECURE = False  # Allow HTTP cookies (critical for localhost)
SESSION_COOKIE_HTTPONLY = True # Javascript can't read it (security best practice)
SESSION_COOKIE_SAMESITE = 'Lax' # Standard
SESSION_ENGINE = 'django.contrib.sessions.backends.db' # Persist to DB
SESSION_SAVE_EVERY_REQUEST = True # Force save on every request to ensure modifications stick
