import os
import sys
import django
from django.core.management import execute_from_command_line

def run_server():
    """Run the Django development server"""
    # Set up the Django environment
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'rag_project.settings')
    django.setup()
    
    # Run migrations
    print("Running migrations...")
    execute_from_command_line(['manage.py', 'migrate'])
    
    # Create superuser if it doesn't exist
    from django.contrib.auth import get_user_model
    User = get_user_model()
    if not User.objects.filter(username='admin').exists():
        print("Creating superuser...")
        User.objects.create_superuser('admin', 'admin@example.com', 'admin')
    
    # Run the development server
    print("Starting development server...")
    execute_from_command_line(['manage.py', 'runserver'])

if __name__ == "__main__":
    run_server()
