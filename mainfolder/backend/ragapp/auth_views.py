import json
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import ensure_csrf_cookie, csrf_exempt
from django.middleware.csrf import get_token

@require_http_methods(["POST"])
def api_register(request):
    try:
        data = json.loads(request.body)
        email = data.get('email')
        username = data.get('username') # Optional, can use email as username
        password = data.get('password')
        confirm_password = data.get('confirm_password')

        if not email or not password:
            return JsonResponse({'error': 'Email and Password are required.'}, status=400)
        
        if password != confirm_password:
             return JsonResponse({'error': 'Passwords do not match.'}, status=400)

        # Strong Password Validation
        validation_error = validate_password_strength(password)
        if validation_error:
            return JsonResponse({'error': validation_error}, status=400)

        if User.objects.filter(username=email).exists():
             return JsonResponse({'error': 'User with this email already exists.'}, status=400)
        
        # Create User
        # We use email as the username for simplicity in this system
        user = User.objects.create_user(username=email, email=email, password=password)
        
        # Auto-login removed as per new flow requirements
        # login(request, user)
        
        return JsonResponse({'message': 'Registration successful. Please log in.', 'user': {'email': user.email}})

    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

@require_http_methods(["POST"])
def api_login(request):
    try:
        data = json.loads(request.body)
        email = data.get('email')
        password = data.get('password')

        if not email or not password:
            return JsonResponse({'error': 'Email and Password are required.'}, status=400)

        # Authenticate using email as username
        user = authenticate(request, username=email, password=password)

        if user is not None:
            login(request, user)
            return JsonResponse({'message': 'Login successful', 'user': {'email': user.email}})
        else:
            return JsonResponse({'error': 'Invalid email or password.'}, status=401)

    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

@require_http_methods(["POST"])
def api_logout(request):
    logout(request)
    return JsonResponse({'message': 'Logged out successfully'})

@require_http_methods(["POST"])
@require_http_methods(["POST"])
@ensure_csrf_cookie
def api_forgot_password(request):
    print("DEBUG: Entered api_forgot_password view") # DEBUG LOG
    try:
        data = json.loads(request.body)
        email = data.get('email')

        if not email:
            return JsonResponse({'error': 'Email is required.'}, status=400)

        # In a real app, successful checking for user existence is a security risk (enumeration)
        # But for this local MVP, checking is fine for debugging
        if not User.objects.filter(email=email).exists() and not User.objects.filter(username=email).exists():
             # Returning a generic success message even if email not found is standard security practice,
             # but strictly for this user requiring a "fix", we might want to be explicit or just pretend.
             # Let's pretend success to avoid enumeration, but log internally.
             print(f"Password reset requested for non-existent email: {email}")
        
        # Simulate Email Sending
        print(f"--------------------------------------------------")
        print(f" [MOCK EMAIL SERVICE] Password Reset Link Sent to: {email}")
        print(f" Link: http://localhost:8000/reset-password-mock-link")
        print(f"--------------------------------------------------")

        return JsonResponse({
            'message': 'Password reset link sent (simulated).',
            'mock_link': f'http://localhost:8000/reset-password-mock-link?email={email}' # Sent to frontend for Dev testing
        })

    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

