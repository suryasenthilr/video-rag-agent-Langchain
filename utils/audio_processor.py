import os
import re
import yt_dlp
import ffmpeg
from pydub import AudioSegment


def clean_filename(name):
    """
    Removes invalid Windows filename characters
    """

    # Remove unicode/full-width question mark
    name = name.replace("？", "")

    # Remove invalid filename characters
    return re.sub(r'[\\/*?:"<>|]', "", name)


def download_audio_from_url(url, output_dir="downloads"):
    os.makedirs(output_dir, exist_ok=True)

    with yt_dlp.YoutubeDL() as ydl:
        info = ydl.extract_info(url, download=False)

    title = clean_filename(info["title"])
    output_template = os.path.join(output_dir, title)

    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": output_template,
        "noplaylist": True,
        "quiet": False,
        "postprocessors": [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "wav",
            "preferredquality": "192",
        }],
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])

    # yt-dlp may save with a trailing # — find the actual file
    expected = os.path.join(output_dir, f"{title}.wav")
    if os.path.exists(expected):
        return expected

    # Fallback: scan downloads folder for the most recently created .wav
    wav_files = [
        os.path.join(output_dir, f)
        for f in os.listdir(output_dir)
        if f.endswith(".wav")
    ]
    if not wav_files:
        raise FileNotFoundError("yt-dlp finished but no WAV file found in downloads/")

    latest = max(wav_files, key=os.path.getmtime)
    print(f"  Resolved actual file: {latest}")
    return latest

def convert_to_wav(input_path: str) -> str:
    """
    Convert any audio/video file into
    Whisper-optimized WAV format.

    Output:
    - mono
    - 16kHz
    - wav

    Returns:
        Converted WAV file path
    """

    filename = os.path.splitext(
        os.path.basename(input_path)
    )[0]

    filename = clean_filename(filename)

    output_path = os.path.join(
        "downloads",
        f"{filename}_converted.wav"
    )

    os.makedirs("downloads", exist_ok=True)

    audio = AudioSegment.from_file(input_path)

    audio = (
        audio
        .set_channels(1)      # mono
        .set_frame_rate(16000) # 16kHz
    )

    audio.export(
        output_path,
        format="wav"
    )

    return output_path


def preprocess_audio_for_whisper(input_file):
    """
    Converts audio into Whisper-optimized format:
    - WAV
    - 16kHz
    - mono
    - PCM 16-bit

    Saves processed file in same folder.

    Returns:
        Path to processed WAV file
    """

    folder = os.path.dirname(input_file)

    filename = os.path.splitext(
        os.path.basename(input_file)
    )[0]

    output_file = os.path.join(
        folder,
        f"{filename}_processed.wav"
    )

    (
        ffmpeg
        .input(input_file)
        .output(
            output_file,
            ac=1,                  # mono
            ar=16000,              # 16kHz
            format="wav",
            acodec="pcm_s16le"     # 16-bit PCM
        )
        .overwrite_output()
        .run()
    )

    return output_file
def split_audio_into_chunks(
    input_file,
    chunk_minutes=10
):
    """
    Splits audio into chunks.

    Saves chunks in same downloads folder.

    Returns:
        List of chunk file paths
    """

    audio = AudioSegment.from_wav(input_file)

    chunk_length_ms = int(chunk_minutes * 60 * 1000)

    folder = os.path.dirname(input_file)

    filename = os.path.splitext(
        os.path.basename(input_file)
    )[0]

    chunk_paths = []

    for i, start in enumerate(
        range(0, len(audio), chunk_length_ms)
    ):

        chunk = audio[start:start + chunk_length_ms]

        chunk_file = os.path.join(
            folder,
            f"{filename}_chunk_{i+1}.wav"
        )

        chunk.export(
            chunk_file,
            format="wav"
        )

        chunk_paths.append(chunk_file)

    return chunk_paths

# ---------------- TEST ---------------- #


def process_input(source: str, transcriber) -> tuple:
    """
    Full preprocessing pipeline.

    Flow:
        1. Download/convert audio
        2. Detect language using first 30s
        3. Choose chunk size dynamically
        4. Split audio into chunks

    Returns:
        (
            chunk_paths,
            detected_language
        )
    """

    # ---------------------------------
    # Download or convert input
    # ---------------------------------

    if source.startswith("http://") or source.startswith("https://"):

        print("Detected YouTube URL...")
        wav_path = download_audio_from_url(source)

    else:

        print("Detected local file...")
        wav_path = convert_to_wav(source)

    # ---------------------------------
    # Preprocess for Whisper
    # ---------------------------------

    processed_path = preprocess_audio_for_whisper(
        wav_path
    )

    # ---------------------------------
    # Create temporary 30s sample
    # for language detection
    # ---------------------------------

    print("\nCreating temporary sample for language detection...")

    sample_chunks = split_audio_into_chunks(
        processed_path,
        chunk_minutes=0.5
    )

    sample_path = sample_chunks[0]

    # ---------------------------------
    # Detect language
    # ---------------------------------

    print("\nDetecting language...")

    detected_language = transcriber._detect_language(
        sample_path
    )

    print(
        f"\nDetected language: {detected_language}"
    )

    # ---------------------------------
    # Choose chunk strategy
    # ---------------------------------

    if detected_language == "en":

        chunk_minutes = 4

        print(
            "\nEnglish detected -> using large chunks "
            "(4 minutes, no API limits)."
        )

    else:

        chunk_minutes = 0.5

        print(
            "\nIndic language detected -> using "
            "30 second chunks for Sarvam AI."
        )

    # ---------------------------------
    # Create final chunks
    # ---------------------------------

    print("\nSplitting audio into chunks...")

    chunks = split_audio_into_chunks(
        processed_path,
        chunk_minutes=chunk_minutes
    )

    print(
        f"\nAudio ready - {len(chunks)} chunk(s) created."
    )

    return chunks, detected_language


