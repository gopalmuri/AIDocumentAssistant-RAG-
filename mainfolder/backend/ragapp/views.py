from django.shortcuts import render, get_object_or_404, redirect
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



# Global ID to track server restarts
import uuid
SERVER_INSTANCE_ID = str(uuid.uuid4())

# Global processing status tracker
# Format: {filename: {'status': 'processing'|'ready', 'timestamp': float}}
processing_status = {}


def landing_page_view(request):
    """Refactored landing page view - always public"""
    return render(request, 'ragapp/landing.html')

def dashboard_view(request):
    """
    Dashboard view - access controlled by Frontend Clerk SDK.
    Initializes RAG system/ChromaDB on load.
    """
    try:
        from rag_app import get_chroma_collection, process_pdf
        
        # Check if ChromaDB collection exists and has data
        try:
            collection = get_chroma_collection()
            count = collection.count()
            print(f"[CHROMADB] Found {count} documents in ChromaDB")
            
            # Use existing documents
            load_embeddings_from_chromadb()
            
            # SMART AUTO-PROCESSING (Gentle Mode)
            # Check for ONE file that exists in uploaded_pdfs but NOT in ChromaDB
            if os.path.exists(UPLOAD_DIR):
                pdf_files = [f for f in os.listdir(UPLOAD_DIR) if f.lower().endswith('.pdf')]
                
                # Get list of already processed files from ChromaDB metadata (cached in memory)
                from rag_app import in_memory_metadata
                processed_filenames = set(m.get('source_pdf') for m in in_memory_metadata if m.get('source_pdf'))
                
                for pdf_file in pdf_files:
                    if pdf_file not in processed_filenames:
                        print(f"[AUTO-PROCESS] Found new file: {pdf_file}. Processing ONE file gently...")
                        try:
                            file_path = os.path.join(UPLOAD_DIR, pdf_file)
                            # Process just this one file
                            process_pdf(file_path, pdf_file, None)
                            print(f"[AUTO-PROCESS] Successfully processed {pdf_file}")
                            # Break after one file to save RAM/CPU (Lazy Batching)
                            break 
                        except Exception as e:
                            print(f"[AUTO-PROCESS] Failed to process {pdf_file}: {e}")
                            
        except Exception as e:
            print(f"[CHROMADB] Collection check error: {e}")
            
    except Exception as e:
        print(f"[CHROMADB] Error: {e}")
    
    return render(request, 'ragapp/dashboard.html')


def load_embeddings_from_chromadb():
    """Load embeddings from ChromaDB into memory"""
    try:
        from rag_app import get_chroma_collection, in_memory_chunks, in_memory_embeddings
        
        collection = get_chroma_collection()
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
        from rag_app import get_chroma_collection
        
        # Check if already processed
        try:
            collection = get_chroma_collection()
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




