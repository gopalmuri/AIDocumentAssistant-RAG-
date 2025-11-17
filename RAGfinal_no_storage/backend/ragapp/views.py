from django.shortcuts import render, redirect
from django.http import JsonResponse, FileResponse, Http404
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.contrib import messages
from django.contrib.auth.decorators import login_required
import os
import json
from django.conf import settings
from rag_app import process_pdf, get_answer
from .models import Conversation

UPLOAD_DIR = os.path.join(settings.BASE_DIR.parent, 'uploaded_pdfs')
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Removed is_document_processed function - no persistent storage

def login_view(request):
    if request.method == 'POST':
        username = request.POST.get('username')
        password = request.POST.get('password')
        
        user = authenticate(request, username=username, password=password)
        if user is not None:
            login(request, user)
            return redirect('index')
        else:
            messages.error(request, 'Invalid username or password.')
    
    return render(request, 'ragapp/login.html')

def signup_view(request):
    if request.method == 'POST':
        first_name = request.POST.get('first_name')
        last_name = request.POST.get('last_name')
        username = request.POST.get('username')
        email = request.POST.get('email')
        password = request.POST.get('password')
        confirm_password = request.POST.get('confirm_password')
        
        if password != confirm_password:
            messages.error(request, 'Passwords do not match.')
            return render(request, 'ragapp/signup.html', {
                'first_name': first_name,
                'last_name': last_name,
                'username': username,
                'email': email
            })
        
        if User.objects.filter(username=username).exists():
            messages.error(request, 'Username already exists.')
            return render(request, 'ragapp/signup.html', {
                'first_name': first_name,
                'last_name': last_name,
                'email': email
            })
        
        if User.objects.filter(email=email).exists():
            messages.error(request, 'Email already exists.')
            return render(request, 'ragapp/signup.html', {
                'first_name': first_name,
                'last_name': last_name,
                'username': username
            })
        
        user = User.objects.create_user(
            username=username,
            email=email,
            password=password,
            first_name=first_name,
            last_name=last_name
        )
        
        messages.success(request, 'Account created successfully! Please sign in.')
        return redirect('login')
    
    return render(request, 'ragapp/signup.html')

def reset_password_view(request):
    if request.method == 'POST':
        username = request.POST.get('username')
        new_password = request.POST.get('new_password')
        confirm_password = request.POST.get('confirm_password')
        
        if new_password != confirm_password:
            messages.error(request, 'Passwords do not match.')
            return render(request, 'ragapp/reset_password.html', {'username': username})
        
        try:
            user = User.objects.get(username=username)
            user.set_password(new_password)
            user.save()
            messages.success(request, 'Password updated successfully! Please sign in.')
            return redirect('login')
        except User.DoesNotExist:
            messages.error(request, 'User not found.')
            return render(request, 'ragapp/reset_password.html', {'username': username})
    
    return render(request, 'ragapp/reset_password.html')

def logout_view(request):
    logout(request)
    return redirect('login')

@login_required
def index(request):
    # Check if ChromaDB has data, if not process once
    try:
        from rag_app import chroma_client, collection_name
        
        # Check if ChromaDB collection exists and has data
        try:
            collection = chroma_client.get_collection(collection_name)
            count = collection.count()
            print(f"[CHROMADB] Found {count} documents in ChromaDB")
            
            if count == 0:
                print("[CHROMADB] Empty collection, processing PDFs once...")
                process_all_existing_pdfs_once()
            else:
                print(f"[CHROMADB] Using existing {count} documents from ChromaDB")
                # Load embeddings into memory
                load_embeddings_from_chromadb()
                
        except Exception as e:
            print(f"[CHROMADB] Collection not found or error: {e}")
            print("[CHROMADB] Processing PDFs once...")
            process_all_existing_pdfs_once()
            
    except Exception as e:
        print(f"[CHROMADB] Error: {e}")
    
    return render(request, 'ragapp/index.html')


