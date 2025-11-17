# AI Document Assistant (Django + RAG)

Production‑ready, local RAG app with a modern Django frontend. Upload PDFs, embed into a persistent Chroma vector store, and chat to get grounded answers. No external LLM calls are required by default.

## Key Features (Frontend)

- drop multi‑PDF upload with file list management
- Real‑time processing status (ingestion timings logged to `time_report_ingestion.csv`)
- Chat interface with:
  - Thinking indicator below the user message
  - Suggested questions (empty state)
  - Copy response button
  - Export chat (TXT/JSON)
  - Clear chat
- Dark/light mode toggle (theme persisted)
- Responsive, accessible UI

## RAG Pipeline (Backend)

- PDF text extraction (PyMuPDF/pdfplumber) and cleaning
- Sentence‑aware chunking (spaCy `en_core_web_sm`)
- Embeddings with `sentence-transformers` (all‑MiniLM‑L6‑v2)
- Persistent storage/query via ChromaDB
- Answer generation via Hugging Face `gpt2` (local) inside `rag_app.py`

## Requirements

- Python 3.8+
- Install Python deps:
  ```bash
  pip install -r requirements.txt
  ```
- One‑time model downloads:
  ```bash
  python -m spacy download en_core_web_sm
  # First run will also download HF tokenizer/model weights for gpt2
  ```

## Run (Django)

```bash
python manage.py runserver
```

Open `http://127.0.0.1:8000/`.

## API Endpoints (used by the UI)

- `GET /` → serves `ragapp/templates/ragapp/index.html`
- `POST /upload/` → multipart form with `files` (one or more PDFs)
- `POST /query/` → JSON `{ "query": "your question" }`

## Project Structure (relevant)

- `rag_app.py` — RAG core (ingest, embed, retrieve, answer)
- `ragapp/`
  - `views.py`, `urls.py` — endpoints used by the frontend
  - `templates/ragapp/index.html` — modern UI
- `rag_project/` — Django project (`settings.py`, `urls.py`, `wsgi.py`/`asgi.py`)
- `chroma_db/` — persistent Chroma store
- `uploaded_pdfs/` — uploaded PDF files
- `time_report_ingestion.csv` — ingest logs (filename, pages, words, timings, status)

## Ingestion Log (`time_report_ingestion.csv`)

Written by `rag_app.py` after each ingest. Columns:

`filename, pages, total_words, embedding_s, store_s, total_s, status, error`

Useful for troubleshooting and benchmarking. Safe to delete; it will be recreated.

## Notes & Tips

- First run downloads models; subsequent runs are faster.
- If spaCy model is missing, run the download command above.
- If the export menu is hidden, hard refresh to clear cached CSS.

## Previously Included Streamlit UI

This project now uses the Django UI. The old `streamlit_app.py` has been removed per request. If you want a Streamlit UI again, we can re‑introduce it as a separate frontend reusing `rag_app.py`.