@csrf_exempt
def upload_files(request):
    if request.method == 'POST':
        import time
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
                # Mark as processing immediately
                processing_status[file.name] = {
                    'status': 'processing',
                    'timestamp': time.time()
                }
                
                # Process all documents (no persistent storage check)
                file_path = os.path.join(UPLOAD_DIR, file.name)
                with open(file_path, 'wb+') as destination:
                    for chunk in file.chunks():
                        destination.write(chunk)
                
                # Link file to conversation if provided (Moved BEFORE processing to ensure it's linked even if processing fails/crashes)
                
                # PRIVACY UPDATE: Track User Ownership
                if request.user.is_authenticated:
                    try:
                        from .models import UserDocument
                        UserDocument.objects.get_or_create(user=request.user, filename=file.name)
                        print(f"[PRIVACY] Linked {file.name} to user {request.user.username}")
                    except Exception as e:
                        print(f"[PRIVACY] Error linking document: {e}")
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
                        request.session.modified = True
                        request.session.save()
                
                # Process PDF (Doing this LAST so that Database Link is safe)
                try:
                    process_pdf(file_path, file.name, conversation_id)
                except Exception as e:
                    print(f"[ERROR] Failed to process PDF {file.name}: {e}")
                    # We do NOT raise the error here, so the user still gets a "Success" response
                    # and the file is in their library, even if AI processing failed.
                
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
            'created_new_conversation': created_new_conversation,
            'processing_status': {name: processing_status.get(name, {}) for name in processed_files}
        })
    return JsonResponse({'error': 'Invalid request method'}, status=400)
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
def document_status_api(request):
    """API endpoint to get current processing status of all documents"""
    return JsonResponse({'status': processing_status})



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
            from rag_app import get_chroma_collection, in_memory_embeddings
            try:
                collection = get_chroma_collection()
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
                    answer_payload = {
                        'answer': result,
                        'citations': [],
                        'follow_up_questions': [],
                        'has_relevant_info': True,
                        'scoped_to_document': pdf_context,
                        'confidence_score': 1.0
                    }
                elif isinstance(result, dict):
                    answer_payload = {
                        'answer': result.get('answer', 'No answer generated'),
                        # Pass all citation fields but ensure page_numbers is a list
                        'citations': [{**c, 'page_numbers': list(c.get('page_numbers', []))} for c in result.get('citations', [])],
                        'follow_up_questions': result.get('follow_up_questions', []),
                        'has_relevant_info': bool(result.get('has_relevant_info', True)),
                        'scoped_to_document': result.get('scoped_to_document', pdf_context),
                        'confidence_score': float(result.get('confidence_score', 0.0))
                    }
                else:
                    # Handle unexpected result type
                    answer_payload = {
                        'answer': f'Unexpected result type: {type(result)}',
                        'citations': [],
                        'follow_up_questions': [],
                        'has_relevant_info': False,
                        'scoped_to_document': pdf_context,
                        'confidence_score': 0.0
                    }
            except Exception as e:
                print(f"[ERROR] Error in get_answer: {e}")
                import traceback
                traceback.print_exc()
                answer_payload = {
                    'answer': f'Sorry, I encountered an error: {str(e)}',
                    'citations': [],
                    'follow_up_questions': [],
                    'has_relevant_info': False,
                    'scoped_to_document': pdf_context,
                    'confidence_score': 0.0
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
                # Append user and assistant messages explicitly to trigger change detection
                msgs = conv.messages
                msgs.append({'sender': 'user', 'content': query_text, 'timestamp': _now_iso()})
                msgs.append({
                    'sender': 'assistant', 
                    'content': answer_payload['answer'], 
                    'citations': answer_payload.get('citations', []),
                    'follow_up_questions': answer_payload.get('follow_up_questions', []),
                    'timestamp': _now_iso()
                })
                conv.messages = msgs # Reassign to ensure save
                # Update title if empty
                if not conv.title:
                    conv.title = query_text[:60]
                # Persist last citations/follow-ups if available
                try:
                    conv.last_citations = answer_payload.get('citations', [])
                    conv.last_follow_ups = answer_payload.get('follow_up_questions', [])
                except Exception as field_error:
                    print(f"[ERROR] Failed to set citations/follow-ups: {field_error}")
                    pass
                try:
                    conv.save()
                    print(f"[DEBUG] Conversation saved successfully: {conv.id}")
                except Exception as save_error:
                    print(f"[ERROR] Failed to save conversation: {save_error}")
                    import traceback
                    traceback.print_exc()
                    # Continue anyway, just don't save
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
                    'citations': answer_payload.get('citations', []),
                    'follow_up_questions': answer_payload.get('follow_up_questions', []),
                    'timestamp': _now_iso()
                })
                request.session.modified = True # Ensure nested changes are picked up
                request.session.save()
                answer_payload['conversation_id'] = conversation_id

            # Ensure conversation_id is a string for JSON serialization
            if 'conversation_id' in answer_payload and isinstance(answer_payload['conversation_id'], int):
                answer_payload['conversation_id'] = str(answer_payload['conversation_id'])
            
            print(f"[DEBUG] Returning payload with keys: {answer_payload.keys()}")
            return JsonResponse(answer_payload)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)
    return JsonResponse({'error': 'Invalid request method'}, status=400)

