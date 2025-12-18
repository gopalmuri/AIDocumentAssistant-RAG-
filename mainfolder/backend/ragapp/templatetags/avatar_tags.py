from django import template
from django.conf import settings

register = template.Library()

@register.simple_tag
def get_user_avatar(user):
    """
    Safely retrieves the user's avatar URL.
    Returns None if no avatar or profile exists.
    """
    if not user.is_authenticated:
        return None
        
    try:
        if hasattr(user, 'userprofile') and user.userprofile.avatar:
            return user.userprofile.avatar.url
    except Exception:
        pass
        
    return None