@require_http_methods(["GET"])
def mock_password_reset_view(request):
    """
    Renders a simple standalone HTML page for resetting the password.
    In a real app, this would verify a secure token.
    """
    email = request.GET.get('email', '')
    html_content = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Password - DocAssistant</title>
        <style>
            :root {{ --bg-dark: #0f172a; --card-bg: #1e293b; --primary: #f97316; --text-main: #f8fafc; }}
            body {{ background: var(--bg-dark); color: var(--text-main); font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }}
            .card {{ background: var(--card-bg); padding: 2rem; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.5); width: 100%; max-width: 400px; text-align: center; }}
            h2 {{ margin-bottom: 0.5rem; }}
            p {{ color: #94a3b8; font-size: 0.9rem; margin-bottom: 2rem; }}
            input {{ width: 100%; padding: 0.75rem; margin-bottom: 1rem; border-radius: 6px; border: 1px solid #334155; background: #0f172a; color: white; box-sizing: border-box; }}
            button {{ width: 100%; padding: 0.75rem; background: var(--primary); color: white; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; transition: opacity 0.2s; }}
            button:hover {{ opacity: 0.9; }}
            .message {{ margin-top: 1rem; font-size: 0.9rem; min-height: 1.5rem; }}
            .success {{ color: #4cd964; }}
            .error {{ color: #ff3b30; }}
        </style>
    </head>
    <body>
        <div class="card">
            <h2>Reset Password</h2>
            <p>Enter a new password for <b>{email}</b></p>
            <form id="resetForm">
                <input type="hidden" id="email" value="{email}">
                <input type="password" id="new_password" placeholder="New Password" required>
                <input type="password" id="confirm_password" placeholder="Confirm New Password" required>
                <button type="submit" id="submitBtn">Update Password</button>
            </form>
            <div id="message" class="message"></div>
        </div>

        <script>
            document.getElementById('resetForm').addEventListener('submit', async (e) => {{
                e.preventDefault();
                const email = document.getElementById('email').value;
                const password = document.getElementById('new_password').value;
                const confirm = document.getElementById('confirm_password').value;
                const msg = document.getElementById('message');
                const btn = document.getElementById('submitBtn');

                if(password !== confirm) {{
                     msg.className = 'message error';
                     msg.innerText = "Passwords do not match.";
                     return;
                }}

                btn.disabled = true;
                btn.innerText = "Updating...";

                try {{
                    const res = await fetch('/api/auth/reset-password-confirm/', {{
                        method: 'POST',
                        headers: {{ 'Content-Type': 'application/json' }},
                        body: JSON.stringify({{ email, password }})
                    }});
                    const data = await res.json();
                    
                    if(res.ok) {{
                        msg.className = 'message success';
                        msg.innerText = "Password updated! Redirecting...";
                        setTimeout(() => window.location.href = '/', 2000);
                    }} else {{
                         msg.className = 'message error';
                         msg.innerText = data.error || "Update failed.";
                         btn.disabled = false;
                         btn.innerText = "Update Password";
                    }}
                }} catch(err) {{
                    msg.className = 'message error';
                    msg.innerText = "Network error.";
                    btn.disabled = false;
                    btn.innerText = "Update Password";
                }}
            }});
        </script>
    </body>
    </html>
    """
    from django.http import HttpResponse
    return HttpResponse(html_content)

@require_http_methods(["POST"])
@csrf_exempt
def api_reset_password_confirm(request):
    print("DEBUG: Entered api_reset_password_confirm") # Debug log
    try:
        raw_body = request.body.decode('utf-8')
        print(f"DEBUG: Body received: {raw_body}") # Debug log
        
        data = json.loads(raw_body)
        email = data.get('email')
        password = data.get('password')
        print(f"DEBUG: Processing reset for email: {email}")

        if not email or not password:
             return JsonResponse({'error': 'Email and Password are required.'}, status=400)

        # Strong Password Validation
        validation_error = validate_password_strength(password)
        if validation_error:
            return JsonResponse({'error': validation_error}, status=400)

        user_qs = User.objects.filter(email=email)
        if not user_qs.exists():
             user_qs = User.objects.filter(username=email)
        
        if user_qs.exists():
            user = user_qs.first()
            user.set_password(password)
            user.save()
            print("DEBUG: Password updated successfully")
            
            # Auto-login removed as per new flow requirements
            
            return JsonResponse({'message': 'Password updated successfully. Please log in.'})
        else:
            print("DEBUG: User not found")
            return JsonResponse({'error': 'User not found.'}, status=404)

    except Exception as e:
        print(f"DEBUG: Exception in reset: {str(e)}") # Debug log
        import traceback
        traceback.print_exc()
        return JsonResponse({'error': f"Server Error: {str(e)}"}, status=500)

def validate_password_strength(password):
    """
    Validates password strength:
    - At least 8 characters
    - At least one uppercase letter
    - At least one lowercase letter
    - At least one number
    - At least one special symbol
    - No weak patterns (common sequences/repeated chars)
    """
    import re
    if len(password) < 8:
        return "Password must be at least 8 characters long."
    if not re.search(r'[A-Z]', password):
        return "Password must contain at least one uppercase letter."
    if not re.search(r'[a-z]', password):
        return "Password must contain at least one lowercase letter."
    if not re.search(r'[0-9]', password):
        return "Password must contain at least one number."
    if not re.search(r'[!@#$%^&*(),.?":{}|<>]', password):
        return "Password must contain at least one special symbol."
    
    # Weak patterns
    if password.lower() in ['password', '123456', '12345678', 'qwerty', 'admin']:
         return "Password is too common."
    
    # Check for repeated characters (e.g. 'aaaaaa') - 4 in a row
    if re.search(r'(.)\1\1\1', password):
        return "Password contains too many repeated characters."

    return None # Valid


@require_http_methods(["GET"])
@ensure_csrf_cookie # Ensures CSRF cookie is sent to client
def api_user_info(request):
    if request.user.is_authenticated:
        return JsonResponse({
            'isAuthenticated': True,
            'user': {
                'email': request.user.email,
                'username': request.user.username
            },
            'csrfToken': get_token(request)
        })
    else:
        return JsonResponse({
            'isAuthenticated': False,
            'csrfToken': get_token(request)
        })