def load_embeddings_from_chromadb():
    """Load embeddings from ChromaDB into memory"""
    try:
        from rag_app import chroma_client, collection_name, in_memory_chunks, in_memory_embeddings
        
        collection = chroma_client.get_collection(collection_name)
        count = collection.count()
        
        if count > 0:
            print(f"[MEMORY] Loading {count} documents from ChromaDB into memory...")
            
            # Clear existing memory
            in_memory_chunks.clear()
            in_memory_embeddings.clear()
            
            # Load all documents from ChromaDB
            results = collection.get(include=['documents', 'embeddings', 'metadatas'])
            
            print(f"[DEBUG] ChromaDB results structure: {type(results)}")
            print(f"[DEBUG] ChromaDB results keys: {list(results.keys()) if isinstance(results, dict) else 'Not a dict'}")
            
            # Handle different ChromaDB result structures
            if isinstance(results, dict):
                documents = results.get('documents', [])
                embeddings = results.get('embeddings', [])
                metadatas = results.get('metadatas', [])
                
                # Handle nested structure - embeddings might be nested
                if embeddings is not None and len(embeddings) > 0:
                    # Check if embeddings are numpy arrays or nested lists
                    import numpy as np
                    if isinstance(embeddings[0], np.ndarray):
                        # Convert numpy arrays to lists
                        embeddings = [emb.tolist() for emb in embeddings]
                    elif isinstance(embeddings[0], list) and len(embeddings) == 1:
                        # Flatten embeddings if they're nested
                        embeddings = embeddings[0]
                    
            else:
                # Handle case where results might be a list or different structure
                print(f"[DEBUG] Unexpected results type: {type(results)}")
                return
            
            print(f"[DEBUG] Found {len(documents)} documents, {len(embeddings)} embeddings, {len(metadatas)} metadatas")
            if embeddings:
                print(f"[DEBUG] First embedding type: {type(embeddings[0])}")
                print(f"[DEBUG] First embedding length: {len(embeddings[0]) if hasattr(embeddings[0], '__len__') else 'No length'}")
            
            # Load into memory
            for i in range(min(len(documents), len(embeddings), len(metadatas))):
                try:
                    doc = documents[i] if i < len(documents) else ""
                    embedding = embeddings[i] if i < len(embeddings) else []
                    metadata = metadatas[i] if i < len(metadatas) else {}
                    
                    chunk_id = f"chromadb_{i}"
                    in_memory_chunks[chunk_id] = {
                        'content': doc,
                        'chunk_text': doc,  # Add for compatibility
                        'metadata': metadata,
                        'source': metadata.get('source', 'Unknown'),
                        'source_pdf': metadata.get('source_pdf', 'Unknown'),  # Add source_pdf
                        'page_no': metadata.get('page_no', 1),  # Add page_no
                        'page_number': metadata.get('page_no', 1),
                        'chunk_id': metadata.get('id', chunk_id),  # Add original chunk ID
                        'document_id': metadata.get('id', chunk_id)
                    }
                    in_memory_embeddings[chunk_id] = embedding
                    
                    if i == 0:  # Debug first item
                        print(f"[DEBUG] First chunk loaded successfully")
                        
                except Exception as e:
                    print(f"[DEBUG] Error loading chunk {i}: {e}")
                    print(f"[DEBUG] Doc type: {type(documents[i]) if i < len(documents) else 'None'}")
                    print(f"[DEBUG] Embedding type: {type(embeddings[i]) if i < len(embeddings) else 'None'}")
                    print(f"[DEBUG] Metadata type: {type(metadatas[i]) if i < len(metadatas) else 'None'}")
            
            print(f"[MEMORY] Loaded {len(in_memory_chunks)} chunks and {len(in_memory_embeddings)} embeddings into memory")
        else:
            print("[MEMORY] No documents in ChromaDB to load")
            
    except Exception as e:
        import traceback
        print(f"[MEMORY] Error loading embeddings from ChromaDB: {e}")
        print(f"[MEMORY] Full traceback:")
        traceback.print_exc()