# Serve uploaded PDFs (development use)
def serve_uploaded_pdf(request, filename):
    from urllib.parse import unquote
    filename = unquote(filename)
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


@csrf_exempt
# @login_required - Clerk handles auth on frontend
def conversations_list(request):
    if request.method != 'GET':
        return JsonResponse({'error': 'Invalid request method'}, status=400)
    
    # Return empty list for now if not authenticated via legacy Django
    if not request.user.is_authenticated:
        return JsonResponse({'conversations': []})

    convs = Conversation.objects.filter(user=request.user).values('id', 'title', 'created_at', 'updated_at', 'is_pinned', 'documents')
    # Serialize datetimes to ISO
    data = [
        {
            'id': c['id'],
            'title': c['title'] or '',
            'created_at': c['created_at'].isoformat() if hasattr(c['created_at'], 'isoformat') else c['created_at'],
            'updated_at': c['updated_at'].isoformat() if hasattr(c['updated_at'], 'isoformat') else c['updated_at'],
            'is_pinned': c['is_pinned'],
            'has_documents': bool(c['documents'] and len(c['documents']) > 0),
        }
        for c in convs
    ]
    return JsonResponse({'conversations': data})


@csrf_exempt
# @login_required
@csrf_exempt
# @login_required
def conversations_detail(request, conversation_id):
    # Support both int (DB) and str (UUID/Session) IDs
    
    # 1. Try DB first if Authenticated
    if request.user.is_authenticated:
        try:
            conv = Conversation.objects.get(id=conversation_id, user=request.user)
            
            if request.method == 'GET':
                return JsonResponse({
                    'id': conv.id,
                    'title': conv.title or '',
                    'messages': conv.messages,
                    'is_favorite': conv.is_favorite,
                    'documents': conv.documents,
                    'citations': conv.last_citations,
                    'follow_up_questions': conv.last_follow_ups,
                    'created_at': conv.created_at.isoformat(),
                    'updated_at': conv.updated_at.isoformat(),
                })
            
            # Handle Updates (POST or PATCH)
            elif request.method in ['POST', 'PATCH']:
                try:
                    body = json.loads(request.body or '{}')
                except Exception:
                    body = {}
                    
                updated = False
                
                # Title Update
                new_title = body.get('title')
                if new_title:
                     conv.title = str(new_title)[:255]
                     updated = True
                
                # Pin Update
                new_pinned = body.get('is_pinned')
                if new_pinned is not None:
                    conv.is_pinned = bool(new_pinned)
                    updated = True

                # Message Append (POST only typically, but allowing here)
                new_messages = body.get('messages')
                if new_messages and isinstance(new_messages, list):
                    conv.messages.extend(new_messages)
                    updated = True

                if updated:
                    conv.save()
                    return JsonResponse({'ok': True, 'title': conv.title, 'is_pinned': conv.is_pinned})
                else:
                    return JsonResponse({'ok': True, 'message': 'No changes made'})

            elif request.method == 'DELETE':
                conv.delete()
                return JsonResponse({'ok': True})
                
        except (Conversation.DoesNotExist, ValueError):
            # If not found in DB, fall through to check Session (just in case mixed usage)
            pass

    # 2. Check Session (Guest Mode)
    str_id = str(conversation_id)
    
    has_msgs = 'conversation_messages' in request.session and str_id in request.session['conversation_messages']
    
    # Session handling
    if has_msgs:
        if request.method == 'GET':
             messages = request.session['conversation_messages'][str_id]
             return JsonResponse({
                    'id': str_id,
                    'title': 'Guest Chat',
                    'messages': messages,
                    'is_favorite': False,
                    'documents': request.session.get('conversation_documents', {}).get(str_id, []),
                    'citations': [],
                    'follow_up_questions': [],
                    'created_at': _now_iso(),
                    'updated_at': _now_iso()
                })
        elif request.method == 'DELETE':
             del request.session['conversation_messages'][str_id]
             # Also clean docs
             if 'conversation_documents' in request.session and str_id in request.session['conversation_documents']:
                 del request.session['conversation_documents'][str_id]
             request.session.save()
             return JsonResponse({'ok': True})
        
        # Session Renaming (Not persistent really, but we can acknowledge it)
        elif request.method in ['POST', 'PATCH']:
            # We don't store titles for sessions in this simple dict structure,
            # so we just return OK to prevent errors.
            return JsonResponse({'ok': True})

    return JsonResponse({'error': 'Conversation not found'}, status=404)


