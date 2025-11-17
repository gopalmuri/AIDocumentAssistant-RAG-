"""
Test script for authentication functionality
Tests: Login, Signup, Reset Password
"""
import os
import sys
import django

# Setup Django
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'rag_project.settings')
django.setup()

from django.test import Client
from django.contrib.auth.models import User
from django.urls import reverse

def test_signup():
    """Test user signup functionality"""
    print("\n" + "="*60)
    print("TESTING SIGNUP FUNCTIONALITY")
    print("="*60)
    
    client = Client()
    
    # Test 1: Successful signup
    print("\n[TEST 1] Testing successful signup...")
    response = client.post('/signup/', {
        'first_name': 'Test',
        'last_name': 'User',
        'username': 'testuser123',
        'email': 'testuser123@example.com',
        'password': 'TestPass123!',
        'confirm_password': 'TestPass123!'
    })
    
    if response.status_code == 302:
        redirect_url = response.url if hasattr(response, 'url') else '/login/'
        if redirect_url == '/login/':
            print("[PASS] Signup successful - User created and redirected to login")
            # Check if user exists
            user_exists = User.objects.filter(username='testuser123').exists()
            if user_exists:
                print("[PASS] User exists in database")
            else:
                print("[FAIL] User NOT found in database - ERROR!")
                return False
        else:
            print(f"[FAIL] Signup redirected to wrong URL: {redirect_url}")
            return False
    else:
        print(f"[FAIL] Signup failed - Status: {response.status_code}")
        return False
    
    # Test 2: Duplicate username
    print("\n[TEST 2] Testing duplicate username...")
    response = client.post('/signup/', {
        'first_name': 'Another',
        'last_name': 'User',
        'username': 'testuser123',  # Same username
        'email': 'another@example.com',
        'password': 'TestPass123!',
        'confirm_password': 'TestPass123!'
    })
    
    if response.status_code == 200:  # Should stay on signup page with error
        print("[PASS] Duplicate username correctly rejected")
    else:
        print(f"[FAIL] Duplicate username test failed - Status: {response.status_code}")
        return False
    
    # Test 3: Password mismatch
    print("\n[TEST 3] Testing password mismatch...")
    response = client.post('/signup/', {
        'first_name': 'Test',
        'last_name': 'User2',
        'username': 'testuser456',
        'email': 'testuser456@example.com',
        'password': 'TestPass123!',
        'confirm_password': 'DifferentPass123!'  # Mismatch
    })
    
    if response.status_code == 200:  # Should stay on signup page with error
        print("[PASS] Password mismatch correctly rejected")
    else:
        print(f"[FAIL] Password mismatch test failed - Status: {response.status_code}")
        return False
    
    print("\n[PASS] All signup tests passed!")
    return True

def test_login():
    """Test user login functionality"""
    print("\n" + "="*60)
    print("TESTING LOGIN FUNCTIONALITY")
    print("="*60)
    
    client = Client()
    
    # Test 1: Successful login
    print("\n[TEST 1] Testing successful login...")
    response = client.post('/login/', {
        'username': 'testuser123',
        'password': 'TestPass123!'
    })
    
    if response.status_code == 302:
        redirect_url = response.url if hasattr(response, 'url') else '/'
        if redirect_url == '/':
            print("[PASS] Login successful - Redirected to home page")
            # Check if user is authenticated
            response2 = client.get('/')
            if response2.status_code == 200:
                print("[PASS] User is authenticated - Can access home page")
            else:
                print(f"[FAIL] User authentication failed - Status: {response2.status_code}")
                return False
        else:
            print(f"[FAIL] Login redirected to wrong URL: {redirect_url}")
            return False
    else:
        print(f"[FAIL] Login failed - Status: {response.status_code}")
        return False
    
    # Test 2: Invalid credentials
    print("\n[TEST 2] Testing invalid credentials...")
    client = Client()  # New client (not logged in)
    response = client.post('/login/', {
        'username': 'testuser123',
        'password': 'WrongPassword123!'
    })
    
    if response.status_code == 200:  # Should stay on login page with error
        print("[PASS] Invalid credentials correctly rejected")
    else:
        print(f"[FAIL] Invalid credentials test failed - Status: {response.status_code}")
        return False
    
    # Test 3: Non-existent user
    print("\n[TEST 3] Testing non-existent user...")
    response = client.post('/login/', {
        'username': 'nonexistentuser',
        'password': 'SomePassword123!'
    })
    
    if response.status_code == 200:  # Should stay on login page with error
        print("[PASS] Non-existent user correctly rejected")
    else:
        print(f"[FAIL] Non-existent user test failed - Status: {response.status_code}")
        return False
    
    print("\n[PASS] All login tests passed!")
    return True

