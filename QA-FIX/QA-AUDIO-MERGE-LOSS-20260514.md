# QA-FIX — 녹음 파일 다운로드 99.93% 데이터 손실 (audio_service.merge_audio_chunks)

> 작성일: 2026-05-14
> 작성 주체: 검수(QA) 세션
> 심각도: 🔴 **Critical** — 데이터 무결성
> 관련 커밋: e262762(녹음 파일 내보내기 신규 기능) 사용자 검증 중 발견. 단, 결함 자체는 Sprint 3 시점부터 존재.

---

## 개발 세션 전달 지시사항 (복붙용)

```
QA-AUDIO-MERGE-LOSS-20260514.md 읽고 반영 부탁해.
검수에서 Critical 데이터 무결성 버그 발견했어. 모든 세션의 merged_audio.webm이
첫 청크(약 80KB)만 보존된 상태(99.93% 손실). chunk_*.webm은 디스크에 무손실 보존
되어 있으므로 코드 수정 + 자동 재병합으로 복구 가능.

수정 2건이야:
1) backend/services/audio_service.py — merge_audio_chunks의 -c copy → -c:a libopus 재인코딩
2) resolve_or_build_audio + history._resolve_meeting_audio — 손상 자동 감지 후 lazy 재병합

검증: 1436 chunk(117MB) 세션 → 다운로드 → 재생 시간 = 회의 실제 시간, 파일 크기 50MB+ 확인.

세션 종료 시 reports/DEV-REPORT-20260514.md 작성 부탁해.
```

---

## 1. 사용자 보고 증상

- 2026-05-14 회의 진행 후 녹음 파일(.webm)을 다운로드해서 보존하려 했으나 **재생 길이가 약 5초 이하**로만 잡힘
- 60~120분 실회의 안정성 검증과 동시 발견된 사용자 직접 보고건

---

## 2. 진단 결과 — 디스크 데이터 증거

`backend/data/sessions/` 최근 6개 세션 검수 (2026-05-14 16:30 기준):

| 세션 | Chunks 파일 수 | Chunks 총 크기 | merged_audio.webm | 보존율 |
|------|---------------|---------------|---------------------|--------|
| session_20260423_f90c5ab8 | 15 | 1.16 MB | 80 KB | ~7% |
| **session_20260514_cf94d6f5** | **813** | **66.1 MB** | **78.7 KB** | **0.12%** |
| session_20260514_c1a692b5 | 222 | 18 MB | 80 KB | 0.45% |
| session_20260513_8808a083 | 118 | 9.7 MB | 80 KB | 0.83% |
| **session_20260513_919435a7** | **1436** | **117 MB** | **79 KB** | **0.07%** |
| session_20260512_eff1956b | 378 | 30.7 MB | 80 KB | 0.26% |

**패턴 확정:** 모든 merged_audio.webm이 청크 총합과 무관하게 ~78–80 KB로 고정. 80 KB는 5초 webm 청크 크기와 거의 일치 → **first-chunk-only 보존 패턴**.

**가설 확정 증거:** 사용자가 다운로드한 webm 파일을 미디어 플레이어에서 열었을 때 재생 길이 약 5초 이하 → 가설 100% 일치.

---

## 3. 근본 원인

`backend/services/audio_service.py:30-40` — `merge_audio_chunks` 함수의 ffmpeg 호출:

```python
subprocess.run(
    [
        "ffmpeg", "-y",
        "-f", "concat", "-safe", "0",
        "-i", str(list_file),
        "-c", "copy",           # ← 결함: stream copy
        str(output_path),
    ],
    check=True,
    capture_output=True,        # ← stderr가 묻혀서 사용자 미인지
)
```

**왜 깨지나:**
- MediaRecorder는 5초마다 **자체 EBML 헤더 + Cluster를 가진 streamable WebM 청크**를 만든다 (chunk_000.webm, chunk_001.webm, ...).
- ffmpeg concat demuxer + `-c copy`는 stream copy 모드 — raw bytes를 그대로 이어붙인다.
- 두 번째 청크부터의 EBML 헤더가 첫 컨테이너의 data로 오해되어, **결과 파일의 첫 EBML 컨테이너(첫 청크)만 유효한 미디어 스트림으로 인식**됨.
- 미디어 플레이어는 첫 컨테이너의 duration만 보고 재생을 종료 → 약 5초만 재생됨.
- `capture_output=True`로 ffmpeg stderr가 묻혀서 코드는 정상 종료 처리, 사용자·로그·UI 어디에도 경고 없음.