@csrf_exempt
# @login_required
def toggle_favorite_conversation(request, conversation_id: int):
    # Authenticated only
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Auth required'}, status=403)
    
    if request.method != 'POST':
        return JsonResponse({'error': 'Invalid request method'}, status=400)

    try:
        conv = Conversation.objects.get(id=conversation_id, user=request.user)
        # Toggle
        conv.is_favorite = not conv.is_favorite
        conv.save()
        return JsonResponse({'ok': True, 'is_favorite': conv.is_favorite})
    except Conversation.DoesNotExist:
        return JsonResponse({'error': 'Conversation not found'}, status=404)


@csrf_exempt
def bulk_delete_conversations(request):
    """Delete multiple conversations at once."""
    if request.method != 'POST':
        return JsonResponse({'error': 'Invalid request method'}, status=400)
    
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Auth required'}, status=403)

    try:
        data = json.loads(request.body)
        conversation_ids = data.get('ids', [])
        
        if not conversation_ids or not isinstance(conversation_ids, list):
             return JsonResponse({'error': 'Invalid IDs provided'}, status=400)

        # Bulk delete for the authenticated user
        count, _ = Conversation.objects.filter(id__in=conversation_ids, user=request.user).delete()
        
        return JsonResponse({'ok': True, 'deleted_count': count})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


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

