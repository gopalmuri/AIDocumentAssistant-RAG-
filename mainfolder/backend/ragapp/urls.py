from django.urls import path
from . import views, auth_views

urlpatterns = [
    
    path('', views.landing_page_view, name='landing'),
    path('dashboard/', views.dashboard_view, name='dashboard'),
    # path('login/', views.login_view, name='login'), # Deprecated
    # path('signup/', views.signup_view, name='signup'), # Deprecated
    # path('reset-password/', views.reset_password_view, name='reset_password'), # Deprecated
    # path('logout/', views.logout_view, name='logout'), # Deprecated
    path('upload/', views.upload_files, name='upload_files'), # POST API
    path('upload-page/', views.upload_page_view, name='upload_page'), # GET Page
    path('history/', views.history_page_view, name='history_page'),
    path('favorites/', views.favorites_page_view, name='favorites_page'),
    path('profile/', views.profile_page_view, name='profile_page'),
    path('change-password/', views.password_change_page_view, name='password_change_page'),

    path('query/', views.query, name='query'),
    path('document-status/', views.document_status_api, name='document_status'),
    path('uploaded_pdfs/<str:filename>', views.serve_uploaded_pdf, name='serve_uploaded_pdf'),
    # Conversations
    path('conversations/', views.conversations_list, name='conversations_list'),
    path('conversations/bulk-delete/', views.bulk_delete_conversations, name='bulk_delete_conversations'),
    path('conversations/<str:conversation_id>/', views.conversations_detail, name='conversations_detail'),
    path('conversations/<str:conversation_id>/toggle-favorite/', views.toggle_favorite_conversation, name='toggle_favorite_conversation'),
    path('clear-embeddings/', views.clear_embeddings, name='clear_embeddings'),
    # PDF Library
    path('pdf-library/', views.get_pdf_library, name='get_pdf_library'),
    path('process-existing-pdfs/', views.process_existing_pdfs, name='process_existing_pdfs'),
    path('search-pdfs/', views.search_pdfs, name='search_pdfs'),
    path('view/<str:pdf_name>', views.pdf_viewer, name='pdf_viewer'),
    path('system-status/', views.system_status, name='system_status'),
    
    # Favorites
    path('api/favorites/toggle/', views.toggle_favorite, name='toggle_favorite'),
    path('api/favorites/list/', views.get_user_favorites, name='get_user_favorites'),
    path('api/user/me/', views.get_current_user, name='get_current_user'), # New endpoint
    path('api/favorites/message/toggle/', views.toggle_favorite_message, name='toggle_favorite_message'),

    # Chat Page
    path('chat/', views.chat_page_view, name='chat_page'),


    # Custom Auth APIs
    path('api/auth/register/', auth_views.api_register, name='api_register'),
    path('api/auth/login/', auth_views.api_login, name='api_login'),
    path('api/auth/logout/', auth_views.api_logout, name='api_logout'),
    path('api/auth/me/', auth_views.api_user_info, name='api_user_info'),
    path('api/auth/forgot-password/', auth_views.api_forgot_password, name='api_forgot_password'),
    path('api/auth/reset-password-confirm/', auth_views.api_reset_password_confirm, name='api_reset_password_confirm'),
    path('reset-password-mock-link/', auth_views.mock_password_reset_view, name='mock_password_reset_view'),

]
