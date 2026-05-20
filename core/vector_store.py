import os 
from langchain_chroma import Chroma 
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document


CHROMA_DIR = "vector_db"
COLLECTION_NAME = "meeting_transcript"
EMBEDDING_MODEL  = "all-MiniLM-L6-v2"

# rag.py"

# initialize once at module level
embeddings = HuggingFaceEmbeddings(model_name=EMBEDDING_MODEL)

text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=500,
    chunk_overlap=50,
)


def store(transcript_result: dict, session_id: str, source: str = "video") -> Chroma:
    """
    Splits transcript, embeds and stores in Chroma.

    Returns:
        vectorstore — pass this to retrieve()
    """

    full_text = transcript_result.get("full_text", "").strip()
    language  = transcript_result.get("language", "unknown")

    if not full_text:
        raise ValueError("Transcript is empty, nothing to store.")

    splits = text_splitter.split_text(full_text)

    # Clean session_id to avoid path traversal
    session_dir = os.path.join(CHROMA_DIR, session_id)
    print(f"\nStoring {len(splits)} chunks into ChromaDB at {session_dir}...")

    documents = [
        Document(
            page_content=split,
            metadata={
                "source":   source,
                "language": language,
                "chunk":    i + 1,
            }
        )
        for i, split in enumerate(splits)
    ]

    vectorstore = Chroma.from_documents(
        documents=documents,
        embedding=embeddings,
        collection_name=COLLECTION_NAME,
        persist_directory=session_dir,
    )

    print(f"Stored {len(documents)} chunks into '{session_dir}'.")

    return vectorstore


def retrieve(vectorstore: Chroma, query: str, top_k: int = 4) -> list:
    """
    Retrieves most relevant chunks for a query.

    Args:
        vectorstore: returned from store()
        query:       user's question
        top_k:       number of chunks to retrieve

    Returns:
        List of relevant Document objects
    """

    results = vectorstore.similarity_search(query, k=top_k)
    return results


def load_existing(session_id: str) -> Chroma:
    """
    Loads existing ChromaDB from disk.
    Use when video is already processed — skips re-embedding.
    """

    session_dir = os.path.join(CHROMA_DIR, session_id)
    print(f"Loading existing vectorstore from disk at {session_dir}...")

    vectorstore = Chroma(
        collection_name=COLLECTION_NAME,
        embedding_function=embeddings,
        persist_directory=session_dir,
    )

    print("Vectorstore loaded.")
    return vectorstore

