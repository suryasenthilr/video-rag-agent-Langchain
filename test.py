from dotenv import load_dotenv
import os
load_dotenv()
from utils.audio_processor import process_input
from core.transcriber import Transcriber

t = Transcriber(whisper_model="small", sarvam_api_key=os.getenv("SARVAM_API_KEY"))

chunks = process_input("https://www.youtube.com/watch?v=EjUP08N89mI")  
result = t.transcribe_chunks(chunks)

print(result["full_text"])