def process_all_existing_pdfs_once():
    """Process all PDFs once and store in ChromaDB"""
    try:
        from rag_app import chroma_client, collection_name
        
        # Check if already processed
        try:
            collection = chroma_client.get_collection(collection_name)
            count = collection.count()
            if count > 0:
                print(f"[CHROMADB] Already processed {count} documents, skipping...")
                return
        except:
            pass
        
        processed_count = 0
        errors = []
        
        if os.path.exists(UPLOAD_DIR):
            pdf_files = [f for f in os.listdir(UPLOAD_DIR) if f.lower().endswith('.pdf')]
            print(f"[CHROMADB] Processing {len(pdf_files)} PDF files once and storing in ChromaDB...")
            
            for filename in pdf_files:
                try:
                    file_path = os.path.join(UPLOAD_DIR, filename)
                    print(f"[CHROMADB] Processing: {filename}")
                    process_pdf(file_path, filename, None)
                    processed_count += 1
                except Exception as e:
                    error_msg = f"Failed to process {filename}: {str(e)}"
                    errors.append(error_msg)
                    print(f"[CHROMADB] {error_msg}")
            
            print(f"[CHROMADB] Successfully processed {processed_count} PDFs and stored in ChromaDB")
            if processed_count > 0:
                # Load the newly processed embeddings into memory
                load_embeddings_from_chromadb()
            if errors:
                print(f"[CHROMADB] {len(errors)} errors occurred")
        else:
            print(f"[CHROMADB] Upload directory not found: {UPLOAD_DIR}")
            
    except Exception as e:
        print(f"[CHROMADB] Error processing PDFs: {e}")


def process_all_existing_pdfs():
    """Legacy function - kept for compatibility"""
    return process_all_existing_pdfs_once()

@csrf_exempt
def upload_files(request):
    if request.method == 'POST':
        files = request.FILES.getlist('files')
        conversation_id = request.POST.get('conversation_id') or None
        created_new_conversation = False
        # If no conversation is provided, create one now so uploads are scoped
        if not conversation_id:
            if request.user.is_authenticated:
                title = (files[0].name if files else 'Conversation')[:60]
                conv = Conversation.objects.create(user=request.user, title=title, messages=[], documents=[])
                conversation_id = str(conv.id)
                created_new_conversation = True
                print(f"[DEBUG] Created new conversation for authenticated user: {conversation_id}")
            else:
                # For non-authenticated users, use a session-based conversation_id
                import uuid
                conversation_id = str(uuid.uuid4())
                created_new_conversation = True
                print(f"[DEBUG] Created new session-based conversation: {conversation_id}")
        else:
            print(f"[DEBUG] Using existing conversation: {conversation_id}")
        processed_files = []
        already_processed = []
        
        for file in files:
            if file.name.lower().endswith('.pdf'):
                # Process all documents (no persistent storage check)
                file_path = os.path.join(UPLOAD_DIR, file.name)
                with open(file_path, 'wb+') as destination:
                    for chunk in file.chunks():
                        destination.write(chunk)
                process_pdf(file_path, file.name, conversation_id)
                # Link file to conversation if provided
                if conversation_id:
                    if request.user.is_authenticated:
                        try:
                            conv = Conversation.objects.get(id=conversation_id, user=request.user)
                            if file.name not in conv.documents:
                                conv.documents.append(file.name)
                                conv.save()
                        except Conversation.DoesNotExist:
                            pass
                    else:
                        # For non-authenticated users, store in session
                        if 'conversation_documents' not in request.session:
                            request.session['conversation_documents'] = {}
                        if conversation_id not in request.session['conversation_documents']:
                            request.session['conversation_documents'][conversation_id] = []
                        if file.name not in request.session['conversation_documents'][conversation_id]:
                            request.session['conversation_documents'][conversation_id].append(file.name)
                        request.session.save()
                processed_files.append(file.name)
        
        # Prepare response message
        message_parts = []
        if processed_files:
            message_parts.append(f'Processed {len(processed_files)} new files successfully!')
        if already_processed:
            message_parts.append(f'{len(already_processed)} files were already processed and skipped.')
        
        return JsonResponse({
            'message': ' '.join(message_parts),
            'processed_files': processed_files,
            'already_processed': already_processed,
            'conversation_id': conversation_id,
            'created_new_conversation': created_new_conversation
        })
    return JsonResponse({'error': 'Invalid request method'}, status=400)

@csrf_exempt
def check_document_status(request):
    """No persistent storage - all documents are always unprocessed"""
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            filenames = data.get('filenames', [])
            status_results = {}
            
            # Since we removed persistent storage, all documents are unprocessed
            for filename in filenames:
                status_results[filename] = False
            
            return JsonResponse({'status': status_results})
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)
    return JsonResponse({'error': 'Invalid request method'}, status=400)

