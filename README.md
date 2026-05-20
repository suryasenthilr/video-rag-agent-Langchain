# VideoQuery AI — Multi-Source Video Knowledge Base & Q&A Assistant

VideoQuery AI is a modern, premium, production-level AI SaaS application that allows users to process multiple audio/video files or YouTube URLs into a single session-based knowledge base. It transcribes audio using Whisper (for English) or Sarvam AI (for Indic languages like Hindi and Tamil) with auto-detection, performs semantic chunking, and houses them in session-scoped vector databases (ChromaDB) for high-precision, source-cited conversational RAG (Retrieval-Augmented Generation).

---

## 🚀 Key Features

* **Dual-Inflow Media Support**: Upload local audio/video files (MP3, WAV, MP4) or paste YouTube links.
* **Auto-Language Detection & Routing**: Detects the spoken language automatically. English is processed locally via Whisper, and Indic languages (Hindi/Tamil) are routed to Sarvam AI.
* **Session-Scoped RAG**: Each chat workspace/session operates on its own dedicated vector index, ensuring strict separation of session data.
* **Multi-Source Federated Retrieval**: When answering generic questions (e.g. summaries, decisions), the retrieval engine dynamically pulls and merges semantically relevant chunks from *every* uploaded source, ensuring full representation and accurate source citations (e.g., `[Source: tutorial.mp4]`).
* **Dynamic Media Players**: Instantly play local uploaded media (via stream serving) or YouTube videos in the workspace.
* **Premium UX/UI**: Immersive Apple/Perplexity-inspired dark mode UI with glassmorphic panels, glowing boundaries, dynamic tabs (Summary, Key Decisions, Action Items, Open Questions, Transcript), and interactive citation badges.

---

## 🛠️ Tech Stack

* **Frontend**: React, Vite, Tailwind CSS, Lucide Icons.
* **Backend**: FastAPI (Python), Uvicorn, SQLite (for session, source metadata, and chat history), ChromaDB (Vector DB).
* **AI & Processing Tools**: LangChain, Groq (Llama-3.3-70b), Whisper, Sarvam AI, `yt-dlp`, `ffmpeg`, `pydub`.

---

## 📁 Directory Structure

```text
├── backend/                  # FastAPI web server
│   ├── main.py               # REST endpoints, CORS configurations, and background pipeline tasks
│   └── db.py                 # SQLite schema definition and session helper methods
├── core/                     # Transcription, summarization, and retrieval core modules
│   ├── rag.py                # LangChain pipeline, federated multi-source retrieval, and LLM setup
│   ├── transcriber.py        # Unified Whisper & Sarvam AI transcription orchestrator
│   ├── vector_store.py       # ChromaDB session-scoped vector index storage and loading
│   ├── extractor.py          # Groq-powered structured insights (actions, decisions, questions) extractor
│   └── summarizer.py         # Groq-powered session summary and title generator
├── frontend/                 # React frontend application
│   ├── src/
│   │   ├── App.jsx           # Main workspace UI layout, uploader, players, and RAG chat interface
│   │   └── index.css         # Styling system & Tailwind directives
│   └── index.html            # Main HTML entry template
├── utils/                    # Preprocessing utilities
│   └── audio_processor.py    # YouTube audio downloader, WAV converter, and chunking functions
└── sessions.db               # SQLite database file (created on startup)
```

---

## ⚙️ Prerequisites & Setup

### 1. System Dependencies
The application requires **FFmpeg** to extract and convert audio files.
* **Windows**: Download FFmpeg and add the `bin` folder to your system's PATH.

### 2. Environment Configurations
Create a `.env` file in the root directory:
```env
GROQ_API_KEY=your_groq_api_key
SARVAM_API_KEY=your_sarvam_api_key
```

### 3. Backend Setup
1. Create a Python virtual environment and activate it:
   ```powershell
   python -m venv .venv
   .\.venv\Scripts\activate
   ```
2. Install Python dependencies:
   ```powershell
   pip install -r requirements.txt
   ```

### 4. Frontend Setup
1. Navigate to the `frontend` folder:
   ```powershell
   cd frontend
   ```
2. Install npm dependencies:
   ```powershell
   npm install
   ```

---

## 🏃 Running the Application

To run the application, open two terminal windows:

### Terminal 1: Launch Backend API Server
Make sure your virtual environment is active in the root folder, then run:
```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --port 8000 --host 127.0.0.1
```
The FastAPI documentation will be available at [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).

### Terminal 2: Launch Frontend Web UI
Navigate to the `frontend` directory and run:
```powershell
cd frontend
npm run dev
```
Open [http://localhost:5173/](http://localhost:5173/) in your web browser to start using **VideoQuery AI**!
