import os
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough, RunnableLambda
from core.vector_store import store, retrieve,load_existing

def get_llm():
    llm = ChatGroq(
    model="llama-3.3-70b-versatile",
    temperature=0
    )
    return llm

def format_docs(docs):
    return "\n\n".join(f"[Source: {doc.metadata.get('source', 'Unknown')}]\n{doc.page_content}" for doc in docs)

def build_vector_db(transcript: dict, session_id: str, source_name: str):
    vector_store = store(transcript, session_id, source_name)
    return vector_store

def load_rag_chain(session_id: str):
    llm = get_llm()
    prompt = ChatPromptTemplate.from_messages([
        (
            "system",
            """
You are an expert meeting and transcript assistant.

Use BOTH:
1. The transcript context (which includes source files/video attributions like [Source: filename_or_youtube_title])
2. The previous conversation history

to answer the user's question.

Guidelines:
- Give detailed and informative answers.
- Maintain conversational continuity.
- Resolve references like "he", "she", "that topic", "his point" using previous conversation history.
- Do NOT invent information outside the transcript.
- If the answer is not found, say: "I could not find this information in the meeting transcript."
- You are chatting with a workspace containing multiple media sources. You MUST summarize and synthesize information from ALL sources if the question is generic. Always specify which source file(s) or video(s) the information comes from in your responses (e.g., 'According to [source_name], ...'). Do not mix information from different files without attribution.

Previous Conversation:
{chat_history}

Transcript Context:
{context}
"""
        ),
        ("human", "{question}")
    ])
    
    def retrieve_context(input_data):
        question = input_data["question"]
        vector_store = load_existing(session_id)
        
        # Load list of completed sources for this session from database
        from backend.db import get_session_sources
        try:
            sources = get_session_sources(session_id)
            completed_sources = [s["name"] for s in sources if s["status"] == "completed"]
        except Exception as e:
            completed_sources = []
            
        if not completed_sources:
            # Fallback to standard similarity search across whole DB
            docs = vector_store.similarity_search(question, k=5)
            return format_docs(docs)
            
        # Dynamically allocate retrieval budget (k) per source to prevent context overflow
        num_sources = len(completed_sources)
        if num_sources <= 1:
            k_per_source = 6
        elif num_sources == 2:
            k_per_source = 4
        else:
            k_per_source = 3
            
        all_docs = []
        for source_name in completed_sources:
            try:
                # Query each source individually to guarantee it is represented
                docs = vector_store.similarity_search(question, k=k_per_source, filter={"source": source_name})
                all_docs.extend(docs)
            except Exception as e:
                print(f"Error querying Chroma for source {source_name}: {e}")
                
        if not all_docs:
            all_docs = vector_store.similarity_search(question, k=5)
            
        return format_docs(all_docs)

    rag_chain = (
        {
            "context": RunnableLambda(retrieve_context),
            "question": RunnableLambda(lambda x: x["question"]),
            "chat_history": RunnableLambda(lambda x: x["chat_history"]),
        }
        | prompt
        | llm
        | StrOutputParser()
    )

    return rag_chain

def ask_question(rag_chain, question: str, chat_history_list: list) -> str:
    """
    Asks Q&A against the rag chain using session-specific history list.
    chat_history_list is a list of dicts: [{'role': 'user'|'assistant', 'content': str}]
    """
    history_str = "\n".join(
        f"{'User' if msg['role'] == 'user' else 'Assistant'}: {msg['content']}" 
        for msg in chat_history_list
    )

    print(f"\nQuestion: {question}\n")

    answer = rag_chain.invoke({
        "question": question,
        "chat_history": history_str
    })

    return answer