@csrf_exempt
def query(request):
    import json
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            query_text = data.get('query')
            conversation_id = data.get('conversation_id')
        except Exception:
            query_text = request.POST.get('query')
            conversation_id = request.POST.get('conversation_id')
        if not query_text:
            return JsonResponse({'error': 'No query provided'}, status=400)
        try:
            # Debug: Print conversation scoping info
            print(f"[DEBUG] Query: {query_text[:50]}...")
            print(f"[DEBUG] Conversation ID: {conversation_id}")
            print(f"[DEBUG] User authenticated: {request.user.is_authenticated}")
            
            # Ensure PDFs are processed before querying
            from rag_app import chroma_client, collection_name, in_memory_embeddings
            try:
                collection = chroma_client.get_collection(collection_name)
                count = collection.count()
                print(f"[CHROMADB] Found {count} documents in ChromaDB")
                print(f"[MEMORY] Found {len(in_memory_embeddings)} embeddings in memory")
                if count == 0:
                    print("[CHROMADB] No documents found, processing PDFs once...")
                    process_all_existing_pdfs_once()
                elif len(in_memory_embeddings) == 0:
                    print("[MEMORY] No embeddings in memory, loading from ChromaDB...")
                    load_embeddings_from_chromadb()
                    # If still no embeddings, process PDFs
                    if len(in_memory_embeddings) == 0:
                        print("[MEMORY] Still no embeddings, processing PDFs once...")
                        process_all_existing_pdfs_once()
            except Exception as e:
                print(f"[CHROMADB] Collection not found or error: {e}, processing PDFs once...")
                process_all_existing_pdfs_once()
            
            # Generate answer via RAG with optional conversation scoping and PDF context
            pdf_context = data.get('pdf_context') if isinstance(data, dict) else request.POST.get('pdf_context')
            
            try:
                result = get_answer(query_text, conversation_id, pdf_context)
                # Backward compatible: if backend still returns string
                if isinstance(result, str):
                    answer_payload = {'answer': result, 'citations': [], 'follow_up_questions': []}
                elif isinstance(result, dict):
                    answer_payload = {
                        'answer': result.get('answer', 'No answer generated'),
                        'citations': result.get('citations', []),
                        'follow_up_questions': result.get('follow_up_questions', [])
                    }
                else:
                    # Handle unexpected result type
                    answer_payload = {
                        'answer': f'Unexpected result type: {type(result)}',
                        'citations': [],
                        'follow_up_questions': []
                    }
            except Exception as e:
                print(f"[ERROR] Error in get_answer: {e}")
                import traceback
                traceback.print_exc()
                answer_payload = {
                    'answer': f'Sorry, I encountered an error: {str(e)}',
                    'citations': [],
                    'follow_up_questions': []
                }

            # Persist conversation if user is authenticated, or create session-based conversation
            if request.user.is_authenticated:
                conv: Conversation | None = None
                if conversation_id:
                    try:
                        conv = Conversation.objects.get(id=conversation_id, user=request.user)
                    except Conversation.DoesNotExist:
                        conv = None
                if conv is None:
                    # Create a new conversation with title as first user message snippet
                    title = query_text[:60]
                    conv = Conversation.objects.create(user=request.user, title=title, messages=[], documents=[])
                    conversation_id = str(conv.id)
                # Append user and assistant messages
                conv.messages.append({'sender': 'user', 'content': query_text, 'timestamp': _now_iso()})
                conv.messages.append({'sender': 'assistant', 'content': answer_payload['answer'], 'timestamp': _now_iso()})
                # Update title if empty
                if not conv.title:
                    conv.title = query_text[:60]
                # Persist last citations/follow-ups if available
                try:
                    conv.last_citations = answer_payload.get('citations', [])
                    conv.last_follow_ups = answer_payload.get('follow_up_questions', [])
                except Exception:
                    pass
                conv.save()
                answer_payload['conversation_id'] = conv.id
            else:
                # For non-authenticated users, create session-based conversation if needed
                if not conversation_id:
                    import uuid
                    conversation_id = str(uuid.uuid4())
                
                # Store messages in session
                if 'conversation_messages' not in request.session:
                    request.session['conversation_messages'] = {}
                if conversation_id not in request.session['conversation_messages']:
                    request.session['conversation_messages'][conversation_id] = []
                
                request.session['conversation_messages'][conversation_id].append({
                    'sender': 'user', 
                    'content': query_text, 
                    'timestamp': _now_iso()
                })
                request.session['conversation_messages'][conversation_id].append({
                    'sender': 'assistant', 
                    'content': answer_payload['answer'], 
                    'timestamp': _now_iso()
                })
                request.session.save()
                answer_payload['conversation_id'] = conversation_id

            return JsonResponse(answer_payload)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)
    return JsonResponse({'error': 'Invalid request method'}, status=400)

