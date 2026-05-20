# backend/main.py
import os
import uuid
import shutil
import logging
from fastapi import FastAPI, UploadFile, File, Form, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("backend")

# Import database helpers
from backend.db import (
    init_db,
    create_session,
    get_sessions,
    get_session,
    delete_session,
    add_source,
    update_source_status,
    update_source_results,
    get_session_sources,
    get_source,
    add_chat_message,
    get_chat_history
)

# Import AI pipeline components
from core.transcriber import Transcriber
from core.summarizer import generate_title, create_summary
from core.extractor import extract_action_items, extract_key_decisions, extract_questions
from core.rag import build_vector_db, load_rag_chain, ask_question
from utils.audio_processor import clean_filename

# Initialize database
init_db()

app = FastAPI(title="Video AI Assistant API", version="1.0.0")

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Directory configurations
UPLOAD_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "uploads"))
DOWNLOADS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "downloads"))
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(DOWNLOADS_DIR, exist_ok=True)

# Shared transcriber instance
transcriber = Transcriber(
    whisper_model="base",
    sarvam_api_key=os.getenv("SARVAM_API_KEY"),
    force_language=None
)

# Background pipeline processor
def run_pipeline_task(session_id: str, source_id: str, source_path: str, source_name: str, source_type: str):
    try:
        logger.info(f"Starting pipeline for source {source_id} (session {session_id})")
        
        # Step 1: Download or preprocess audio
        update_source_status(source_id, "processing_audio", "Converting audio/video into Whisper optimized format...")
        
        from utils.audio_processor import process_input
        chunks, detected_language = process_input(source_path, transcriber)
        
        # Step 2: Transcribing chunks
        update_source_status(source_id, "transcribing", f"Transcribing {len(chunks)} audio chunk(s) in {detected_language}...")
        result = transcriber.transcribe_chunks(chunks, language=detected_language)
        full_text = result.get("full_text", "").strip()
        
        if not full_text:
            raise ValueError("Pipeline generated an empty transcript.")
            
        # Step 3: Extract AI analytics
        update_source_status(source_id, "analyzing", "Generating summaries and key takeaways...")
        summary = create_summary(full_text)
        action_items = extract_action_items(full_text)
        key_decisions = extract_key_decisions(full_text)
        questions = extract_questions(full_text)
        
        # Step 4: Indexing into vector store
        update_source_status(source_id, "indexing", "Indexing transcript chunks into knowledge base...")
        build_vector_db(result, session_id, source_name)
        
        # Step 5: Save results to SQLite
        update_source_results(
            source_id=source_id,
            language=detected_language,
            transcript=full_text,
            summary=summary,
            action_items=action_items,
            key_decisions=key_decisions,
            questions=questions
        )
        
        # If this is the first source in the session, update the session's title
        session = get_session(session_id)
        if session and session["title"] == "New Session":
            import sqlite3
            from backend.db import get_db_connection
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("UPDATE sessions SET title = ? WHERE id = ?", (source_name[:100], session_id))
            conn.commit()
            conn.close()
            
        logger.info(f"Pipeline successfully completed for source {source_id}")
        
    except Exception as e:
        logger.error(f"Error processing source {source_id}: {str(e)}", exc_info=True)
        update_source_status(source_id, "failed", f"Error: {str(e)}")

# API Schemas
class SessionCreate(BaseModel):
    title: Optional[str] = "New Session"

class YouTubeSourceAdd(BaseModel):
    url: str

class ChatQuery(BaseModel):
    question: str

# Endpoints
@app.get("/api/sessions")
def list_sessions():
    return get_sessions()

@app.post("/api/sessions")
def create_new_session(payload: SessionCreate):
    session_id = str(uuid.uuid4())
    title = payload.title or "New Session"
    create_session(session_id, title)
    return {"session_id": session_id, "title": title}

@app.get("/api/sessions/{session_id}")
def get_session_details(session_id: str):
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    sources = get_session_sources(session_id)
    return {
        "session": session,
        "sources": sources
    }

