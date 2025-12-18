import os
# import fitz # Moved to extract_text_per_page
import re
import json
import csv
import time
import datetime
# import nltk # Moved to usage
# from sentence_transformers import SentenceTransformer # Moved to get_model
# import chromadb # Moved to get_chroma_collection
# import ollama # Removed for production deployment
# from sklearn.metrics.pairwise import cosine_similarity # Moved to usage
# import numpy as np # Moved where needed or kept if light (numpy is medium, generally okay if simple, but let's be safe for Free Tier)
# import textwrap
# import pdfplumber
# from sklearn.feature_extraction.text import TfidfVectorizer # Moved to usage
from collections import defaultdict
from typing import List, Dict, Any
# from groq import Groq # Moved to query_gemini
# Constants
# Constants
# Global variable for lazy loading
_model = None
_nlp = None

def get_model():
    global _model
    if _model is None:
        print("[INFO] Loading SentenceTransformer model...")
        from sentence_transformers import SentenceTransformer
        _model = SentenceTransformer('all-MiniLM-L6-v2')
    return _model

def get_nlp():
    global _nlp
    if _nlp is None:
        print("[INFO] Loading Spacy model...")
        import spacy
        _nlp = spacy.load("en_core_web_sm")
    return _nlp

pdf_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploaded_pdfs")
log_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), "time_report_ingestion.csv")
cache_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "embeddings_cache")

# Lazy ChromaDB
_collection = None

def get_chroma_collection():
    global _collection
    if _collection is None:
        print("[INFO] Loading ChromaDB...")
        import chromadb
        project_root = os.path.dirname(os.path.dirname(__file__))
        chroma_client = chromadb.PersistentClient(path=os.path.join(project_root, "chroma_db"))
        collection_name = "rag_documents"
        try:
            _collection = chroma_client.get_collection(collection_name)
            print(f"[CHROMADB] Using existing collection: {collection_name}")
        except:
            _collection = chroma_client.create_collection(collection_name)
            print(f"[CHROMADB] Created new collection: {collection_name}")
    return _collection

# In-memory storage for backward compatibility
in_memory_chunks = {}  # Store all chunks in memory as dictionary
in_memory_embeddings = {}  # Store all embeddings in memory as dictionary
in_memory_metadata = []  # Store all metadata in memory

# Ensure directories exist
os.makedirs(pdf_dir, exist_ok=True)
os.makedirs(cache_dir, exist_ok=True)

# -------- PDF Utils -------- #

def extract_text_per_page(pdf_path):
    import fitz
    doc = fitz.open(pdf_path)
    page_texts = []
    for page_num in range(len(doc)):
        page = doc.load_page(page_num)
        text = page.get_text("text")
        cleaned = clean_text(text)
        if cleaned.strip():  # Skip empty pages
            page_texts.append({
                "page_no": page_num + 1,
                "text": cleaned
            })
    doc.close()
    return page_texts

def clean_text(text):
    text = re.sub(r'[^\x00-\x7F]+', '', text)#sub is regular expression substitution
    text = re.sub(r'\s+', ' ', text)#one or more characters that are not ASCII” (like emojis, Chinese, Tamil, etc.).
    return text.strip()#

# import spacy
# from spacy.lang.en import English
# nlp = spacy.load("en_core_web_sm") # MOVED TO get_nlp()

#spaCy is used for intelligent text chunking that preserves semantic meaning

