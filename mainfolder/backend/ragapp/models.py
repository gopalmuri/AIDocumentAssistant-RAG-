from django.db import models
from django.contrib.auth.models import User


class Conversation(models.Model):
    """Stores a single chat conversation per user with messages as JSON."""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='conversations')
    title = models.CharField(max_length=255, blank=True)
    messages = models.JSONField(default=list)  # [{sender: 'user'|'assistant', content: str, timestamp: iso}]
    documents = models.JSONField(default=list)  # list of filenames linked to this conversation
    last_citations = models.JSONField(default=list)  # last returned citations for instant display
    last_follow_ups = models.JSONField(default=list)  # last follow-up questions for instant display
    is_pinned = models.BooleanField(default=False)
    is_favorite = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']

    def __str__(self) -> str:
        base = self.title or (self.messages[0]['content'][:40] if self.messages else 'Conversation')
        return f"{base} ({self.user.username})"


class Favorite(models.Model):
    """Stores favorite documents for a user."""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='favorites')
    filename = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'filename')
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.user.username} - {self.filename}"


class FavoriteMessage(models.Model):
    """Stores favorite Q&A messages for a user."""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='favorite_messages')
    question = models.TextField()
    answer = models.TextField()
    timestamp = models.DateTimeField(auto_now_add=True)
    
    # Optional: Context/Source document (if needed later)
    source_document = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        ordering = ['-timestamp']

    def __str__(self):
        return f"{self.user.username} - {self.question[:30]}..."


class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='userprofile')
    avatar = models.ImageField(upload_to='avatars/', blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.username} Profile"
