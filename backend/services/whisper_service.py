from pathlib import Path
from typing import Optional


_model_cache: dict = {}


def get_model(model_name: str = "medium"):
    """Load and cache a Whisper model."""
    import whisper
    if model_name not in _model_cache:
        _model_cache[model_name] = whisper.load_model(model_name)
    return _model_cache[model_name]


def transcribe(audio_path: Path, language: Optional[str] = None, model_name: str = "medium") -> list[dict]:
    """
    Run Whisper transcription and return segments with timestamps.

    Returns list of dicts:
      [{"start": float, "end": float, "text": str}, ...]
    """
    model = get_model(model_name)

    options = {}
    if language:
        # Convert locale code (ko-KR) to Whisper language code (ko)
        lang_code = language.split("-")[0] if "-" in language else language
        options["language"] = lang_code

    result = model.transcribe(str(audio_path), **options)

    segments = []
    for seg in result.get("segments", []):
        segments.append({
            "start": seg["start"],
            "end": seg["end"],
            "text": seg["text"].strip(),
        })

    return segments
