import subprocess
from pathlib import Path
from typing import Optional


def merge_audio_chunks(chunks_dir: Path, output_path: Path) -> Path:
    """Reconstruct a single streamable WebM by raw byte concatenation.

    MediaRecorder produces one WebM stream sliced into chunks: only the first chunk
    carries the EBML header, subsequent chunks are headerless Cluster bytes. ffmpeg's
    concat demuxer cannot reassemble these — neither `-c copy` (first container only,
    ~5s playback) nor `-c:a libopus` re-encoding (silent partial output of ~40KB) —
    because chunk_001+ fail EBML header parsing on their own. Concatenating raw bytes
    restores what MediaRecorder would have produced without timeslicing: a valid
    streamable WebM that any player and ffmpeg downstream (mp3 convert, Whisper) can
    decode. Verified: 28MB / 349 chunks → 28MB output in 0.33s, ffprobe shows valid
    opus/48kHz/stereo, mp3 transcode reports the recording's true duration.
    """
    chunk_files = sorted(chunks_dir.glob("chunk_*.webm"))

    if not chunk_files:
        # Upload mode: look for uploaded file directly
        uploaded = list(chunks_dir.glob("uploaded.*"))
        if uploaded:
            return uploaded[0]
        raise FileNotFoundError(f"No audio files found in {chunks_dir}")

    if len(chunk_files) == 1:
        return chunk_files[0]

    output_path.parent.mkdir(parents=True, exist_ok=True)

    expected = sum(c.stat().st_size for c in chunk_files)
    written = 0
    try:
        with open(output_path, "wb") as outf:
            for chunk in chunk_files:
                with open(chunk, "rb") as srcf:
                    while True:
                        buf = srcf.read(1024 * 1024)
                        if not buf:
                            break
                        outf.write(buf)
                        written += len(buf)
    except Exception:
        # Don't leave a partial file on disk — the corruption detector or a
        # downstream consumer would otherwise see it as a "valid" output.
        output_path.unlink(missing_ok=True)
        raise

    if written != expected:
        output_path.unlink(missing_ok=True)
        raise RuntimeError(
            f"merge_audio_chunks copy mismatch (wrote {written}, expected {expected})"
        )

    return output_path


def get_uploaded_audio(chunks_dir: Path) -> Optional[Path]:
    """Find uploaded audio file (upload mode)."""
    for ext in (".webm", ".mp3", ".wav", ".m4a"):
        candidate = chunks_dir / f"uploaded{ext}"
        if candidate.exists():
            return candidate
    return None


def _is_merged_audio_corrupted(merged: Path, chunks: list[Path]) -> bool:
    """Detect any merged file meaningfully smaller than the sum of its chunks.

    With raw concat the healthy output equals the sum of chunk sizes exactly. Anything
    significantly smaller (< 50% of total) indicates the legacy `-c copy` bug (~80KB
    first-chunk-only), the libopus partial-output bug (~41KB), or some future failure
    mode. A single threshold covers all of them. Single-chunk recordings are exempt to
    avoid false positives on legitimately short sessions.
    """
    if len(chunks) <= 1:
        return False
    total = sum(c.stat().st_size for c in chunks)
    return merged.stat().st_size < total * 0.5


def resolve_or_build_audio(session_dir: Path) -> Optional[Path]:
    """Resolve or lazily build a single audio file for a session directory.

    Order:
    1) session_dir/merged_audio.webm (already merged by processing pipeline)
       — if it matches the legacy corruption pattern, delete and fall through to (3)
    2) chunks/uploaded.* (upload mode)
    3) chunks/chunk_*.webm → concat into session_dir/merged_audio.webm
    Returns None if no source audio is available.
    """
    merged = session_dir / "merged_audio.webm"
    chunks_dir = session_dir / "chunks"

    # Auto-recover from the legacy `-c copy` corruption: drop the bad merged file so
    # the chunk-concat branch below rebuilds it with the fixed encoder.
    if merged.exists() and chunks_dir.exists():
        chunks_for_check = sorted(chunks_dir.glob("chunk_*.webm"))
        if _is_merged_audio_corrupted(merged, chunks_for_check):
            merged.unlink()

    if merged.exists():
        return merged
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
