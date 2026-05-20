from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.runnables import RunnablePassthrough,RunnableParallel,RunnableLambda
import os 

def get_llm():
    llm = ChatGroq(
    model="llama-3.3-70b-versatile",
    temperature=0
    )
    return llm


def split_transcript(transcript, chunk_size=1000, chunk_overlap=200)->list:
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap
    )
    return text_splitter.split_text(transcript)

def create_summary(transcript):
    llm = get_llm()
    partial_summary = []
    chunk_chat_prompt = ChatPromptTemplate.from_messages([
        ("system", "You are a helpful assistant that summarizes video transcripts."),
        ("human", "Summarize the following transcript chunk:\n\n{chunk}")
    ])
    
    chunks = split_transcript(transcript)
    for chunk in chunks:
        chunk_prompt = chunk_chat_prompt.invoke({
            'chunk' : chunk
        })
        partial_summary.append(llm.invoke(chunk_prompt).content)

    combine_partial_summary = "\n\n".join(partial_summary)
    combined_prompt = ChatPromptTemplate.from_messages(
        [
        (
            "system",
            "You are an expert meeting summarizer. Combine these partial summaries "
            "into one final professional meeting summary in bullet points.",
        ),
        ("human", "{text}"),
    
    ]
    )
    combined_chain = (
    combined_prompt
    | llm
    | StrOutputParser()
)

    final_summary = combined_chain.invoke({
        "text": combine_partial_summary
    })

    return final_summary


def generate_title(transcript):
    llm = get_llm()
    title_chain = (
        RunnablePassthrough() | RunnableLambda(lambda x:{"text":x}) | 
        ChatPromptTemplate.from_messages([
             (
                "system",
                "Based on the meeting transcript, generate a short professional meeting title "
                "(max 8 words). Only return the title, nothing else.",
            ),
            ("human", "{text}"),
        ])
        | llm
        |StrOutputParser()
    )

    return title_chain.invoke(transcript[:2000])
    

    