def chunk_text(text, chunk_size=800, overlap=50):
    """
    Improved chunking using spaCy sentence segmentation to better capture semantic units.
    Chunks are created by grouping sentences until chunk_size tokens are reached, with overlap.
    """
    nlp_engine = get_nlp()
    doc = nlp_engine(text)
    sentences = [sent.text.strip() for sent in doc.sents]
    chunks = []
    current_chunk = []
    current_length = 0

    for sentence in sentences:
        sentence_length = len(sentence.split())
        if current_length + sentence_length > chunk_size:
            chunks.append(" ".join(current_chunk))
            # overlap: keep last few sentences for next chunk
            overlap_sentences = current_chunk[-(overlap // 20):] if overlap > 0 else []
            current_chunk = overlap_sentences.copy()
            current_length = sum(len(s.split()) for s in current_chunk)
        current_chunk.append(sentence)
        current_length += sentence_length;

    if current_chunk:
        chunks.append(" ".join(current_chunk))
    return chunks

def analyze_pdf(file_path):
    try:
        import pdfplumber
        with pdfplumber.open(file_path) as pdf:
            num_pages = len(pdf.pages)
            total_words = 0
            for page in pdf.pages:
                text = page.extract_text() or ""
                total_words += len(text.split())
            return num_pages, total_words
    except Exception as e:
        print(f"Error processing {file_path}: {e}")
        return 0, 0

def process_pdf(file_path, filename, conversation_id: str | None = None):
    insight_time = embedding_time = store_time = 0.0
    start_total = time.perf_counter()
    print(f"\n[PDF] [{datetime.datetime.now().strftime('%H:%M:%S')}] Starting: {filename}")

    try:
        page_texts = extract_text_per_page(file_path)
        num_pages, total_words = analyze_pdf(file_path)

        # Single loop: Generate embeddings and store to ChromaDB
        start_embed = time.perf_counter()
        global_chunk_idx = 0
        for page_info in page_texts:
            page_chunks = chunk_text(page_info["text"])
            embedding_model = get_model()
            page_embeddings = embedding_model.encode(page_chunks)  # Generate embeddings once
            
            for idx, (chunk, embedding) in enumerate(zip(page_chunks, page_embeddings)):
                doc_id = f"{filename}_{global_chunk_idx}"
                metadata = {
                    "id": doc_id,
                    "type": "pdf_chunk",
                    "source_pdf": filename,
                    "chunk_index": global_chunk_idx,
                    "page_no": page_info["page_no"],
                    "conversation_id": conversation_id if conversation_id else "global",
                }
                # Store in ChromaDB
                # Store in ChromaDB
                get_chroma_collection().add(
                    documents=[chunk],
                    embeddings=[embedding.tolist()],
                    metadatas=[metadata],
                    ids=[doc_id]
                )
                
                # Also store in memory for backward compatibility with full metadata
                chunk_id = f"chunk_{len(in_memory_chunks)}"
                in_memory_chunks[chunk_id] = {
                    'content': chunk,
                    'chunk_text': chunk,
                    'metadata': metadata,
                    'source': metadata.get('source', 'Unknown'),
                    'source_pdf': metadata.get('source_pdf', 'Unknown'),
                    'page_no': metadata.get('page_no', 1),
                    'page_number': metadata.get('page_no', 1),
                    'chunk_id': metadata.get('id', chunk_id),
                    'document_id': metadata.get('id', chunk_id)
                }
                in_memory_embeddings[chunk_id] = embedding.tolist()
                in_memory_metadata.append(metadata)
                global_chunk_idx += 1
        
        end_embed = time.perf_counter()
        embedding_time = end_embed - start_embed
        store_time = embedding_time  # Store time is same as embedding time now

        total_time = time.perf_counter() - start_total

        print(f"[OK] Finished {filename} | [EMBED] Embed: {embedding_time:.2f}s | [STORE] Store: {store_time:.2f}s | [TIME] Total: {total_time:.2f}s")

        with open(log_file, mode='a', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow([
                filename,
                num_pages,
                total_words,
                f"{embedding_time:.2f}",
                f"{store_time:.2f}",
                f"{total_time:.2f}",
                "success",
                ""
            ])

        # Persist a cache for this conversation so we can reload instantly later
        if conversation_id:
            _write_conversation_cache(conversation_id)
        
        # Mark document as ready in processing status
        try:
            from ragapp.views import processing_status
            processing_status[filename] = {
                'status': 'ready',
                'timestamp': time.time()
            }
            print(f"[STATUS] Marked {filename} as ready")
        except Exception as e:
            print(f"[STATUS] Error updating status: {e}")

    except Exception as e:
        print(f"[ERROR] Error with {filename}: {e}")
        with open(log_file, mode='a', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow([
                filename,
                0,
                0,
                f"{embedding_time:.2f}",
                f"{store_time:.2f}",
                f"{time.perf_counter() - start_total:.2f}",
                "failed",
                str(e)
            ])
        return filename

    return None

# Retrieval functions

def filter_chunks_by_document(chunks, pdf_filename):
    """
    Filter chunks to only include those from a specific PDF document.
    Args:
        chunks: Dictionary of chunks with metadata
        pdf_filename: Name of the PDF file to filter by
    Returns:
        Filtered dictionary of chunks from the specified document
    """
    if not pdf_filename:
        return chunks
    
    filtered = {}
    for chunk_id, chunk_data in chunks.items():
        source_pdf = chunk_data.get('source_pdf', chunk_data.get('source', ''))
        # Match exact filename or filename without extension
        if source_pdf == pdf_filename or source_pdf.replace('.pdf', '') == pdf_filename.replace('.pdf', ''):
            filtered[chunk_id] = chunk_data
    
    print(f"[FILTER] Filtered {len(filtered)} chunks from {pdf_filename} (out of {len(chunks)} total)")
    return filtered

def calculate_confidence_score(retrieved_chunks, query):
    """
    Calculate confidence score based on similarity scores of retrieved chunks.
    Args:
        retrieved_chunks: List of retrieved chunks with similarity scores
        query: The user's query
    Returns:
        Confidence score between 0.0 and 1.0
    """
    if not retrieved_chunks:
        return 0.0
    
    # Get average similarity score from top chunks
    # Check for both 'similarity' and 'similarity_score' keys
    similarities = [chunk.get('similarity_score', chunk.get('similarity', 0.0)) for chunk in retrieved_chunks[:3]]
    if not similarities:
        return 0.0
    
    avg_similarity = sum(similarities) / len(similarities)
    return avg_similarity

def format_no_answer_response(pdf_context=None, reason="no_relevant_info"):
    """
    Format a transparent no-answer response.
    Args:
        pdf_context: Name of the PDF if scoped to a specific document
        reason: Reason for no answer ("no_relevant_info", "not_in_document", "no_documents")
    Returns:
        Structured response dictionary
    """
    messages = {
        "no_relevant_info": "No relevant information found in your documents.",
        "not_in_document": f"Information not found in {pdf_context}.",
        "no_documents": "No documents are currently available for querying. Please upload documents first."
    }
    
    follow_ups = {
        "no_relevant_info": [
            "Try rephrasing your question",
            "Upload more relevant documents",
            "Ask a different question"
        ],
        "not_in_document": [
            "Search all documents instead?",
            "Try a different question about this document",
            "Upload additional related documents"
        ],
        "no_documents": [
            "How do I upload documents?",
            "What file formats are supported?",
            "Can I upload multiple files?"
        ]
    }
    
    message = messages.get(reason, messages["no_relevant_info"])
    if pdf_context and reason == "not_in_document":
        message = f"Information not found in {pdf_context}."
    
    return {
        "answer": message,
        "has_relevant_info": False,
        "citations": [],
        "follow_up_questions": follow_ups.get(reason, follow_ups["no_relevant_info"]),
        "scoped_to_document": pdf_context,
        "confidence_score": 0.0
    }

def convert_query_to_embedding(query):
    return model.encode(query)


def _conversation_cache_path(conversation_id: str) -> str:
    safe_id = str(conversation_id)
    return os.path.join(cache_dir, f"conv_{safe_id}.json")


def _write_conversation_cache(conversation_id: str) -> None:
    """Write all in-memory entries for a conversation to a JSON cache file."""
    try:
        cid = str(conversation_id)
        items = []
        for chunk_id, chunk in in_memory_chunks.items():
            # Find corresponding embedding and metadata by index
            chunk_index = int(chunk_id.split('_')[1]) if '_' in chunk_id else 0
            if chunk_id in in_memory_embeddings and chunk_index < len(in_memory_metadata):
                emb = in_memory_embeddings[chunk_id]
                meta = in_memory_metadata[chunk_index]
            if meta.get("conversation_id") == cid:
                items.append({
                    "chunk": chunk,
                    "embedding": emb,
                    "metadata": meta,
                })
        path = _conversation_cache_path(cid)
        with open(path, 'w', encoding='utf-8') as f:
            json.dump({"items": items}, f)
        print(f"[CACHE] Wrote conversation cache: {path} ({len(items)} items)")
    except Exception as e:
        print(f"[CACHE] Failed to write cache for {conversation_id}: {e}")


def _load_conversation_cache(conversation_id: str) -> bool:
    """Load conversation cache into memory (replacing current memory for speed). Returns True if loaded."""
    try:
        path = _conversation_cache_path(conversation_id)
        if not os.path.isfile(path):
            return False
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        items = data.get("items", [])
        # Replace in-memory with only this conversation's items
        in_memory_chunks.clear()
        in_memory_embeddings.clear()
        in_memory_metadata.clear()
        for i, it in enumerate(items):
            chunk_id = f"chunk_{i}"
            metadata = it.get("metadata", {})
            chunk_text = it.get("chunk", "")
            # Store with full metadata structure
            in_memory_chunks[chunk_id] = {
                'content': chunk_text,
                'chunk_text': chunk_text,
                'metadata': metadata,
                'source': metadata.get('source', 'Unknown'),
                'source_pdf': metadata.get('source_pdf', 'Unknown'),
                'page_no': metadata.get('page_no', 1),
                'page_number': metadata.get('page_no', 1),
                'chunk_id': metadata.get('id', chunk_id),
                'document_id': metadata.get('id', chunk_id)
            }
            in_memory_embeddings[chunk_id] = it.get("embedding", [])
            in_memory_metadata.append(metadata)
        print(f"[CACHE] Loaded conversation cache: {path} ({len(items)} items)")
        return len(items) > 0
    except Exception as e:
        print(f"[CACHE] Failed to load cache for {conversation_id}: {e}")
        return False

def convert_query_to_embedding(query):
    embedding_model = get_model()
    return embedding_model.encode(query)

def retrieve_similar_chunks(query, top_k=10, similarity_threshold=0.7, conversation_id: str | None = None, custom_chunks=None, custom_embeddings=None):
    try:
        import time
        print(f"[SEARCH] Converting query to embedding...")
        embedding_start = time.perf_counter()
        query_embedding = convert_query_to_embedding(query)
        embedding_time = time.perf_counter() - embedding_start
        print(f"[TIME] Query embedding took: {embedding_time:.2f}s")
        
        # Use custom chunks/embeddings if provided, otherwise use ChromaDB
        if custom_chunks is not None and custom_embeddings is not None:
            print(f"[SEARCH] Using custom chunks/embeddings with {len(custom_embeddings)} items...")
            similarity_start = time.perf_counter()
            
            similarities = []
            for chunk_id, chunk_embedding in custom_embeddings.items():
                # Reshape to 2D arrays for cosine_similarity
                # Reshape to 2D arrays for cosine_similarity
                import numpy as np
                from sklearn.metrics.pairwise import cosine_similarity
                
                query_2d = query_embedding.reshape(1, -1) if hasattr(query_embedding, 'reshape') else np.array(query_embedding).reshape(1, -1)
                chunk_2d = chunk_embedding.reshape(1, -1) if hasattr(chunk_embedding, 'reshape') else np.array(chunk_embedding).reshape(1, -1)
                similarity = cosine_similarity(query_2d, chunk_2d)[0][0]
                similarities.append((chunk_id, similarity))
            
            # Sort by similarity (descending)
            similarities.sort(key=lambda x: x[1], reverse=True)
            
            # Filter by threshold and get top_k
            filtered_similarities = [(chunk_id, sim) for chunk_id, sim in similarities if sim >= similarity_threshold]
            top_similarities = filtered_similarities[:top_k]
            
            similarity_time = time.perf_counter() - similarity_start
            print(f"[TIME] Custom similarity computation took: {similarity_time:.2f}s")
            
            similar_chunks = []
            for chunk_id, similarity in top_similarities:
                if chunk_id in custom_chunks:
                    chunk_data = custom_chunks[chunk_id].copy()
                    chunk_data['similarity_score'] = similarity
                    chunk_data['chunk_id'] = chunk_id
                    similar_chunks.append(chunk_data)
            
            print(f"[SEARCH] Found {len(similar_chunks)} chunks using custom embeddings")
        else:
            # Use ChromaDB for retrieval
            print(f"[SEARCH] Searching ChromaDB with {top_k} results...")
            similarity_start = time.perf_counter()
            
            # Prepare where clause for conversation filtering
            where_clause = None
            if conversation_id:
                where_clause = {"conversation_id": conversation_id}
            
            # Query ChromaDB
            # Query ChromaDB
            results = get_chroma_collection().query(
                query_embeddings=[query_embedding.tolist()],
                n_results=top_k,
                where=where_clause
            )
            
            similarity_time = time.perf_counter() - similarity_start
            print(f"[TIME] ChromaDB search took: {similarity_time:.2f}s")
            
            similar_chunks = []
            if results['documents'] and results['documents'][0]:
                for i, (doc, metadata, distance) in enumerate(zip(
                    results['documents'][0], 
                    results['metadatas'][0], 
                    results['distances'][0]
                )):
                    # Convert distance to similarity score (ChromaDB uses distance, we need similarity)
                    similarity_score = 1 - distance
                    if similarity_score >= similarity_threshold:
                        document_type = metadata.get("type")
                    
                    if document_type == "pdf_chunk":
                        similar_chunks.append({
                            "document_id": metadata.get("id"),
                            "document_type": document_type,
                            "source_pdf": metadata.get("source_pdf"),
                            "chunk_index": metadata.get("chunk_index"),
                            "page_no": metadata.get("page_no", 1),
                            "chunk_text": doc,
                            "similarity_score": similarity_score
                        })

        return similar_chunks

    except Exception as e:
        raise RuntimeError(f"Error retrieving similar chunks: {str(e)}")

def tfidf_filter_chunks(query, retrieved_chunks, threshold=0.1):
    if not retrieved_chunks:
        return []

    chunk_texts = [chunk.get("chunk_text", chunk.get("content", "")) for chunk in retrieved_chunks]
    corpus = [query] + chunk_texts
    
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import cosine_similarity
    
    vectorizer = TfidfVectorizer()
    tfidf_matrix = vectorizer.fit_transform(corpus)
    query_vector = tfidf_matrix[0]
    chunk_vectors = tfidf_matrix[1:]
    tfidf_similarities = cosine_similarity(query_vector.reshape(1, -1), chunk_vectors)[0]

    filtered_chunks = []
    for i, chunk in enumerate(retrieved_chunks):
        if tfidf_similarities[i] >= threshold:
            chunk["tfidf_score"] = tfidf_similarities[i]
            filtered_chunks.append(chunk)

    return filtered_chunks
    

def process_query_with_tfidf(query, top_k=10, similarity_threshold=0.3, tfidf_threshold=0.05, conversation_id: str | None = None, custom_chunks=None, custom_embeddings=None):
    # Use custom chunks and embeddings if provided, otherwise use global ones
    chunks_to_use = custom_chunks if custom_chunks is not None else in_memory_chunks
    embeddings_to_use = custom_embeddings if custom_embeddings is not None else in_memory_embeddings
    
    # Get more chunks initially for better diversity
    retrieved_chunks = retrieve_similar_chunks(query, top_k, similarity_threshold, conversation_id, chunks_to_use, embeddings_to_use)
    if not retrieved_chunks:
        return None
    
    # Apply TF-IDF filtering (more lenient)
    filtered_chunks = tfidf_filter_chunks(query, retrieved_chunks, tfidf_threshold)
    
    # Sort by combined relevance score
    filtered_chunks.sort(key=lambda x: (x.get("similarity_score", 0) + x.get("tfidf_score", 0)), reverse=True)
    
    # Return top 8 chunks for better diversity
    return filtered_chunks[:5]

def select_top_source_documents(chunks: List[Dict[str, Any]]) -> List[str]:
    combined_scores = []
    identifiers = []
    similarity_scores = []

    for chunk in chunks:
        score = chunk['similarity_score'] + chunk['tfidf_score']
        combined_scores.append(score)
        similarity_scores.append(chunk['similarity_score'])
        identifiers.append(chunk.get('source_pdf'))

    min_score = min(combined_scores)
    max_score = max(combined_scores)
    range_score = max_score - min_score if max_score > min_score else 1.0
    normalized_scores = [(score - min_score) / range_score for score in combined_scores]

    weighted_scores = [
        0.5 * norm_score + 0.5 * sim_score
        for norm_score, sim_score in zip(normalized_scores, similarity_scores)
    ]

    document_scores = defaultdict(float)
    for identifier, final_score in zip(identifiers, weighted_scores):
        if identifier:
            document_scores[identifier] += final_score

    top_docs = sorted(document_scores.items(), key=lambda x: x[1], reverse=True)
    return [doc_id for doc_id, _ in top_docs]

def build_context(filtered_chunks):
    context = ""
    seen_content = set()  # Track unique content to avoid repetition
    
    for i, chunk in enumerate(filtered_chunks, start=1):
        chunk_text = chunk.get('chunk_text', chunk.get('content', ''))
        
        # Skip if we've seen very similar content before
        chunk_hash = hash(chunk_text[:100])  # Use first 100 chars as fingerprint
        if chunk_hash in seen_content:
            continue
            
        seen_content.add(chunk_hash)
        source_pdf = chunk.get('source_pdf', chunk.get('source', 'Unknown'))
        page_no = chunk.get('page_no', chunk.get('page_number', 1))
        context += f"From {i}. {source_pdf} (Page {page_no})\n{chunk_text}\n\n"
        
        # Limit context length to avoid overwhelming the model
        if len(context) > 5000:
            break
            
    return context.strip()


def query_gemini(question, context):
    import re
    from groq import Groq
    
    # Initialize Groq client with your API key
    api_key = os.environ.get("GROQ_API_KEY") # Fallback removed for security
    # Better: just use env var to be safe for git push
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
         return "Error: GROQ_API_KEY not configured."
    client = Groq(api_key=api_key)

    # Set model and context length
    model_name = "llama-3.1-8b-instant"
    max_context_length = 3000  # Increased for better context, 8b model handles smaller context well but can take more
    
    # Truncate context if needed
    if len(context) > max_context_length * 4: # Approx chars
        context = context[:max_context_length * 4] + "..."

    # Create the prompt
    # Create the prompt
    suggestion_instruction = ""
    if context and "pdf_context" in str(context): # Simple check if specific PDF
         suggestion_instruction = """
6. **Suggested Follow-up Questions:**
   - Generate 3 relevant follow-up questions.
   - These MUST be strictly based on the provided document content.
   - Do not ask about things outside the text.
"""
    else:
         suggestion_instruction = """
6. **Suggested Follow-up Questions:**
   - Generate 3 relevant follow-up questions.
   - These should be broad, exploratory, or comparative based on the topic.
"""

    prompt = f"""You are an expert AI assistant analyzing document content. Based on the following context, provide a detailed, specific, and comprehensive answer to the question. Be precise and cite specific information from the context.

Context: {context}

Question: {question}

Instructions:
1. Give specific, detailed answers based on the exact content in the context
2. Quote relevant text directly when appropriate
3. Provide concrete examples and specific details
4. Avoid generic or circular responses
5. Focus on the actual content rather than general concepts
{suggestion_instruction}

Please provide your answer in the following structured format:

**Main Answer:**
[Provide a clear, direct, and specific answer based on the actual content]

**Key Points:**
• [Specific point 1 with details from the context]
• [Specific point 2 with details from the context]
• [Specific point 3 with details from the context]
[Add more specific points as needed]

**Details:**
[Provide detailed explanations with specific examples, quotes, and concrete information from the context. Be thorough and specific.]

**Summary:**
[Provide a concise summary focusing on the specific findings from the document]

**Suggested Follow-up Questions:**
[Question 1]
[Question 2]
[Question 3]

Answer:"""
    
    try:
        # Get response from the model
        response = client.chat.completions.create(
            model=model_name,
            messages=[
                {"role": "system", "content": "You are a helpful AI assistant that provides detailed and accurate information based on the given context."},
                {"role": "user", "content": prompt}
            ],
            temperature=1,
            max_completion_tokens=1024,
            top_p=1,
            stream=False
        )
        
        # Extract and return the response content
        if response.choices and len(response.choices) > 0:
            return response.choices[0].message.content.strip()
        else:
            return "Error: No response generated from the model"
            
    except Exception as e:
        return f"Error querying the model: {str(e)}"


def test_groq_connection():
    """Test function to verify Groq API connection with Llama 3 model"""
    from groq import Groq
    import time
    
    print("\n=== Testing Groq API Connection ===")
    
    try:
        # Initialize client with API key
        api_key = os.environ.get("GROQ_API_KEY")
        if not api_key:
            print("[ERROR] GROQ_API_KEY missing.")
            return False
        client = Groq(api_key=api_key)
        
        # Simple test prompt
        test_prompt = "Hello, Llama 3! Please respond with 'API is working' if you can read this message."
        
        print("Sending test request to Groq API...")
        start_time = time.time()
        
        # Make the API call
        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[
                {"role": "user", "content": test_prompt}
            ],
            max_completion_tokens=50,
            temperature=1,
            top_p=1
        )
        
        # Calculate response time
        response_time = time.time() - start_time
        
        # Get the response content
        if response.choices and len(response.choices) > 0:
            response_text = response.choices[0].message.content.strip()
            print("\n✅ API Connection Successful!")
            print(f"⏱️  Response Time: {response_time:.2f} seconds")
            print("\n📝 Model Response:")
            print("-"*20)
            print(response_text)
            print("-"*20)
            return True
        else:
            print("❌ Error: No response received from the model")
            return False
            
    except Exception as e:
        print(f"\n❌ API Connection Failed!")
        print(f"Error: {str(e)}")
        return False


# Run the test when this file is executed directly
if __name__ == "__main__":
    test_groq_connection()


def query_llm(prompt):
    """Query the LLM with the given prompt using Groq API"""
    try:
        # Initialize client with API key from environment
        api_key = os.environ.get("GROQ_API_KEY")
        if not api_key:
             print("[ERROR] GROQ_API_KEY not found in environment variables.")
             return "Error: API Key missing."
        client = Groq(api_key=api_key)
        
        print(f"[AI] Sending request to Groq API...")
        llm_request_start = time.perf_counter()
        
        # Using Groq's chat completion API
        response = client.chat.completions.create(
            messages=[
                {"role": "system", "content": "You are an expert AI assistant that provides detailed, specific, and comprehensive answers based on the given context."},
                {"role": "user", "content": prompt}
            ],
            model="llama-3.1-8b-instant",
            temperature=1,
            max_completion_tokens=2000,
            top_p=1
        )
        
        llm_request_time = time.perf_counter() - llm_request_start
        print(f"[TIME] LLM request completed in: {llm_request_time:.2f}s")

        answer = response.choices[0].message.content.strip()
        print(f"[TEXT] LLM response length: {len(answer)} characters")

        # Deduplicate repeated sentences
        sentences = re.split(r'(?<=[.!?]) +', answer)
        seen = set()
        filtered_sentences = []
        for sentence in sentences:
            if sentence not in seen:
                filtered_sentences.append(sentence)
                seen.add(sentence)
        answer = ' '.join(filtered_sentences).strip()
        return answer
    except Exception as e:
        print(f"Error querying Groq API: {e}")
        return "I'm sorry, I encountered an error processing your request. Please try again later."



def _chunks_to_citations(filtered_chunks, query=""):
    # Sort chunks by combined relevance score (highest first)
    sorted_chunks = sorted(filtered_chunks, 
                          key=lambda x: (x.get("similarity_score", 0) + x.get("tfidf_score", 0)), 
                          reverse=True)
    
    citations = []
    pdf_page_groups = {}  # Group chunks by PDF and collect page numbers
    
    # Simple tokenizer for keyword matching
    import re
    query_tokens = set(re.findall(r'\w+', query.lower())) if query else set()

    for chunk in sorted_chunks:
        try:
            source_pdf = chunk.get("source_pdf", "")
            page_no = chunk.get("page_no", 1)
            chunk_text = chunk.get("chunk_text", "").lower()
            
            # Group chunks by PDF
            if source_pdf not in pdf_page_groups:
                pdf_page_groups[source_pdf] = {
                    "pages": set(),
                    "chunks": [],
                    "best_score": 0.0,
                    "best_similarity": 0.0,
                    "best_tfidf": 0.0,
                    "all_keywords": set()
                }
            
            # Calculate metadata
            similarity_val = float(chunk.get("similarity_score", 0) or 0)
            tfidf_val = float(chunk.get("tfidf_score", 0) or 0)
            combined_score = similarity_val + tfidf_val
            
            # Find matched keywords in this chunk
            chunk_tokens = set(re.findall(r'\w+', chunk_text))
            matched = query_tokens.intersection(chunk_tokens)
            
            group = pdf_page_groups[source_pdf]
            group["pages"].add(page_no)
            group["chunks"].append(chunk)
            group["all_keywords"].update(matched)
            
            if combined_score > group["best_score"]:
                group["best_score"] = combined_score
            if similarity_val > group["best_similarity"]:
                group["best_similarity"] = similarity_val
            if tfidf_val > group["best_tfidf"]:
                group["best_tfidf"] = tfidf_val
                
        except Exception as e:
            print(f"Error processing chunk for citation: {e}")
            continue
    
    # Convert grouped data to citations (limit to top 3 PDFs)
    sorted_pdfs = sorted(
        pdf_page_groups.items(),
        key=lambda x: (x[1]["best_similarity"], x[1]["best_score"]),
        reverse=True
    )[:5]
    
    for source_pdf, data in sorted_pdfs:
        # Sort pages by their relevance (highest scoring chunks first)
        page_scores = {}
        for chunk in data["chunks"]:
            page_no = chunk.get("page_no", 1)
            similarity = float(chunk.get("similarity_score", 0) or 0)
            tfidf = float(chunk.get("tfidf_score", 0) or 0)
            combined = similarity + tfidf
            
            if page_no not in page_scores or combined > page_scores[page_no]:
                page_scores[page_no] = combined
        
        # Sort pages by their best score
        sorted_pages_data = sorted(page_scores.items(), key=lambda x: x[1], reverse=True)
        sorted_pages = [page for page, score in sorted_pages_data]
        
        # Use the best chunk for excerpt
        best_chunk = max(data["chunks"], 
                        key=lambda x: x.get("similarity_score", 0) + x.get("tfidf_score", 0))
        
        citation = {
            "document_id": best_chunk.get("document_id"),
            "source_pdf": source_pdf,
            # "page_display": page_display, # Frontend handles this
            "page_numbers": sorted_pages,
            "page_count": len(sorted_pages),
            "similarity_score": round(data["best_similarity"], 4),
            "tfidf_score": round(data["best_tfidf"], 4),
            "relevance_score": round(data["best_score"], 4),
            "matched_keywords": list(data["all_keywords"])[:10],
            "keyword_count": len(data["all_keywords"]),
            "excerpt": (best_chunk.get("chunk_text") or "")[:220].strip(),
            "chunk_text": best_chunk.get("chunk_text")
        }
        citations.append(citation)
    
    return citations


def generate_follow_up_questions(answer, query):
    """Generate relevant follow-up questions based on the answer content"""
    try:
        # Simple keyword-based follow-up generation
        follow_ups = []
        
        # Extract key topics from the answer
        answer_lower = answer.lower()
        
        # Define follow-up templates based on content
        if any(word in answer_lower for word in ['algorithm', 'method', 'technique', 'approach']):
            follow_ups.append("How does this algorithm work in detail?")
            follow_ups.append("What are the advantages and disadvantages of this method?")
        
        if any(word in answer_lower for word in ['data', 'dataset', 'training', 'model']):
            follow_ups.append("What type of data is used for this?")
            follow_ups.append("How is the model trained?")
        
        if any(word in answer_lower for word in ['application', 'use', 'implement', 'practice']):
            follow_ups.append("What are the real-world applications?")
            follow_ups.append("How is this implemented in practice?")
        
        if any(word in answer_lower for word in ['performance', 'accuracy', 'result', 'outcome']):
            follow_ups.append("What are the performance metrics?")
            follow_ups.append("How accurate is this approach?")
        
        if any(word in answer_lower for word in ['problem', 'challenge', 'issue', 'limitation']):
            follow_ups.append("What are the main challenges?")
            follow_ups.append("What are the limitations of this approach?")
        
        if any(word in answer_lower for word in ['future', 'development', 'improvement', 'enhancement']):
            follow_ups.append("What are the future developments?")
            follow_ups.append("How can this be improved?")
        
        # Generic follow-ups if no specific patterns found
        if not follow_ups:
            follow_ups = [
                "Can you explain this in more detail?",
                "What are the key benefits of this approach?",
                "How does this compare to other methods?",
                "What are the practical implications?"
            ]
        
        # Return top 3-4 unique questions
        return follow_ups[:4]
        
    except Exception as e:
        print(f"Error generating follow-up questions: {e}")
        return [
            "Can you explain this in more detail?",
            "What are the key benefits?",
            "How does this work?"
        ]

def get_answer(query, conversation_id: str | None = None, pdf_context: str = None, min_confidence_threshold: float = 0.15):
    import time
    start_time = time.perf_counter()
    
    # Debug: Check how many chunks are in memory
    print(f"[STATS] Total chunks in memory: {len(in_memory_chunks)}")
    print(f"[STATS] Total embeddings in memory: {len(in_memory_embeddings)}")
    print(f"[PDF_CONTEXT] Query context: {pdf_context}")
    print(f"[CONFIDENCE] Minimum threshold: {min_confidence_threshold}")
    
    # Always try to load embeddings from ChromaDB if memory is empty
    if not in_memory_embeddings:
        print("[RAG] No embeddings in memory, trying to load from ChromaDB...")
        try:
            # Try to load embeddings from ChromaDB
            collection = chroma_client.get_collection(collection_name)
            count = collection.count()
            print(f"[RAG] Found {count} documents in ChromaDB")
            
            if count > 0:
                # Load all documents from ChromaDB into memory
                print("[RAG] Loading documents from ChromaDB into memory...")
                results = collection.get(include=['documents', 'embeddings', 'metadatas'])
                
                # Clear existing memory
                in_memory_chunks.clear()
                in_memory_embeddings.clear()
                
                # Handle different ChromaDB result structures
                if isinstance(results, dict):
                    documents = results.get('documents', [])
                    embeddings = results.get('embeddings', [])
                    metadatas = results.get('metadatas', [])
                    
                    # Handle nested structure - embeddings might be nested
                    if embeddings is not None:
                        # Check if embeddings are numpy arrays or nested lists
                        import numpy as np
                        if isinstance(embeddings, np.ndarray):
                            # If it's a 2D numpy array (list of embeddings), convert to list of lists
                            if embeddings.ndim == 2:
                                embeddings = [emb.tolist() for emb in embeddings]
                            else:
                                # Single 1D array, wrap in list
                                embeddings = [embeddings.tolist()]
                        elif isinstance(embeddings, list) and len(embeddings) > 0:
                            if isinstance(embeddings[0], np.ndarray):
                                # Convert numpy arrays to lists
                                embeddings = [emb.tolist() for emb in embeddings]
                            elif isinstance(embeddings[0], list) and len(embeddings) == 1:
                                # Flatten embeddings if they're nested
                                embeddings = embeddings[0]
                
                # Load into memory
                import numpy as np
                for i in range(min(len(documents), len(embeddings), len(metadatas))):
                    doc = documents[i] if i < len(documents) else ""
                    embedding = embeddings[i] if i < len(embeddings) else []
                    metadata = metadatas[i] if i < len(metadatas) else {}
                    
                    # Convert numpy array to list if needed
                    if isinstance(embedding, np.ndarray):
                        embedding = embedding.tolist()
                    
                    chunk_id = f"chromadb_{i}"
                    in_memory_chunks[chunk_id] = {
                        'content': doc,
                        'metadata': metadata,
                        'source': metadata.get('source', 'Unknown'),
                        'source_pdf': metadata.get('source_pdf', 'Unknown'),
                        'page_no': metadata.get('page_no', 1),
                        'page_number': metadata.get('page_no', 1),  # Also add as page_number for compatibility
                        'chunk_text': doc,
                        'document_id': metadata.get('id', f"doc_{i}")
                    }
                    in_memory_embeddings[chunk_id] = embedding
                
                print(f"[RAG] Loaded {len(in_memory_chunks)} chunks and {len(in_memory_embeddings)} embeddings into memory")
            else:
                return format_no_answer_response(pdf_context=None, reason="no_documents")
        except Exception as e:
            print(f"[RAG] Error loading from ChromaDB: {e}")
            return format_no_answer_response(pdf_context=None, reason="no_documents")
    
    # Use the improved parameters
    print(f"[SEARCH] Starting query processing for: {query}")
    chunk_start = time.perf_counter()
    
    # Filter chunks by PDF context if provided
    if pdf_context:
        print(f"[PDF_FILTER] Filtering chunks for PDF: {pdf_context}")
        pdf_filtered_chunks = filter_chunks_by_document(in_memory_chunks, pdf_context)
        pdf_filtered_embeddings = {k: v for k, v in in_memory_embeddings.items() if k in pdf_filtered_chunks}
        
        if not pdf_filtered_chunks:
            print(f"[PDF_FILTER] No chunks found for PDF: {pdf_context}")
            return format_no_answer_response(pdf_context=pdf_context, reason="not_in_document")
        
        # Use PDF-filtered chunks for processing with lower threshold for PDF-specific queries
        filtered_chunks = process_query_with_tfidf(query, top_k=20, similarity_threshold=0.05, tfidf_threshold=0.01, 
                                                 conversation_id=conversation_id, 
                                                 custom_chunks=pdf_filtered_chunks, 
                                                 custom_embeddings=pdf_filtered_embeddings)
        
        print(f"[PDF_FILTER] Filtered chunks returned: {len(filtered_chunks) if filtered_chunks else 0} chunks")
    else:
        filtered_chunks = process_query_with_tfidf(query, top_k=10, similarity_threshold=0.3, tfidf_threshold=0.05, conversation_id=conversation_id)
    
    chunk_time = time.perf_counter() - chunk_start
    print(f"[TIME] Chunk processing took: {chunk_time:.2f}s")
    
    # Calculate confidence score
    confidence_score = calculate_confidence_score(filtered_chunks, query)
    print(f"[CONFIDENCE] Calculated confidence score: {confidence_score:.4f}")
    
    # Check if confidence meets threshold
    if not filtered_chunks or confidence_score < min_confidence_threshold:
        print(f"[NO_ANSWER] Confidence {confidence_score:.4f} below threshold {min_confidence_threshold}")
        if pdf_context:
            return format_no_answer_response(pdf_context=pdf_context, reason="not_in_document")
        else:
            return format_no_answer_response(pdf_context=None, reason="no_relevant_info")
    
    # Build context with diversity
    context_start = time.perf_counter()
    context = build_context(filtered_chunks)
    context_time = time.perf_counter() - context_start
    print(f"[TIME] Context building took: {context_time:.2f}s")
    print(f"[TEXT] Context length: {len(context)} characters")
    
    # Generate answer
    llm_start = time.perf_counter()
    answer = query_gemini(query, context)
    llm_time = time.perf_counter() - llm_start
    print(f"[TIME] LLM response took: {llm_time:.2f}s")
    
    # Parse and separate Suggested Follow-up Questions from the main answer text
    follow_up_questions = []
    
    if "**Suggested Follow-up Questions:**" in answer:
        parts = answer.split("**Suggested Follow-up Questions:**")
        answer_text = parts[0].strip()
        
        # Parse questions from the second part
        questions_text = parts[1].strip()
        lines = questions_text.split('\n')
        for line in lines:
            line = line.strip()
            # Clean formatting line [Question 1] or "1. Question"
            if line and (line.startswith('[') or line[0].isdigit() or line.startswith('-')):
                # Remove common list prefixes
                clean_q = line.lstrip('[]1234567890.- ').strip()
                if clean_q and '?' in clean_q:
                    follow_up_questions.append(clean_q)
    else:
        answer_text = answer
    
    # Get citations (top 3 unique PDFs)
    citation_start = time.perf_counter()
    citations = _chunks_to_citations(filtered_chunks, query)
    citation_time = time.perf_counter() - citation_start
    print(f"[TIME] Citation processing took: {citation_time:.2f}s")
    
    # Debug: Print citation details
    print(f"[CITES] Generated {len(citations)} citations:")
    for i, citation in enumerate(citations):
        print(f"  {i+1}. {citation.get('source_pdf', 'Unknown')} - Pages: {citation.get('page_numbers', [])}")
    

    
    # Fallback if LLM didn't generate good follow-ups
    followup_start = time.perf_counter()
    if not follow_up_questions:
         follow_up_questions = generate_follow_up_questions(answer_text, query)
    followup_time = time.perf_counter() - followup_start
    print(f"[TIME] Follow-up questions took: {followup_time:.2f}s")

    # 4. Calculate overall confidence score (already calculated above, but keeping the structure from the new snippet)
    # confidence_score = calculate_confidence_score(filtered_chunks, query) # This was already done
    
    # 5. Determine if we have relevant info
    has_relevant_info = confidence_score >= min_confidence_threshold
    
    # If confidence is too low, we might want to flag it, but for now we return what we have
    if not has_relevant_info:
        print(f"[RAG] Low confidence ({confidence_score:.2f})")
    
    total_time = time.perf_counter() - start_time
    print(f"[OK] Total query time: {total_time:.2f}s")
    
    return {
        'answer': answer_text,
        'citations': citations,
        'follow_up_questions': follow_up_questions,
        'has_relevant_info': has_relevant_info,
        'scoped_to_document': pdf_context if pdf_context else None,
        'confidence_score': round(confidence_score, 4) # Kept original rounding for consistency
    }