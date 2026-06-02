import logging
import subprocess
import tempfile
from pathlib import Path
from typing import Optional


EBML_MAGIC = b"\x1a\x45\xdf\xa3"

logger = logging.getLogger(__name__)


def _segment_boundaries(chunk_files: list[Path]) -> list[int]:
    """Indices of chunks whose first 4 bytes are an EBML header — each one starts a recording.

    MediaRecorder writes the EBML header only on the first chunk it produces. When the user
    pauses and resumes (a new MediaRecorder instance), another EBML header appears mid-session.
    These boundaries are the source of truth for grouping chunks back into segments — the
    server never sees the pause signal as a binary marker. Returns [0] if chunk_000 itself is
    not a valid EBML start (defensive fallback to single-segment behavior).
    """
    starts: list[int] = []
    for i, f in enumerate(chunk_files):
        with open(f, "rb") as fh:
            if fh.read(4) == EBML_MAGIC:
                starts.append(i)
    return starts or [0]


def _ffprobe_duration(path: Path) -> float:
    """Return media duration in seconds, or 0.0 if ffprobe cannot read the file."""
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=nw=1:nk=1",
                str(path),
            ],
            check=True, capture_output=True, text=True,
        )
        out = result.stdout.strip()
        return float(out) if out else 0.0
    except Exception:
        return 0.0


def _raw_concat(chunk_files: list[Path], output_path: Path) -> Path:
    """Stream chunks into output_path as raw bytes, enforcing 1:1 size match.

    Used both for single-segment merges (all chunks belong to one MediaRecorder stream and
    share the first chunk's EBML header) and for building per-segment seg_*.webm inputs in the
    multi-segment branch. Any short write deletes the partial file so the corruption detector
    will trigger a rebuild on the next access.
    """
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
        output_path.unlink(missing_ok=True)
        raise

    if written != expected:
        output_path.unlink(missing_ok=True)
        raise RuntimeError(
            f"raw concat copy mismatch (wrote {written}, expected {expected})"
        )
    return output_path