def test_reset_password():
    """Test password reset functionality"""
    print("\n" + "="*60)
    print("TESTING RESET PASSWORD FUNCTIONALITY")
    print("="*60)
    
    client = Client()
    
    # Test 1: Successful password reset
    print("\n[TEST 1] Testing successful password reset...")
    response = client.post('/reset-password/', {
        'username': 'testuser123',
        'new_password': 'NewPassword123!',
        'confirm_password': 'NewPassword123!'
    })
    
    if response.status_code == 302:
        redirect_url = response.url if hasattr(response, 'url') else '/login/'
        if redirect_url == '/login/':
            print("[PASS] Password reset successful - Redirected to login")
            # Verify password was changed by trying to login
            response2 = client.post('/login/', {
                'username': 'testuser123',
                'password': 'NewPassword123!'  # New password
            })
            if response2.status_code == 302:
                print("[PASS] New password works - Login successful with new password")
            else:
                print("[FAIL] New password does NOT work - ERROR!")
                return False
        else:
            print(f"[FAIL] Password reset redirected to wrong URL: {redirect_url}")
            return False
    else:
        print(f"[FAIL] Password reset failed - Status: {response.status_code}")
        return False
    
    # Test 2: Password mismatch
    print("\n[TEST 2] Testing password mismatch in reset...")
    client = Client()  # New client
    response = client.post('/reset-password/', {
        'username': 'testuser123',
        'new_password': 'NewPassword456!',
        'confirm_password': 'DifferentPassword456!'  # Mismatch
    })
    
    if response.status_code == 200:  # Should stay on reset page with error
        print("[PASS] Password mismatch correctly rejected")
    else:
        print(f"[FAIL] Password mismatch test failed - Status: {response.status_code}")
        return False
    
    # Test 3: Non-existent user
    print("\n[TEST 3] Testing reset for non-existent user...")
    response = client.post('/reset-password/', {
        'username': 'nonexistentuser',
        'new_password': 'NewPassword123!',
        'confirm_password': 'NewPassword123!'
    })
    
    if response.status_code == 200:  # Should stay on reset page with error
        print("[PASS] Non-existent user correctly rejected")
    else:
        print(f"[FAIL] Non-existent user test failed - Status: {response.status_code}")
        return False
    
    print("\n[PASS] All reset password tests passed!")
    return True

def cleanup_test_user():
    """Clean up test user"""
    try:
        user = User.objects.get(username='testuser123')
        user.delete()
        print("\n[OK] Test user cleaned up")
    except User.DoesNotExist:
        pass

if __name__ == '__main__':
    print("\n" + "="*60)
    print("AUTHENTICATION TEST SUITE")
    print("="*60)
    
    try:
        # Run tests
        signup_ok = test_signup()
        login_ok = test_login()
        reset_ok = test_reset_password()
        
        # Summary
        print("\n" + "="*60)
        print("TEST SUMMARY")
        print("="*60)
        print(f"Signup:      {'[PASS] PASSED' if signup_ok else '[FAIL] FAILED'}")
        print(f"Login:       {'[PASS] PASSED' if login_ok else '[FAIL] FAILED'}")
        print(f"Reset Password: {'[PASS] PASSED' if reset_ok else '[FAIL] FAILED'}")
        
        if signup_ok and login_ok and reset_ok:
            print("\n[SUCCESS] ALL TESTS PASSED! Authentication system is working correctly.")
        else:
            print("\n[WARNING] SOME TESTS FAILED! Please check the errors above.")
        
        # Cleanup
        cleanup_test_user()
        
    except Exception as e:
        print(f"\n[ERROR] {str(e)}")
        import traceback
        traceback.print_exc()
        cleanup_test_user()