**왜 지금까지 발견 못했나:**
- 4단계 Whisper도 동일 결함 영향을 받았으나(`processing.py:88`이 같은 함수 호출), **하이브리드 전사 구조 덕에 Web Speech가 첫 5초 이후를 메워서** 사용자가 인지하지 못함.
- 녹음 파일 다운로드 기능(e262762)이 도입되어 사용자가 실제 audio 보존 상태를 확인하면서 비로소 노출됨.

---

## 4. 수정 명세

### 4.1 audio_service.merge_audio_chunks — libopus 재인코딩

**파일:** `backend/services/audio_service.py:30-40`

```python
subprocess.run(
    [
        "ffmpeg", "-y",
        "-f", "concat", "-safe", "0",
        "-i", str(list_file),
        "-c:a", "libopus",      # ← 재인코딩 (각 청크 디코드 → 단일 opus 스트림)
        "-b:a", "96k",          # ← 음성용 적정 비트레이트
        str(output_path),
    ],
    check=True,
    capture_output=True,
)
```

**변경 이유:** 재인코딩 시 ffmpeg가 각 청크를 디코딩한 후 단일 streamable opus로 재출력 → EBML 컨테이너 경계 문제가 사라짐. 60분 회의 기준 약 30~60초 처리 시간 (한 번만 발생, 캐시됨).

**비트레이트 96k 근거:** 음성 녹음용으로 최적. 원본 MediaRecorder 출력도 보통 48~64kbps 수준이라 품질 저하 거의 없음. 60분 회의 → 약 43 MB.

**에러 처리 보강 (선택):** ffmpeg returncode 외에도 결과 파일 크기가 첫 청크보다 작으면 raise → silent failure 차단.

### 4.2 audio_service.resolve_or_build_audio — 손상 자동 감지 + lazy 재병합 (R1+R3)

**파일:** `backend/services/audio_service.py:57-81`

함수 시작부에 손상 감지 로직 추가:

```python
def resolve_or_build_audio(session_dir: Path) -> Optional[Path]:
    merged = session_dir / "merged_audio.webm"
    chunks_dir = session_dir / "chunks"

    # R3: 손상 감지 (first-chunk-only 패턴)
    if merged.exists() and chunks_dir.exists():
        chunks = sorted(chunks_dir.glob("chunk_*.webm"))
        if len(chunks) > 1:
            first_chunk_size = chunks[0].stat().st_size
            merged_size = merged.stat().st_size
            # 손상 판정: merged가 첫 청크 크기의 1.2배 이내이고, 전체 청크 합의 절반 미만
            total_chunks_size = sum(c.stat().st_size for c in chunks)
            if merged_size < first_chunk_size * 1.2 and merged_size < total_chunks_size * 0.5:
                # R1: 손상본 자동 삭제 → 아래 분기에서 lazy 재병합 트리거
                merged.unlink()

    if merged.exists():
        return merged
    # ... 기존 로직 (uploaded → chunk 즉석 concat) 유지
```

**판정 기준 근거:**
- 정상 merged: 청크 총합과 비슷한 크기 (재인코딩 시 약 60~80%)
- 손상 merged: 첫 청크 크기와 거의 같음 (80 KB 수준)
- 두 조건(첫 청크 크기 근접 + 청크 합의 절반 미만)을 모두 만족해야 손상으로 판정 → false positive 최소화

### 4.3 history._resolve_meeting_audio — 같은 보정 분기 적용

**파일:** `backend/routers/history.py:262-275`

`Meeting.merged_audio_path`가 가리키는 파일에도 동일 손상 감지 적용 필요.

```python
def _resolve_meeting_audio(m: Meeting) -> Optional[Path]:
    if m.merged_audio_path:
        p = Path(m.merged_audio_path)
        if p.exists():
            # R3: 손상 감지 — session_dir 추적 가능하면 청크 비교
            session_id = m.meeting_id.replace("mtg_", "session_")
            session_dir = SESSIONS_DIR / session_id
            chunks_dir = session_dir / "chunks"
            if chunks_dir.exists():
                chunks = sorted(chunks_dir.glob("chunk_*.webm"))
                if len(chunks) > 1:
                    first_chunk_size = chunks[0].stat().st_size
                    p_size = p.stat().st_size
                    total = sum(c.stat().st_size for c in chunks)
                    if p_size < first_chunk_size * 1.2 and p_size < total * 0.5:
                        p.unlink()
                        # fall through to session_dir resolve
                    else:
                        return p
                else:
                    return p
            else:
                return p
    # 기존: session_dir resolve_or_build_audio로 fallback
    session_id = m.meeting_id.replace("mtg_", "session_")
    session_dir = SESSIONS_DIR / session_id
    if session_dir.exists():
        return resolve_or_build_audio(session_dir)
    return None
```