@app.delete("/api/sessions/{session_id}")
def delete_session_endpoint(session_id: str):
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    # Delete SQLite records
    delete_session(session_id)
    
    # Clean up local dynamic Chroma DB files
    chroma_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "vector_db", session_id))
    if os.path.exists(chroma_dir):
        try:
            shutil.rmtree(chroma_dir)
        except Exception as e:
            logger.error(f"Failed to remove vector store for session {session_id}: {str(e)}")
            
    return {"message": f"Session {session_id} deleted successfully"}

@app.post("/api/sessions/{session_id}/sources/youtube")
def add_youtube_source(session_id: str, payload: YouTubeSourceAdd, background_tasks: BackgroundTasks):
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    url = payload.url
    if not (url.startswith("http://") or url.startswith("https://")):
        raise HTTPException(status_code=400, detail="Invalid YouTube URL")
        
    # Extract youtube info using yt-dlp to get title
    import yt_dlp
    try:
        with yt_dlp.YoutubeDL() as ydl:
            info = ydl.extract_info(url, download=False)
        name = clean_filename(info.get("title", "YouTube Video"))
    except Exception as e:
        logger.error(f"Failed to fetch YouTube info: {str(e)}")
        name = "YouTube Video"
        
    source_id = str(uuid.uuid4())
    add_source(
        source_id=source_id,
        session_id=session_id,
        name=name,
        source_type="youtube",
        path=url
    )
    
    # Enqueue background task
    background_tasks.add_task(run_pipeline_task, session_id, source_id, url, name, "youtube")
    
    return {"source_id": source_id, "name": name, "status": "pending"}

@app.post("/api/sessions/{session_id}/sources/upload")
async def upload_file_source(session_id: str, background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    source_id = str(uuid.uuid4())
    file_ext = os.path.splitext(file.filename)[1]
    name = file.filename
    
    # Define local path to save uploaded file
    local_filename = f"{source_id}{file_ext}"
    local_path = os.path.join(UPLOAD_DIR, local_filename)
    
    with open(local_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
        
    add_source(
        source_id=source_id,
        session_id=session_id,
        name=name,
        source_type="file",
        path=local_path
    )
    
    # Enqueue background task
    background_tasks.add_task(run_pipeline_task, session_id, source_id, local_path, name, "file")
    
    return {"source_id": source_id, "name": name, "status": "pending"}

@app.get("/api/sessions/{session_id}/sources/{source_id}/status")
def get_source_status(session_id: str, source_id: str):
    source = get_source(source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    return {
        "status": source["status"],
        "progress_msg": source["progress_msg"]
    }

@app.get("/api/media/{source_id}")
def serve_media(source_id: str):
    source = get_source(source_id)
    if not source or source["type"] != "file":
        raise HTTPException(status_code=404, detail="Media file not found or not support dynamic streaming")
        
    local_path = source["path"]
    if not os.path.exists(local_path):
        raise HTTPException(status_code=404, detail="File has been deleted from local storage")
        
    # Guess media type
    media_type = "audio/mpeg"
    if local_path.endswith(".mp4"):
        media_type = "video/mp4"
    elif local_path.endswith(".wav"):
        media_type = "audio/wav"
        
    return FileResponse(local_path, media_type=media_type)

@app.post("/api/sessions/{session_id}/chat")
def chat_with_session(session_id: str, payload: ChatQuery):
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    # Check if there are completed sources in this session
    sources = get_session_sources(session_id)
    completed_sources = [s for s in sources if s["status"] == "completed"]
    if not completed_sources:
        raise HTTPException(status_code=400, detail="No processed sources are available for chat in this session yet")
        
    # Get conversation history
    history = get_chat_history(session_id)
    
    try:
        # Load the RAG chain
        rag_chain = load_rag_chain(session_id)
        
        # Execute Q&A
        answer = ask_question(rag_chain, payload.question, history)
        
        # Save messages to database
        add_chat_message(session_id, "user", payload.question)
        add_chat_message(session_id, "assistant", answer)
        
        return {"answer": answer}
        
    except Exception as e:
        logger.error(f"Chat error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"RAG Chat error: {str(e)}")

@app.get("/api/sessions/{session_id}/chat")
def get_chat_messages(session_id: str):
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return get_chat_history(session_id)