# Serve uploaded PDFs (development use)
def serve_uploaded_pdf(request, filename):
    file_path = os.path.join(UPLOAD_DIR, filename)
    print(f"[DEBUG] PDF serving - filename: {filename}")
    print(f"[DEBUG] PDF serving - UPLOAD_DIR: {UPLOAD_DIR}")
    print(f"[DEBUG] PDF serving - file_path: {file_path}")
    print(f"[DEBUG] PDF serving - file exists: {os.path.isfile(file_path)}")
    
    if not os.path.isfile(file_path):
        print(f"[ERROR] PDF file not found: {file_path}")
        raise Http404('File not found')
    
    print(f"[DEBUG] PDF serving - serving file: {file_path}")
    response = FileResponse(open(file_path, 'rb'), content_type='application/pdf')
    # Allow PDF to be displayed in iframe
    response['X-Frame-Options'] = 'SAMEORIGIN'
    # Force inline display instead of opening in browser PDF viewer
    response['Content-Disposition'] = 'inline'
    # Prevent browser from opening PDF in new tab
    response['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response['Pragma'] = 'no-cache'
    response['Expires'] = '0'
    return response


# -------- Conversation APIs -------- #

def _now_iso():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


def restore_conversation_embeddings(conversation_id, documents):
    """Restore embeddings for a conversation's documents"""
    try:
        from rag_app import in_memory_chunks, in_memory_embeddings, in_memory_metadata, process_pdf
        import os
        
        print(f"[DEBUG] Restoring embeddings for conversation {conversation_id} with documents: {documents}")
        
        # Clear existing embeddings first
        in_memory_chunks.clear()
        in_memory_embeddings.clear()
        in_memory_metadata.clear()
        
        # Process each document for this conversation
        for doc_name in documents:
            file_path = os.path.join(UPLOAD_DIR, doc_name)
            if os.path.exists(file_path):
                print(f"[DEBUG] Processing document: {doc_name}")
                process_pdf(file_path, doc_name, str(conversation_id))
            else:
                print(f"[WARNING] Document not found: {file_path}")
        
        print(f"[DEBUG] Restored {len(in_memory_chunks)} chunks for conversation {conversation_id}")
        
    except Exception as e:
        print(f"[ERROR] Failed to restore embeddings: {e}")


@login_required
def conversations_list(request):
    if request.method != 'GET':
        return JsonResponse({'error': 'Invalid request method'}, status=400)
    convs = Conversation.objects.filter(user=request.user).values('id', 'title', 'created_at', 'updated_at')
    # Serialize datetimes to ISO
    data = [
        {
            'id': c['id'],
            'title': c['title'] or '',
            'created_at': c['created_at'].isoformat() if hasattr(c['created_at'], 'isoformat') else c['created_at'],
            'updated_at': c['updated_at'].isoformat() if hasattr(c['updated_at'], 'isoformat') else c['updated_at'],
        }
        for c in convs
    ]
    return JsonResponse({'conversations': data})


@csrf_exempt
@login_required
def conversations_detail(request, conversation_id: int):
    try:
        conv = Conversation.objects.get(id=conversation_id, user=request.user)
    except Conversation.DoesNotExist:
        return JsonResponse({'error': 'Conversation not found'}, status=404)

    if request.method == 'GET':
        # Do not reprocess PDFs; just return metadata and last results for instant display
        return JsonResponse({
            'id': conv.id,
            'title': conv.title or '',
            'messages': conv.messages,
            'documents': conv.documents,
            'citations': conv.last_citations,
            'follow_up_questions': conv.last_follow_ups,
            'created_at': conv.created_at.isoformat(),
            'updated_at': conv.updated_at.isoformat(),
        })

    if request.method == 'POST':
        # Append messages (optional utility)
        try:
            body = json.loads(request.body or '{}')
        except Exception:
            body = {}
        new_messages = body.get('messages') or []
        if isinstance(new_messages, list) and new_messages:
            conv.messages.extend(new_messages)
            conv.save()
        return JsonResponse({'ok': True})

    if request.method == 'DELETE':
        conv.delete()
        return JsonResponse({'ok': True})

    return JsonResponse({'error': 'Invalid request method'}, status=400)


@csrf_exempt
def clear_embeddings(request):
    """Clear all in-memory embeddings when starting a new chat"""
    if request.method == 'POST':
        try:
            # Import the global variables from rag_app
            from rag_app import in_memory_chunks, in_memory_embeddings, in_memory_metadata
            
            # Clear all in-memory data
            in_memory_chunks.clear()
            in_memory_embeddings.clear()
            in_memory_metadata.clear()
            
            print(f"[DEBUG] Cleared all embeddings: {len(in_memory_chunks)} chunks, {len(in_memory_embeddings)} embeddings")
            
            return JsonResponse({'message': 'All embeddings cleared successfully'})
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)
    return JsonResponse({'error': 'Invalid request method'}, status=400)


