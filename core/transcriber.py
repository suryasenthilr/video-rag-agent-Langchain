# transcriber.py

import os
import requests
import whisper
from dotenv import load_dotenv
load_dotenv()
import time 
# ──────────────────────────────────────────
# Language Detection
# ──────────────────────────────────────────

def detect_language(audio_path: str, model) -> str:
    """
    Uses Whisper's built-in language detection on the first 30s.
    Only used to distinguish English vs Indic.

    Returns:
        Language code, e.g. 'en', 'hi', 'ta'
    """
    import whisper as _whisper

    audio = _whisper.load_audio(audio_path)
    audio = _whisper.pad_or_trim(audio)

    mel = _whisper.log_mel_spectrogram(audio).to(model.device)
    _, probs = model.detect_language(mel)

    detected = max(probs, key=probs.get)
    confidence = probs[detected]

    print(f"  Detected language: '{detected}' (confidence: {confidence:.2f})")
    return detected


# ──────────────────────────────────────────
# Whisper Transcriber — English only
# ──────────────────────────────────────────

class WhisperTranscriber:
    """
    Transcribes English audio using OpenAI Whisper locally.
    model_size: 'tiny', 'base', 'small', 'medium', 'large'
    Recommended: 'small' for speed, 'medium' for accuracy.
    """

    def __init__(self, model_size: str = "base"):
        print(f"Loading Whisper model ({model_size})...")
        self.model = whisper.load_model(model_size)
        print("Whisper model loaded.")

    def transcribe(self, audio_path: str) -> dict:
        """
        Transcribes a WAV file in English.

        Returns:
            {
                "text":     full transcript string,
                "segments": list of timed segments,
                "language": "en"
            }
        """
        print(f"  Transcribing with Whisper (English): {os.path.basename(audio_path)}")

        result = self.model.transcribe(
            audio_path,
            language="en",   # hardcoded — Whisper is only used for English
            fp16=False,      # set True if on GPU
            verbose=False,
        )

        return {
            "text": result["text"].strip(),
            "segments": result.get("segments", []),
            "language": "en",
        }


# ──────────────────────────────────────────
# Sarvam AI Transcriber — Hindi & Tamil
# ──────────────────────────────────────────

class SarvamTranscriber:
    """
    Transcribes Hindi and Tamil audio using Sarvam AI's ASR API.
    Docs: https://docs.sarvam.ai/api-reference-docs/endpoints/speech-to-text

    Supported here: Hindi (hi), Tamil (ta)
    Sarvam also supports: bn, gu, kn, ml, mr, or, pa, te
    """

    LANGUAGE_CODE_MAP = {
        "hi": "hi-IN",
        "ta": "ta-IN",
    }

    API_URL = "https://api.sarvam.ai/speech-to-text-translate"

    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.getenv("SARVAM_API_KEY")

        if not self.api_key:
            raise ValueError(
                "Sarvam API key not found. "
                "Set SARVAM_API_KEY env variable or pass api_key."
            )

    def transcribe(self, audio_path: str, language: str) -> dict:
        """
        Transcribes a WAV chunk using Sarvam AI.

        Note: Sarvam accepts files up to 25MB / ~5 min.
        Always pass pre-chunked audio from audio_processor.py.

        Args:
            audio_path: Path to WAV chunk
            language:   'hi' or 'ta'

        Returns:
            {
                "text":     transcript string,
                "segments": [],     (Sarvam doesn't return segments)
                "language": language code
            }
        """
        if language not in self.LANGUAGE_CODE_MAP:
            raise ValueError(
                f"Unsupported language '{language}' for Sarvam. "
                f"Supported: {list(self.LANGUAGE_CODE_MAP.keys())}"
            )

        lang_code = self.LANGUAGE_CODE_MAP[language]

        print(f"  Transcribing with Sarvam AI ({lang_code}): {os.path.basename(audio_path)}")

        with open(audio_path, "rb") as f:
            response = requests.post(
                self.API_URL,
                headers={
                    "api-subscription-key": self.api_key,
                },
                files={
                    "file": (os.path.basename(audio_path), f, "audio/wav"),
                },
                data={
                    "language_code": lang_code,
                    "model": "saaras:v3",
                    "target_language_code": "en-IN",
                    "with_timestamps": False,
                }
            )

        if response.status_code != 200:
            raise RuntimeError(
                f"Sarvam API error {response.status_code}: {response.text}"
            )

        data = response.json()

        return {
            "text": data.get("transcript", "").strip(),
            "segments": [],
            "language": language,
        }


