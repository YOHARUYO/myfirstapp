import subprocess
from pathlib import Path
from typing import Optional


def merge_audio_chunks(chunks_dir: Path, output_path: Path) -> Path:
    """Merge individual WebM audio chunks into a single file using ffmpeg concat demuxer."""
    chunk_files = sorted(chunks_dir.glob("chunk_*.webm"))

    if not chunk_files:
        # Upload mode: look for uploaded file directly
        uploaded = list(chunks_dir.glob("uploaded.*"))
        if uploaded:
            return uploaded[0]
        raise FileNotFoundError(f"No audio files found in {chunks_dir}")

    if len(chunk_files) == 1:
        return chunk_files[0]

    # Build ffmpeg concat list file
    list_file = chunks_dir / "concat_list.txt"
    with open(list_file, "w", encoding="utf-8") as f:
        for chunk in chunk_files:
            # Use forward slashes for ffmpeg compatibility
            safe_path = str(chunk.absolute()).replace("\\", "/")
            f.write(f"file '{safe_path}'\n")

    output_path.parent.mkdir(parents=True, exist_ok=True)

    subprocess.run(
        [
            "ffmpeg", "-y",
            "-f", "concat", "-safe", "0",
            "-i", str(list_file),
            "-c", "copy",
            str(output_path),
        ],
        check=True,
        capture_output=True,
    )

    # Clean up concat list
    list_file.unlink(missing_ok=True)

    return output_path


def get_uploaded_audio(chunks_dir: Path) -> Optional[Path]:
    """Find uploaded audio file (upload mode)."""
    for ext in (".webm", ".mp3", ".wav", ".m4a"):
        candidate = chunks_dir / f"uploaded{ext}"
        if candidate.exists():
            return candidate
    return None


def resolve_or_build_audio(session_dir: Path) -> Optional[Path]:
    """Resolve or lazily build a single audio file for a session directory.

    Order:
    1) session_dir/merged_audio.webm (already merged by processing pipeline)
    2) chunks/uploaded.* (upload mode)
    3) chunks/chunk_*.webm → concat into session_dir/merged_audio.webm
    Returns None if no source audio is available.
    """
    merged = session_dir / "merged_audio.webm"
    if merged.exists():
        return merged
    chunks_dir = session_dir / "chunks"
    if not chunks_dir.exists():
        return None
    uploaded = get_uploaded_audio(chunks_dir)
    if uploaded:
        return uploaded
    chunks = sorted(chunks_dir.glob("chunk_*.webm"))
    if not chunks:
        return None
    try:
        return merge_audio_chunks(chunks_dir, merged)
    except Exception:
        return None


def convert_to_mp3(src: Path, dst: Path) -> Path:
    """Transcode any audio source to mp3 (libmp3lame, 192kbps)."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-i", str(src),
            "-vn",
            "-c:a", "libmp3lame",
            "-b:a", "192k",
            str(dst),
        ],
        check=True,
        capture_output=True,
    )
    return dst