# -------- PDF Library APIs -------- #

@login_required
def get_pdf_library(request):
    """Get all PDF files from the uploaded_pdfs folder with metadata"""
    try:
        pdf_files = []
        
        print(f"[DEBUG] Looking for PDFs in: {UPLOAD_DIR}")
        print(f"[DEBUG] Directory exists: {os.path.exists(UPLOAD_DIR)}")
        
        if os.path.exists(UPLOAD_DIR):
            all_files = os.listdir(UPLOAD_DIR)
            print(f"[DEBUG] All files in directory: {all_files}")
            
            for filename in all_files:
                if filename.lower().endswith('.pdf'):
                    file_path = os.path.join(UPLOAD_DIR, filename)
                    if os.path.isfile(file_path):
                        # Get file stats
                        stat = os.stat(file_path)
                        file_size = stat.st_size
                        modified_time = stat.st_mtime
                        
                        pdf_files.append({
                            'filename': filename,
                            'file_size': file_size,
                            'file_size_mb': round(file_size / (1024 * 1024), 2),
                            'modified_time': modified_time,
                            'modified_date': os.path.getmtime(file_path),
                            'display_name': filename.replace('.pdf', '').replace('_', ' ').replace('-', ' ')
                        })
                        print(f"[DEBUG] Found PDF: {filename}")
        
        print(f"[DEBUG] Total PDFs found: {len(pdf_files)}")
        
        # Sort by modified time (newest first)
        pdf_files.sort(key=lambda x: x['modified_time'], reverse=True)
        
        return JsonResponse({
            'pdfs': pdf_files,
            'total_count': len(pdf_files)
        })
    except Exception as e:
        print(f"[ERROR] get_pdf_library failed: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@login_required
def process_existing_pdfs(request):
    """Process all existing PDFs in the upload_pdfs folder"""
    if request.method == 'POST':
        try:
            processed_count = 0
            errors = []
            
            if os.path.exists(UPLOAD_DIR):
                for filename in os.listdir(UPLOAD_DIR):
                    if filename.lower().endswith('.pdf'):
                        file_path = os.path.join(UPLOAD_DIR, filename)
                        if os.path.isfile(file_path):
                            try:
                                # Process the PDF using existing logic
                                process_pdf(file_path, filename, None)
                                processed_count += 1
                                print(f"[SUCCESS] Processed: {filename}")
                            except Exception as e:
                                error_msg = f"Failed to process {filename}: {str(e)}"
                                errors.append(error_msg)
                                print(f"[ERROR] {error_msg}")
            
            return JsonResponse({
                'message': f'Processed {processed_count} PDFs successfully',
                'processed_count': processed_count,
                'errors': errors,
                'total_errors': len(errors)
            })
            
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)
    
    return JsonResponse({'error': 'Invalid request method'}, status=400)