# ──────────────────────────────────────────
# Main Transcriber — routes by language
# ──────────────────────────────────────────

class Transcriber:
    """
    Unified transcriber for English, Hindi, and Tamil.

    Routing:
        English  ->  Whisper  (local, no API needed)
        Hindi    ->  Sarvam AI
        Tamil    ->  Sarvam AI

    Usage:
        t = Transcriber(whisper_model="small", sarvam_api_key="sk-...")
        result = t.transcribe_chunks(chunk_paths)
        print(result["full_text"])
    """

    SARVAM_LANGUAGES = {"hi", "ta"}
    SUPPORTED_LANGUAGES = {"en", "hi", "ta"}

    def __init__(
        self,
        whisper_model: str = "base",
        sarvam_api_key: str = None,
        force_language: str = None,
    ):
        """
        Args:
            whisper_model:   Whisper model size ('tiny','small','medium','large')
            sarvam_api_key:  Sarvam API key (or set SARVAM_API_KEY env var)
            force_language:  Skip auto-detection. Pass 'en', 'hi', or 'ta'.
        """
        if force_language and force_language not in self.SUPPORTED_LANGUAGES:
            raise ValueError(
                f"force_language='{force_language}' is not supported. "
                f"Choose from: {self.SUPPORTED_LANGUAGES}"
            )

        self.force_language = force_language
        self._whisper_model_size = whisper_model
        self._sarvam_api_key = sarvam_api_key

        # Lazy-loaded — only initialized when actually needed
        self._whisper: WhisperTranscriber = None
        self._sarvam: SarvamTranscriber = None

    @property
    def whisper(self) -> WhisperTranscriber:
        if self._whisper is None:
            self._whisper = WhisperTranscriber(self._whisper_model_size)
        return self._whisper

    @property
    def sarvam(self) -> SarvamTranscriber:
        if self._sarvam is None:
            self._sarvam = SarvamTranscriber(self._sarvam_api_key)
        return self._sarvam

    def _detect_language(self, audio_path: str) -> str:
        """
        Detects language using Whisper on first chunk.
        If detected language is not in supported set, raises an error.
        """
        detected = detect_language(audio_path, self.whisper.model)

        if detected not in self.SUPPORTED_LANGUAGES:
            raise ValueError(
                f"Detected language '{detected}' is not supported. "
                f"This tool only handles: {self.SUPPORTED_LANGUAGES}. "
                f"Use force_language='en'/'hi'/'ta' to override detection."
            )

        return detected

    def transcribe_chunk(self, audio_path: str, language: str) -> dict:

        if language == "en":
            result = self.whisper.transcribe(audio_path)

        elif language in self.SARVAM_LANGUAGES:

            for attempt in range(3):
                try:
                    result = self.sarvam.transcribe(audio_path, language=language)
                    break

                except RuntimeError as e:
                    if "429" in str(e):
                        wait = 15 * (attempt + 1)
                        print(f"  Rate limited. Waiting {wait}s before retry {attempt+1}/3...")
                        time.sleep(wait)
                    else:
                        raise
            else:
                raise RuntimeError("Sarvam rate limit exceeded after 3 retries.")

        result["chunk_path"] = audio_path
        return result

    def transcribe_chunks(self, chunk_paths: list, language: str = None) -> dict:
        """
        Transcribes all audio chunks and merges into a single transcript.

        Args:
            chunk_paths: List of WAV chunk paths from audio_processor.py
            language:    'en', 'hi', or 'ta'

        Returns:
            {
                "full_text":  complete merged transcript (str),
                "chunks":     list of per-chunk result dicts,
                "language":   language code used
            }
        """
        if not chunk_paths:
            return {"full_text": "", "chunks": [], "language": "unknown"}

        # Determine language
        lang = language or self.force_language

        if lang is None:
            raise ValueError(
                "Language must be passed from process_input()."
            )

        print(f"  Language set to '{lang}' for all chunks.\n")

        results = []

        for i, path in enumerate(chunk_paths):
            print(f"\nChunk {i+1}/{len(chunk_paths)}: {os.path.basename(path)}")
            result = self.transcribe_chunk(path, language=lang)
            result["chunk_index"] = i + 1
            results.append(result)

            # wait between chunks only for Sarvam languages
            if (
                lang in self.SARVAM_LANGUAGES
                and i < len(chunk_paths) - 1
            ):
                print(f"  Waiting 12s before next chunk...")
                time.sleep(12)

        full_text = "\n\n".join(r["text"] for r in results if r["text"])

        return {
            "full_text": full_text,
            "chunks": results,
            "language": lang,
        }