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
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']

    def __str__(self) -> str:
        base = self.title or (self.messages[0]['content'][:40] if self.messages else 'Conversation')
        return f"{base} ({self.user.username})"