@csrf_exempt
@login_required
def search_pdfs(request):
    """Search PDFs based on content relevance"""
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            query = data.get('query', '').strip()
            
            if not query:
                return JsonResponse({'error': 'Query is required'}, status=400)
            
            # Get all PDFs first
            all_pdfs = []
            if os.path.exists(UPLOAD_DIR):
                for filename in os.listdir(UPLOAD_DIR):
                    if filename.lower().endswith('.pdf'):
                        file_path = os.path.join(UPLOAD_DIR, filename)
                        if os.path.isfile(file_path):
                            stat = os.stat(file_path)
                            all_pdfs.append({
                                'filename': filename,
                                'file_size': stat.st_size,
                                'file_size_mb': round(stat.st_size / (1024 * 1024), 2),
                                'modified_time': stat.st_mtime,
                                'display_name': filename.replace('.pdf', '').replace('_', ' ').replace('-', ' ')
                            })
            
            # If no query, return all PDFs
            if not query:
                return JsonResponse({'pdfs': all_pdfs, 'total_count': len(all_pdfs)})
            
            # Search for relevant PDFs using existing RAG logic
            try:
                # Ensure PDFs are processed before searching
                from rag_app import chroma_client, collection_name
                try:
                    collection = chroma_client.get_collection(collection_name)
                    count = collection.count()
                    if count == 0:
                        print("[CHROMADB] No documents found during search, processing PDFs once...")
                        process_all_existing_pdfs_once()
                except:
                    print("[CHROMADB] Collection not found during search, processing PDFs once...")
                    process_all_existing_pdfs_once()
                
                # Use the existing get_answer function to find relevant content
                result = get_answer(query, None)
                
                # Extract source PDFs from citations
                relevant_pdfs = set()
                if isinstance(result, dict) and 'citations' in result:
                    for citation in result['citations']:
                        if 'source_pdf' in citation:
                            relevant_pdfs.add(citation['source_pdf'])
                
                # Filter PDFs based on relevance
                if relevant_pdfs:
                    filtered_pdfs = [pdf for pdf in all_pdfs if pdf['filename'] in relevant_pdfs]
                else:
                    # If no specific matches, return all PDFs (fallback)
                    filtered_pdfs = all_pdfs
                
                return JsonResponse({
                    'pdfs': filtered_pdfs,
                    'total_count': len(filtered_pdfs),
                    'query': query,
                    'relevance_found': len(relevant_pdfs) > 0
                })
                
            except Exception as e:
                print(f"[ERROR] Search failed: {e}")
                # Fallback: return all PDFs
                return JsonResponse({
                    'pdfs': all_pdfs,
                    'total_count': len(all_pdfs),
                    'query': query,
                    'relevance_found': False
                })
                
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)
    
    return JsonResponse({'error': 'Invalid request method'}, status=400)


@login_required
def pdf_viewer(request, pdf_name):
    """PDF viewer page with integrated chat"""
    try:
        # Verify PDF exists
        pdf_path = os.path.join(UPLOAD_DIR, pdf_name)
        print(f"[DEBUG] PDF viewer - pdf_name: {pdf_name}")
        print(f"[DEBUG] PDF viewer - UPLOAD_DIR: {UPLOAD_DIR}")
        print(f"[DEBUG] PDF viewer - pdf_path: {pdf_path}")
        print(f"[DEBUG] PDF viewer - file exists: {os.path.exists(pdf_path)}")
        
        if not os.path.exists(pdf_path):
            print(f"[ERROR] PDF file not found: {pdf_path}")
            raise Http404('PDF not found')
        
        # Get PDF metadata
        stat = os.stat(pdf_path)
        file_size = round(stat.st_size / (1024 * 1024), 2)
        modified_time = stat.st_mtime
        
        context = {
            'pdf_name': pdf_name,
            'pdf_display_name': pdf_name.replace('.pdf', '').replace('_', ' ').replace('-', ' '),
            'file_size_mb': file_size,
            'modified_time': modified_time
        }
        
        print(f"[DEBUG] PDF viewer - context: {context}")
        return render(request, 'ragapp/pdf_viewer.html', context)
        
    except Exception as e:
        print(f"[ERROR] PDF viewer error: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)


@login_required
def system_status(request):
    """Check system status - PDFs and ChromaDB"""
    try:
        from rag_app import chroma_client, collection_name
        
        # Count PDFs
        pdf_count = 0
        if os.path.exists(UPLOAD_DIR):
            pdf_count = len([f for f in os.listdir(UPLOAD_DIR) if f.lower().endswith('.pdf')])
        
        # Check ChromaDB
        embeddings_count = 0
        embeddings_loaded = False
        try:
            collection = chroma_client.get_collection(collection_name)
            embeddings_count = collection.count()
            embeddings_loaded = embeddings_count > 0
        except:
            embeddings_loaded = False
        
        return JsonResponse({
            'pdf_count': pdf_count,
            'embeddings_count': embeddings_count,
            'embeddings_loaded': embeddings_loaded,
            'system_ready': embeddings_loaded and pdf_count > 0,
            'storage_type': 'ChromaDB'
        })
        
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)
