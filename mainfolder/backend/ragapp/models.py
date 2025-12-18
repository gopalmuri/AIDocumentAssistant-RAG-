from django.db import models
from django.contrib.auth.models import User

class Conversation(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True)
    title = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    messages = models.JSONField(default=list)  # Stores chat history: [{"role": "user", "content": "hi"}, ...]
    documents = models.JSONField(default=list) # List of filenames involved in this conversation
    is_favorite = models.BooleanField(default=False) 

    def __str__(self):
        return f"{self.title} ({self.user.username if self.user else 'Guest'})"

class Favorite(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    document_name = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'document_name')

    def __str__(self):
        return f"{self.user.username} - {self.document_name}"

class FavoriteMessage(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE)
    message_content = models.TextField()
    message_index = models.IntegerField()  # Index in the messages list
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.username} - {self.message_content[:30]}..."

class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    avatar = models.ImageField(upload_to='avatars/', null=True, blank=True)
    bio = models.TextField(max_length=500, blank=True)
    location = models.CharField(max_length=30, blank=True)
    birth_date = models.DateField(null=True, blank=True)

    def __str__(self):
        return self.user.username

class UserDocument(models.Model):
    """
    Tracks ownership of uploaded documents to ensure privacy.
    Global documents (Admins) have user=None (or handle via specific Admin check).
    """
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    filename = models.CharField(max_length=255) # Matches the filename in uploaded_pdfs
    uploaded_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        unique_together = ('user', 'filename')

    def __str__(self):
        return f"{self.filename} ({self.user.username})"
