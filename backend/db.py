# backend/db.py
import sqlite3
import os

DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "sessions.db"))

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Enable foreign keys
    cursor.execute("PRAGMA foreign_keys = ON;")
    
    # Create sessions table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Create sources table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sources (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            name TEXT NOT NULL,
            type TEXT NOT NULL, -- 'youtube' or 'file'
            path TEXT NOT NULL,
            language TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            progress_msg TEXT DEFAULT '',
            summary TEXT,
            action_items TEXT,
            key_decisions TEXT,
            questions TEXT,
            transcript TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
        )
    """)
    
    # Create chat_messages table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            role TEXT NOT NULL, -- 'user' or 'assistant'
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
        )
    """)
    
    conn.commit()
    conn.close()
    print("SQLite Database initialized at:", DB_PATH)

# Helper functions for Sessions
def create_session(session_id: str, title: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO sessions (id, title) VALUES (?, ?)",
        (session_id, title)
    )
    conn.commit()
    conn.close()

def get_sessions():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM sessions ORDER BY created_at DESC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def get_session(session_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def delete_session(session_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    # Foreign keys cascade deletion
    cursor.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
    conn.commit()
    conn.close()

# Helper functions for Sources
def add_source(source_id: str, session_id: str, name: str, source_type: str, path: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO sources (id, session_id, name, type, path, status, progress_msg) VALUES (?, ?, ?, ?, ?, 'pending', 'Initialized')",
        (source_id, session_id, name, source_type, path)
    )
    conn.commit()
    conn.close()

def update_source_status(source_id: str, status: str, progress_msg: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE sources SET status = ?, progress_msg = ? WHERE id = ?",
        (status, progress_msg, source_id)
    )
    conn.commit()
    conn.close()

def update_source_results(
    source_id: str, 
    language: str, 
    transcript: str, 
    summary: str, 
    action_items: str, 
    key_decisions: str, 
    questions: str
):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        UPDATE sources SET 
            status = 'completed', 
            progress_msg = 'Completed processing source',
            language = ?, 
            transcript = ?, 
            summary = ?, 
            action_items = ?, 
            key_decisions = ?, 
            questions = ? 
        WHERE id = ?
        """,
        (language, transcript, summary, action_items, key_decisions, questions, source_id)
    )
    conn.commit()
    conn.close()

def get_session_sources(session_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM sources WHERE session_id = ? ORDER BY created_at ASC", (session_id,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def get_source(source_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM sources WHERE id = ?", (source_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

# Helper functions for Chat Messages
def add_chat_message(session_id: str, role: str, content: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO chat_messages (session_id, role, content) VALUES (?, ?, ?)",
        (session_id, role, content)
    )
    conn.commit()
    conn.close()

def get_chat_history(session_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT role, content FROM chat_messages WHERE session_id = ? ORDER BY id ASC", (session_id,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]
