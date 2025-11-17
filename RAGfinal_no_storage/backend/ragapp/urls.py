from django.urls import path
from . import views

urlpatterns = [
    
    path('', views.index, name='index'),
    path('login/', views.login_view, name='login'),
    path('signup/', views.signup_view, name='signup'),
    path('reset-password/', views.reset_password_view, name='reset_password'),
    path('logout/', views.logout_view, name='logout'),
    path('upload/', views.upload_files, name='upload_files'),
    path('check-status/', views.check_document_status, name='check_document_status'),
    path('query/', views.query, name='query'),
    path('uploaded_pdfs/<str:filename>', views.serve_uploaded_pdf, name='serve_uploaded_pdf'),
    # Conversations
    path('conversations/', views.conversations_list, name='conversations_list'),
    path('conversations/<int:conversation_id>/', views.conversations_detail, name='conversations_detail'),
    path('clear-embeddings/', views.clear_embeddings, name='clear_embeddings'),
    # PDF Library
    path('pdf-library/', views.get_pdf_library, name='get_pdf_library'),
    path('process-existing-pdfs/', views.process_existing_pdfs, name='process_existing_pdfs'),
    path('search-pdfs/', views.search_pdfs, name='search_pdfs'),
    path('view/<str:pdf_name>', views.pdf_viewer, name='pdf_viewer'),
    path('system-status/', views.system_status, name='system_status'),

]