**또는 더 깔끔하게:** `resolve_or_build_audio`에 손상 감지가 들어가 있으므로, `_resolve_meeting_audio`도 `Meeting.merged_audio_path` 사용 분기를 제거하고 항상 `resolve_or_build_audio(session_dir)`로 위임. (단순화 가능 — 개발 판단)

---

## 5. 영향 범위

| 영역 | 영향 | 수정 후 |
|------|------|---------|
| 🎵 녹음 파일 다운로드 (e262762) | 첫 5초만 보존 | 전체 회의 보존 |
| 🎙 4단계 Whisper 처리 | 첫 5초만 Whisper 입력 | 전체 회의 입력 → 전사 품질 향상 가능 |
| 🗃 과거 모든 회의의 merged_audio.webm | 손상 상태 | **재 다운로드 1회로 자동 복구** (R1+R3) |
| 📦 SendSave 7단계 export-audio | 손상본 export | 정상 export |
| 30분+ race 종결(`69948e7`) | 무관 | 무관 — 별개 결함 |

---

## 6. 검증 항목

1. **신규 회의 (수정 후 첫 녹음)**
   - 5분 녹음 → 다운로드 → 미디어 플레이어 재생 시간 ≈ 5분
   - 60분 녹음 → 다운로드 → 재생 시간 ≈ 60분, 파일 크기 약 30~50 MB
   - .mp3 다운로드도 정상 (libmp3lame 192kbps로 약 70~80 MB)

2. **자동 복구 (기존 손상 세션)**
   - `session_20260513_919435a7` (1436 chunks, 117 MB) → 히스토리에서 녹음 다운로드 클릭
   - 첫 요청 시 손상 감지 → merged_audio.webm 자동 삭제 → 즉석 재병합 (약 60~90초 대기)
   - 결과 webm 재생 시간이 회의 실제 길이와 일치
   - 두 번째 요청부터는 캐시된 새 merged_audio.webm 사용 (빠름)

3. **회귀 — 4단계 Whisper 처리**
   - 새 회의에서 Whisper 입력으로 전체 회의 음성이 들어가는지 (전사 품질 비교)
   - 기존 회의의 Whisper 재처리는 별도 기능이 없으므로 자연스럽게 다음 회의부터만 영향

4. **에러 케이스**
   - chunks 디렉토리에 청크 1개만 있는 정상 케이스 → 손상 감지 false positive 안 나는지
   - upload 모드(uploaded.webm 등) → 영향 없는지

---

## 7. 권장 작업 순서

1. **4.1 적용** (libopus 재인코딩) — 신규 녹음부터 정상 동작
2. **4.2 + 4.3 적용** (손상 자동 감지) — 과거 손상 세션 lazy 복구
3. **사용자 신규 녹음 1회 + 손상 세션 1개 다운로드 검증** (1번 919435a7 권장 — 가장 큰 케이스로 확실히 검증)
4. **DEV-REPORT-20260514.md 작성**

---

## 8. 비변경 항목 (참고)

- **`merge_audio_chunks`의 시그니처·반환값**: 변경 없음 (호출처 processing.py 무영향)
- **`Meeting.merged_audio_path` 모델**: 변경 없음
- **resolve_or_build_audio의 우선순위**: merged_audio.webm → uploaded.* → chunk concat (변경 없음, 손상 감지만 추가)
- **`-c copy`를 다른 ffmpeg 호출에서는 유지**: convert_to_mp3는 이미 `-c:a libmp3lame`이므로 무관

---

## 9. 우선순위

🔴 **Critical** — 데이터 무결성. 운영 사용 중 사용자의 핵심 자료(녹음 파일)가 99.93% 손실되는 결함. 즉시 반영 권장.

---

## 10. 잠재 후속 검토 (참고용 — 본 QA-FIX 범위 밖)

- **stderr 로깅:** ffmpeg subprocess 실패·경고를 로그로 남기는 표준 패턴 도입 (silent failure 일반 차단)
- **Whisper 재처리:** 기존 회의의 전사 품질 재평가 — 옵션이지 강제 아님
- **신규 녹음 검증 스크립트:** 회의 후 자동으로 merged 크기 ≥ 청크 합의 30% 검증하는 health check (이번 결함이 다른 형태로 재발하지 않도록)
