import os
import logging
import asyncio
import io
import tempfile
from typing import Dict, Any

try:
    from fastapi import FastAPI, UploadFile, File, HTTPException
    from pydub import AudioSegment, effects
    from pydub.silence import detect_nonsilent
    from openai import OpenAI
except ImportError:
    print("Missing dependencies. Please run: pip install fastapi uvicorn pydub openai python-multipart")

# Initialize Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("speech-to-text")

app = FastAPI(title="KrishiMitra Speech-to-Text API")
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

@app.post("/speech-to-text")
async def speech_to_text(file: UploadFile = File(...)) -> Dict[str, Any]:
    file_bytes = await file.read()
    if len(file_bytes) == 0:
        return {"transcript": "", "language": "unknown", "confidence": "low", "error": "Empty audio"}

    temp_input_path = None
    temp_output_path = None

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=f"_{file.filename}") as tmp:
            tmp.write(file_bytes)
            temp_input_path = tmp.name

        audio = AudioSegment.from_file(temp_input_path)
        audio = effects.normalize(audio)
        audio = audio.set_frame_rate(16000).set_channels(1)
        
        # Robust VAD for noisy farmer input
        non_silent_ranges = detect_nonsilent(audio, min_silence_len=500, silence_thresh=-35)
        if non_silent_ranges:
            start_trim = max(0, non_silent_ranges[0][0] - 200)
            end_trim = min(len(audio), non_silent_ranges[-1][1] + 200)
            audio = audio[start_trim:end_trim]

        if len(audio) < 500:
             return {"transcript": "ക്ഷമಿಸಿ, ನಮಗೆ ಸರಿಯಾಗಿ ಕೇಳಿಸಲಿಲ್ಲ. (Couldn't hear clearly)", "language": "unknown", "confidence": "low"}

        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as tmp_out:
            temp_output_path = tmp_out.name
            audio.export(temp_output_path, format="mp3")

        with open(temp_output_path, "rb") as audio_file:
            response = client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
                prompt="Farmer speaking in Kannada, Hindi, Telugu, Tamil, or English about agriculture.",
                response_format="verbose_json"
            )

        return {
            "transcript": response.text,
            "language": getattr(response, "language", "unknown"),
            "confidence": "high"
        }

    except Exception as e:
        logger.error(f"Error: {e}")
        return {"transcript": "Error processing audio", "language": "unknown", "confidence": "low"}
    
    finally:
        for path in [temp_input_path, temp_output_path]:
            if path and os.path.exists(path):
                os.remove(path)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