# @login_required
def get_pdf_library(request):
    """Get all PDF files from the uploaded_pdfs folder with metadata"""
    try:
        from rag_app import get_chroma_collection
        import PyPDF2
        
        pdf_files = []
        existing_filenames = set()
        
        # Get all processed documents from ChromaDB
        processed_docs = {}
        try:
            collection = get_chroma_collection()
            all_docs = collection.get(include=['metadatas'])
            
            if all_docs and 'metadatas' in all_docs:
                for metadata in all_docs['metadatas']:
                    source_pdf = metadata.get('source_pdf', '')
                    if source_pdf:
                        if source_pdf not in processed_docs:
                            processed_docs[source_pdf] = 0
                        processed_docs[source_pdf] += 1
                
        except Exception as e:
            print(f"[PDF_LIBRARY] Error checking ChromaDB: {e}")
        
        if os.path.exists(UPLOAD_DIR):
            all_files = os.listdir(UPLOAD_DIR)

            # PRIVACY FILTER: Get list of user's owned files
            user_documents = set()
            if request.user.is_authenticated:
                from .models import UserDocument
                # Get filenames owned by this user
                user_docs = UserDocument.objects.filter(user=request.user).values_list('filename', flat=True)
                user_documents.update(user_docs)
            
            # Also get list of ALL owned files to identify "Global" ones
            # A file is Global if NO ONE owns it.
            # (If User A owns it, User B shouldn't see it unless B also owns it).
            if request.user.is_authenticated:
                 # Logic: Show if (File in UserDocs) OR (File NOT in AnyUserDocs)
                 # Get all filenames that HAVE an owner
                 all_owned_files = set(UserDocument.objects.values_list('filename', flat=True))
                 
            for filename in all_files:
                # PRIVACY CHECK
                if request.user.is_authenticated:
                    is_mine = filename in user_documents
                    is_global = filename not in all_owned_files
                    
                    if not (is_mine or is_global):
                        # Skip if it belongs to someone else but not me, and not global
                        continue
                if filename.lower().endswith('.pdf'):
                    existing_filenames.add(filename)
                    filepath = os.path.join(UPLOAD_DIR, filename)
                    file_size = os.path.getsize(filepath)
                    modified_time = os.path.getmtime(filepath)
                    
                    # Check processing status
                    chunk_count = processed_docs.get(filename, 0)
                    status_info = processing_status.get(filename, {})
                    
                    # Determine status:
                    # 1. If chunks exist in ChromaDB -> 'ready' (already processed)
                    # 2. If currently being uploaded (in processing_status) -> 'processing'
                    # 3. Otherwise -> 'ready' (old file, not being processed right now)
                    if chunk_count > 0:
                        status = 'ready'
                    elif filename in processing_status and status_info.get('status') == 'processing':
                        # Only show processing if actively being uploaded right now
                        status = 'processing'
                    else:
                        # Old files that haven't been processed yet - show as ready
                        status = 'ready'
                    
                    # Get page count
                    page_count = None
                    try:
                        with open(filepath, 'rb') as f:
                            pdf_reader = PyPDF2.PdfReader(f)
                            page_count = len(pdf_reader.pages)
                    except Exception as e:
                        pass  # Silently skip page count errors
                    
                    # Add ALL documents to the list (both processing and ready)
                    pdf_files.append({
                        'filename': filename,
                        'size': file_size,
                        'modified': modified_time,
                        'pages': page_count,
                        'page_count': page_count,
                        'status': status,
                        'chunk_count': chunk_count
                    })
        
        # Sort by modified time (newest first) so new documents appear at the top
        pdf_files.sort(key=lambda x: x['modified'], reverse=True)
        
        # Only log summary
        processing_count = sum(1 for pdf in pdf_files if pdf['status'] == 'processing')
        ready_count = sum(1 for pdf in pdf_files if pdf['status'] == 'ready')
        if processing_count > 0 or ready_count > 0:
            print(f"[PDF_LIBRARY] {len(pdf_files)} documents: {ready_count} ready, {processing_count} processing")


        
        # Clean up ChromaDB for deleted files
        try:
            collection = get_chroma_collection()
            all_docs = collection.get(include=['metadatas'])
            
            if all_docs and 'metadatas' in all_docs:
                deleted_count = 0
                ids_to_delete = []
                
                for i, metadata in enumerate(all_docs['metadatas']):
                    source_pdf = metadata.get('source_pdf', '')
                    if source_pdf and source_pdf not in existing_filenames:
                        if 'ids' in all_docs and i < len(all_docs['ids']):
                            ids_to_delete.append(all_docs['ids'][i])
                            deleted_count += 1
                
                if ids_to_delete:
                    collection.delete(ids=ids_to_delete)
                    print(f"[PDF_LIBRARY] Removed {deleted_count} embeddings for deleted PDFs")
        except Exception as e:
            print(f"[PDF_LIBRARY] Error cleaning up ChromaDB: {e}")
        
        return JsonResponse({'pdfs': pdf_files})
    except Exception as e:
        print(f"[PDF_LIBRARY] Error in get_pdf_library: {e}")
        import traceback
        traceback.print_exc()
        return JsonResponse({'error': str(e)}, status=500)




@csrf_exempt
# @login_required
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
# @login_required
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
                from rag_app import get_chroma_collection
                try:
                    collection = get_chroma_collection()
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
        from rag_app import get_chroma_collection
        
        # Count PDFs
        pdf_count = 0
        if os.path.exists(UPLOAD_DIR):
            pdf_count = len([f for f in os.listdir(UPLOAD_DIR) if f.lower().endswith('.pdf')])
        
        # Check ChromaDB
        embeddings_count = 0
        embeddings_loaded = False
        try:
            collection = get_chroma_collection()
            embeddings_count = collection.count()
            embeddings_loaded = embeddings_count > 0
        except:
            embeddings_loaded = False
        
        return JsonResponse({
            'pdf_count': pdf_count,
            'embeddings_count': embeddings_count,
            'embeddings_loaded': embeddings_loaded,
            'embeddings_loaded': embeddings_loaded,
            'system_ready': embeddings_loaded and pdf_count > 0,
            'storage_type': 'ChromaDB',
            'server_instance_id': SERVER_INSTANCE_ID
        })
        
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

def upload_page_view(request):
    return render(request, 'ragapp/upload.html')