def _concat_segments(
    chunk_files: list[Path],
    starts: list[int],
    output_path: Path,
) -> Path:
    """Multi-segment merge: raw-concat each segment, then re-encode them into one WebM.

    The concat *demuxer* cannot stitch independent WebM streams (each carrying its own EBML
    header) — verified empirically across `-c copy`, libopus re-encode, and wav intermediate
    paths in the QA-AUDIO-MERGE-LOSS investigation. The concat *filter* decodes each input and
    re-encodes a single contiguous opus output, which is the only reliable path. Output is
    validated with ffprobe because libopus has a precedent of exiting 0 with truncated output.
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="audio_seg_") as tmpdir_str:
        tmpdir = Path(tmpdir_str)
        seg_paths: list[Path] = []

        end_idx = len(chunk_files)
        for k, start in enumerate(starts):
            stop = starts[k + 1] if k + 1 < len(starts) else end_idx
            seg_chunks = chunk_files[start:stop]
            seg_path = tmpdir / f"seg_{k:03d}.webm"
            _raw_concat(seg_chunks, seg_path)
            seg_paths.append(seg_path)

        expected_total = sum(_ffprobe_duration(p) for p in seg_paths)

        cmd = ["ffmpeg", "-y"]
        for p in seg_paths:
            cmd.extend(["-i", str(p)])
        n = len(seg_paths)
        concat_inputs = "".join(f"[{i}:a]" for i in range(n))
        filter_complex = f"{concat_inputs}concat=n={n}:v=0:a=1[out]"
        cmd.extend([
            "-filter_complex", filter_complex,
            "-map", "[out]",
            "-c:a", "libopus",
            str(output_path),
        ])

        try:
            result = subprocess.run(cmd, check=True, capture_output=True, text=True)
            if result.stderr:
                logger.debug("ffmpeg concat filter stderr: %s", result.stderr[-500:])
        except subprocess.CalledProcessError as e:
            output_path.unlink(missing_ok=True)
            logger.warning(
                "ffmpeg concat filter failed (exit %s): %s",
                e.returncode, (e.stderr or "")[-500:],
            )
            raise RuntimeError(
                f"ffmpeg concat filter failed: exit {e.returncode}"
            ) from e

        # Exit 0 is not enough — libopus has been observed producing valid-looking
        # truncated output. Verify length before trusting the result.
        actual = _ffprobe_duration(output_path)
        if actual <= 0:
            output_path.unlink(missing_ok=True)
            raise RuntimeError(
                f"ffmpeg concat filter produced unreadable output (duration {actual})"
            )
        if expected_total > 0 and actual < expected_total * 0.8:
            output_path.unlink(missing_ok=True)
            raise RuntimeError(
                f"ffmpeg concat filter output too short "
                f"(actual {actual:.2f}s, expected ≥ {expected_total * 0.8:.2f}s)"
            )

        return output_path


def merge_audio_chunks(chunks_dir: Path, output_path: Path) -> Path:
    """Reconstruct a single streamable WebM from MediaRecorder chunks.

    Single-segment (all chunks share one EBML header): raw byte concatenation — byte-for-byte
    identical to what MediaRecorder would have produced without timeslicing. 1:1 size match
    enforced. This is the original QA-AUDIO-MERGE-LOSS-20260514-2 path, preserved unchanged
    so single-recording sessions are zero-regression.

    Multi-segment (user paused and resumed, so chunks_dir contains 2+ EBML headers): raw-concat
    each segment into a self-contained WebM, then re-encode them with ffmpeg's concat filter
    into one continuous output. The concat demuxer cannot stitch independent WebM streams; the
    filter is the only reliable path.
    """
    chunk_files = sorted(chunks_dir.glob("chunk_*.webm"))

    if not chunk_files:
        uploaded = list(chunks_dir.glob("uploaded.*"))
        if uploaded:
            return uploaded[0]
        raise FileNotFoundError(f"No audio files found in {chunks_dir}")

    if len(chunk_files) == 1:
        return chunk_files[0]

    starts = _segment_boundaries(chunk_files)
    if len(starts) <= 1:
        return _raw_concat(chunk_files, output_path)
    return _concat_segments(chunk_files, starts, output_path)


def get_uploaded_audio(chunks_dir: Path) -> Optional[Path]:
    """Find uploaded audio file (upload mode)."""
    for ext in (".webm", ".mp3", ".wav", ".m4a"):
        candidate = chunks_dir / f"uploaded{ext}"
        if candidate.exists():
            return candidate
    return None


def _is_merged_audio_corrupted(merged: Path, chunks: list[Path]) -> bool:
    """Reject obviously broken merged audio so the next access triggers a rebuild.

    Single-segment: size check unchanged — raw concat is 1:1 so any output below 50% of the
    chunk total indicates the legacy `-c copy` bug (~80KB) or libopus partial output (~41KB).

    Multi-segment: a strict 1:1 size check would oscillate because the concat filter
    re-encodes to opus. But "duration > 0" alone is too lenient — the legacy raw-concat
    artifact for multi-segment is literally the bytes of the first segment, so ffprobe sees a
    valid (~5s) duration and returns positive. A two-part check covers both: ffprobe must
    return a duration AND the file must be at least 10% of the chunk total. Re-encoded opus
    stays well above 50% of typical MediaRecorder WebM bitrates, so 10% is far below the
    floor of any healthy output while still catching the legacy artifact (~0.3% of total).
    Won't loop: a freshly produced concat-filter file always clears 10% comfortably.
    """
    if len(chunks) <= 1:
        return False
    starts = _segment_boundaries(chunks)
    if len(starts) <= 1:
        total = sum(c.stat().st_size for c in chunks)
        return merged.stat().st_size < total * 0.5
    if _ffprobe_duration(merged) <= 0:
        return True
    total = sum(c.stat().st_size for c in chunks)
    return merged.stat().st_size < total * 0.1


def resolve_or_build_audio(session_dir: Path) -> Optional[Path]:
    """Resolve or lazily build a single audio file for a session directory.

    Order:
    1) session_dir/merged_audio.webm (already merged by processing pipeline)
       — if it matches a corruption pattern, delete and fall through to (3)
    2) chunks/uploaded.* (upload mode)
    3) chunks/chunk_*.webm → concat into session_dir/merged_audio.webm
    Returns None if no source audio is available.
    """
    merged = session_dir / "merged_audio.webm"
    chunks_dir = session_dir / "chunks"

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
