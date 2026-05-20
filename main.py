from dotenv import load_dotenv
import os
from utils.audio_processor import process_input

from core.transcriber import (
    Transcriber
)

from core.summarizer import (
    create_summary,
    generate_title
)

from core.extractor import (
    extract_action_items,
    extract_key_decisions,
    extract_questions
)

from core.rag import (
    build_vector_db,
    load_rag_chain,
    ask_question
)

# Load environment variables
load_dotenv()


# Initialize Transcriber
t = Transcriber(
    whisper_model="base",
    sarvam_api_key=os.getenv("SARVAM_API_KEY"),   # Reads from .env automatically
    force_language=None,
)


def run_pipeline(source: str):

    print("\nStarting Video Assistant Pipeline...\n")

    # -----------------------------
    # Process Audio
    # -----------------------------
    chunks,detected_language = process_input(source,t)

    # -----------------------------
    # Transcription
    # -----------------------------
    result = t.transcribe_chunks(chunks,language=detected_language)

    print("\nTranscript Preview:\n")
    print(result["full_text"][:300])

    print(f"\nDetected Language: {result['language']}\n")

    # -----------------------------
    # Title Generation
    # -----------------------------
    title = generate_title(result["full_text"])

    print(f"\nGenerated Title:\n{title}\n")

    # -----------------------------
    # Summary
    # -----------------------------
    summary = create_summary(result["full_text"])

    print(f"\nSummary:\n{summary}\n")

    # -----------------------------
    # Action Items
    # -----------------------------
    action_items = extract_action_items(
        result["full_text"]
    )

    print(f"\nAction Items:\n{action_items}\n")

    # -----------------------------
    # Key Decisions
    # -----------------------------
    key_decisions = extract_key_decisions(
        result["full_text"]
    )

    print(f"\nKey Decisions:\n{key_decisions}\n")

    # -----------------------------
    # Questions
    # -----------------------------
    questions = extract_questions(
        result["full_text"]
    )

    print(f"\nOpen Questions:\n{questions}\n")

    # -----------------------------
    # Build Vector DB
    # -----------------------------
    build_vector_db(result)

    print("\nVector Database Created.\n")

    print("Video Assistant Pipeline Completed.\n")


if __name__ == "__main__":

    source = input(
        "Enter audio/video file path: "
    )

    run_pipeline(source)

    # -----------------------------
    # Load RAG Chain
    # -----------------------------
    rag_chain = load_rag_chain()

    # -----------------------------
    # Chat Loop
    # -----------------------------
    while True:

        question = input(
            "\nAsk a question from the uploaded source"
            "(or type 'exit'): "
        )

        if question.lower() == "exit":
            print("\nExiting...\n")
            break

        answer = ask_question(
            rag_chain,
            question
        )

        print(f"\nAnswer:\n{answer}\n")