@login_required
def toggle_favorite(request):
    """Toggle favorite status of a document."""
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            filename = data.get('filename')
            if not filename:
                return JsonResponse({'error': 'Filename is required'}, status=400)
            
            from .models import Favorite
            favorite, created = Favorite.objects.get_or_create(user=request.user, filename=filename)
            
            if not created:
                # If it already existed, delete it (toggle off)
                favorite.delete()
                is_favorite = False
            else:
                is_favorite = True
            
            return JsonResponse({'is_favorite': is_favorite, 'filename': filename})
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)
    return JsonResponse({'error': 'Invalid request method'}, status=400)


@login_required
def get_user_favorites(request):
    """Get list of favorite filenames for the user."""
    try:
        from .models import Favorite
        favorites = Favorite.objects.filter(user=request.user).values('filename', 'created_at')
        data = [
            {
                'filename': f['filename'],
                'created_at': f['created_at'].isoformat() if hasattr(f['created_at'], 'isoformat') else f['created_at']
            }
            for f in favorites
        ]
        return JsonResponse({'favorites': data})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


def history_page_view(request):
    return render(request, 'ragapp/history.html')

def favorites_page_view(request):
    return render(request, 'ragapp/favorites.html')

@login_required
def profile_page_view(request):
    success_message = None
    from .models import UserProfile
    
    # Ensure profile exists
    profile, created = UserProfile.objects.get_or_create(user=request.user)

    if request.method == 'POST':
        first_name = request.POST.get('first_name', '').strip()
        last_name = request.POST.get('last_name', '').strip()
        
        user = request.user
        user.first_name = first_name
        user.last_name = last_name
        user.save()

        # Handle Avatar
        if 'avatar' in request.FILES:
            profile.avatar = request.FILES['avatar']
            profile.save()
        elif request.POST.get('remove_avatar') == 'true':
            if profile.avatar:
                profile.avatar.delete() # Remove file
                profile.save() # Field becomes empty (null/blank)
        
        # Use messages framework and redirect to prevent resubmission
        messages.success(request, "Profile updated successfully!")
        return redirect('profile_page')
        
    return render(request, 'ragapp/profile.html', {
        'profile': profile,
        'start_date': request.user.date_joined,
        'last_login': request.user.last_login
    })

def password_change_page_view(request):
    return render(request, 'ragapp/password_change.html')
    return render(request, 'ragapp/password_change.html')

@login_required
def get_current_user(request):
    """API to get current user info including avatar."""
    data = {
        'username': request.user.username,
        'email': request.user.email,
        'first_name': request.user.first_name,
        'last_name': request.user.last_name,
        'avatar_url': None
    }
    
    try:
        # Robust check for OneToOne field
        if hasattr(request.user, 'userprofile'):
            profile = request.user.userprofile
            if profile.avatar:
                data['avatar_url'] = profile.avatar.url
    except Exception as e:
        print(f"Error fetching avatar for {request.user}: {e}")
        pass
        
    return JsonResponse(data)

@login_required
def chat_page_view(request):
    """Render the dedicated chat page."""
    return render(request, 'ragapp/chat.html')


@login_required
def toggle_favorite_message(request):
    """Toggle favorite status of a message (save/unsave)."""
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            question = data.get('question')
            answer = data.get('answer')
            
            if not question or not answer:
                return JsonResponse({'error': 'Question and Answer are required'}, status=400)
            
            from .models import FavoriteMessage
            # Check if exists (exact match on Q&A for simplicity)
            fav, created = FavoriteMessage.objects.get_or_create(
                user=request.user,
                question=question,
                defaults={'answer': answer}
            )
            
            if not created:
                # If exists, we assume user might want to remove it? 
                # Or simplistic toggle: if passed ID, remove. Here we stick to "Add if not exists".
                # To support toggle off from the UI without ID, we can check if it exists and delete.
                fav.delete()
                is_saved = False
            else:
                is_saved = True
            
            return JsonResponse({'is_saved': is_saved})
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)
    return JsonResponse({'error': 'Invalid request method'}, status=400)



