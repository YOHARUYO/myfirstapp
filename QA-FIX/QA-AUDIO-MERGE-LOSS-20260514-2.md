# QA-FIX-2 — 녹음 파일 다운로드 POST 404 / 41 KB partial 잔여 (raw binary concat 재설계)

> 작성일: 2026-05-14 (오후)
> 작성 주체: 검수(QA) 세션
> 심각도: 🔴 **Critical** — 1차 fix(QA-AUDIO-MERGE-LOSS-20260514) 적용 후에도 데이터 무결성 미해결
> 관련 문서: `QA-FIX/QA-AUDIO-MERGE-LOSS-20260514.md` (1차), `reports/DEV-REPORT-20260514.md`
> 검증 환경: ffmpeg 8.1-full_build (libopus·libmp3lame 모두 정상 등록)

---

## 개발 세션 전달 지시사항 (복붙용)

```
QA-AUDIO-MERGE-LOSS-20260514-2.md 읽고 반영 부탁해.
1차 fix(QA-AUDIO-MERGE-LOSS-20260514)가 적용되었지만 새 회의에서 POST 404가 발생해 검수가 재진단함.
근본 원인 재확정: MediaRecorder 청크는 첫 청크에만 EBML 헤더가 있는 단일 streamable WebM의 단편이라
ffmpeg concat demuxer로는 처리 불가(`-c copy`든 `libopus 재인코딩`이든 동일). 첫 청크만 디코딩되어
silent하게 partial 결과를 만들고 sanity check raise → partial 파일이 디스크에 남으면서 router 404.

수정 3건:
1) audio_service.merge_audio_chunks를 raw binary concat으로 전면 재구현 (ffmpeg 우회)
   — 같은 데이터 100% 보존, 0.3초 처리 검증 완료
2) _is_merged_audio_corrupted 판정 단순화 (`merged < total*0.5` 단일 조건)
3) merge_audio_chunks가 raise하기 전에 partial 출력 파일 unlink (resolve_or_build_audio의 except 분기 도달 시 디스크 정리)

검증 핵심:
- 새 회의(짧은 녹음 + 30분+ 녹음) → 7단계 다운로드 → 재생 길이 = 회의 실제 시간, 파일 크기 ≈ chunks 총합
- 손상 세션(session_20260513_919435a7, 1436chunks/117MB) → 히스토리 [녹음 다운로드] → 첫 클릭 시 자동 복구

resume·복구 세션(한 세션에서 두 번 녹음한 케이스)은 별도 한계로 분리 — 본 fix 범위 밖. 본 QA-FIX 7절 참고.

세션 종료 시 reports/DEV-REPORT-20260514.md에 추가 절로 본 fix 결과 기록 부탁해.
```

---

## 1. 1차 fix 적용 후 사용자 보고 증상

사용자(PM):
> "녹음 본 저장 안 되는 오류까지 너의 지시를 받아서 개발이 반영해두었는데 이후 서버 재시작한 다음 새로 작성한 회의록에서 녹음한 파일을 다운받으려 하니 POST 404 not found 오류가 떠."

직접 증거:
- `backend/data/sessions/session_20260507_6e5990a1`: chunks 349개 / 28.2 MB, merged_audio.webm = **41,818 bytes** (정상 28 MB도 아니고, 손상 패턴 80 KB도 아닌 어중간한 값)
- 다른 과거 세션(80 KB 손상본)들은 아직 사용자가 다운로드 시도 안 한 것이라 그대로

---

## 2. 진단 — 실제 ffmpeg 동작 재현

### 2.1 1차 fix가 적용되어 있음을 확인

`backend/services/audio_service.py`를 검수:
- ✅ `-c copy` → `-c:a libopus -b:a 96k` 변경 들어감
- ✅ `_is_merged_audio_corrupted` 헬퍼 신규
- ✅ `resolve_or_build_audio`에 손상 자동 감지 + lazy 재병합
- ✅ sanity check (`out_size < first_size` 시 RuntimeError)
- ⚠ 단, 모두 working tree에 modified로만 존재 (아직 commit 안 됨)

ffmpeg 환경:
- 8.1-full_build (gyan.dev), configuration `--enable-libopus` ✅
- `ffmpeg -encoders | grep opus`: `A....D libopus` 등록됨 ✅
- → **libopus 미지원 가설 기각**

### 2.2 실제 명령 수동 실행 — 결정적 증거

`session_20260507_6e5990a1` chunks 349개를 백엔드와 동일한 Python 호출로 실행:

```python
subprocess.run([
    "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", list_file,
    "-c:a", "libopus", "-b:a", "96k", output_path
], check=True, capture_output=True, timeout=180)
```

**결과:**
- ffmpeg **exit code 0** (성공 반환)
- 입력 28.2 MB → 출력 **41,818 bytes** (0.15% 보존)
- stderr에 명시적 에러 없음

⇒ **silent failure**: exit 0이라 try/except에 안 잡힘. sanity check (`out_size < first_size`)에서 비로소 raise.

### 2.3 두 번째 청크 단독 디코딩 시도

`ffmpeg -i chunk_001.webm`:
```
[in#0] Format matroska,webm detected only with low score of 1, misdetection possible!
[in#0] EBML header parsing failed
Error opening input file ...chunk_001.webm
```

⇒ **chunk_001.webm은 ffmpeg가 열지 못함**. chunk_000.webm은 정상.

---

## 3. 진짜 근본 원인 — MediaRecorder의 streamable WebM 구조

`MediaRecorder.start(timeslice)`로 슬라이스해도 출력은 **연속된 단일 WebM 스트림**의 단편입니다:

- **첫 청크**: EBML 헤더 + Segment 시작 + Cluster들
- **후속 청크**: **헤더 없는 Cluster bytes만**

즉, 개별 `chunk_*.webm` 파일은 **독립적인 WebM 파일이 아닙니다**. 첫 청크와 시퀀스로 이어졌을 때만 valid WebM stream을 형성합니다.

### 3.1 ffmpeg를 거치는 모든 시도가 실패하는 이유

| 시도 | 결과 |
|------|------|
| `-c copy` (1차 fix 이전) | 첫 EBML 컨테이너만 인식 → ~5초 재생 |
| `-c:a libopus` (1차 fix) | concat demuxer가 후속 청크의 EBML 부재로 timecode 인식 못함 → silent 0.15% 보존 |
| `-fflags +genpts` 추가 (검수 실험) | 동일하게 첫 청크만 처리 (40.8 KB) |
| 개별 청크 디코딩 후 wav concat (검수 실험) | chunk_001부터 `EBML header parsing failed` |

⇒ **ffmpeg concat demuxer는 본질적으로 적합하지 않음**. MediaRecorder의 streamable WebM은 ffmpeg에게 보여주기 전에 먼저 **하나의 stream으로 재조립**되어야 함.

### 3.2 raw binary concat이 정답

브라우저에서 MediaRecorder가 슬라이스 전에 만들던 원본 단일 stream을 복원하는 가장 자연스러운 방법:

```python
with open(output_path, "wb") as out:
    for chunk in sorted_chunks:
        out.write(chunk.read_bytes())
```

검증 결과:
- 입력 28.2 MB → 출력 **28.2 MB (100% 보존)**
- 처리 시간 **0.33초** (CPU 거의 무료, 디스크 IO만)
- `ffprobe`: `codec_name=opus, sample_rate=48000, channels=2` → 유효한 audio stream
- mp3 변환: 40.2 MB / **duration 1756.32 sec ≈ 29분 16초** ← 회의 실제 길이
- libmp3lame이 streamable WebM 디코딩 정상 처리

---

## 4. 수정 명세

### 4.1 `merge_audio_chunks` 재구현 — raw binary concat

**파일:** `backend/services/audio_service.py:6-65`

```python
def merge_audio_chunks(chunks_dir: Path, output_path: Path) -> Path:
    """Reconstruct a single streamable WebM by raw byte concatenation.

    MediaRecorder produces one WebM stream sliced into chunks: only the first
    chunk has the EBML header. ffmpeg's concat demuxer (with or without
    re-encoding) cannot reassemble these because subsequent chunks are headerless
    Cluster bytes. Concatenating raw bytes restores what MediaRecorder would have
    produced without timeslicing — a valid streamable WebM.
    """
    chunk_files = sorted(chunks_dir.glob("chunk_*.webm"))

    if not chunk_files:
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
        # 부분 출력이 디스크에 남지 않도록 정리 후 재raise
        output_path.unlink(missing_ok=True)
        raise

    # raw concat은 항상 100% 매칭이어야 함
    if written != expected:
        output_path.unlink(missing_ok=True)
        raise RuntimeError(
            f"merge_audio_chunks copy mismatch (wrote {written}, expected {expected})"
        )

    return output_path
```

**제거되는 코드:**
- ffmpeg concat list 파일 생성 (`concat_list.txt`)
- `subprocess.run([ffmpeg, ...])`
- 기존 sanity check (`out_size < first_size`) — raw concat은 1:1 매칭이므로 더 강한 조건으로 대체

**이점:**
- ffmpeg subprocess 호출 0 → silent failure 원천 차단
- 0.3초 처리 (vs 30~60초 재인코딩)
- 메모리: 1 MB 버퍼 streaming → 회의 길이 무관

### 4.2 `_is_merged_audio_corrupted` 판정 단순화

**파일:** `backend/services/audio_service.py:77-93`

```python
def _is_merged_audio_corrupted(merged: Path, chunks: list[Path]) -> bool:
    """Detect any merged file that is meaningfully smaller than the sum of chunks.

    Raw concat must produce a file equal to the sum of chunk sizes. Anything
    significantly smaller (< 50% of total) indicates either the legacy `-c copy`
    bug, the libopus partial-output bug, or a future failure mode we haven't seen
    yet. Single-chunk recordings are exempt to avoid false positives.
    """
    if len(chunks) <= 1:
        return False
    total = sum(c.stat().st_size for c in chunks)
    return merged.stat().st_size < total * 0.5
```

**제거된 조건:** `merged_size < first_chunk_size * 1.2`
- 이전 80 KB 패턴 전용 조건이었음
- 새 raw concat은 1:1 매칭이라 first_chunk 비교는 무의미
- 단일 `total * 0.5` 조건이 80 KB·41 KB·향후 다른 partial 패턴 모두 잡음

### 4.3 (확인) `resolve_or_build_audio` 본문은 변경 없음

손상 자동 감지 → unlink → fallthrough → `merge_audio_chunks` 호출 흐름은 그대로 유지. `merge_audio_chunks`가 raise 시 partial 정리하므로 except 분기에서 추가 작업 불필요.

`history._resolve_meeting_audio`도 동일 — 변경 없음 (1차 fix에서 이미 손상 감지 분기 들어가 있음).

---

## 5. 영향 범위 — 사이드이펙트 종합

| 영역 | 변화 | 위험도 | 비고 |
|------|------|--------|------|
| 다운로드 webm (.webm) | 5초 → 전체 회의 | ✅ 본 fix 핵심 | 사용자 보고 증상 해결 |
| 다운로드 mp3 (.mp3) | 5초 → 전체 회의 (29분 검증) | ✅ | convert_to_mp3 변경 없음 |
| Whisper 입력 (4단계) | 첫 5초만 → 전체 회의 | ✅ 전사 품질 향상 | processing.py 변경 없음 |
| Whisper 처리 시간 | 30분 회의 ~5~8분 소요 | ⚠ 사용자 대기 (의도된 동작) | HANDOVER.md 7절 명시 |
| 다운로드 대역폭 | 80 KB → 28 MB (60분 ~55 MB) | ⚠ 약간 증가 | ngrok·무선 환경 무난 |
| 디스크 추가 사용 | merge 결과 = chunks 합 | ⚠ 작음 | 60분 ~55 MB |
| 손상 감지 false positive | 정상 raw concat은 1:1이라 항상 통과 | ✅ 없음 | |
| 손상 감지 false negative | 80 KB·41 KB·기타 partial 모두 잡힘 | ✅ 없음 | |
| Meeting.merged_audio_path 모델 | 그대로 사용 (자동 재생성) | ✅ | DB 마이그레이션 불필요 |
| audio.py (WebSocket chunk 저장) | 변경 없음 | ✅ | |
| convert_to_mp3 | 변경 없음 | ✅ | streamable WebM 정상 처리 |
| 30분+ race(`69948e7`) | 무관 | ✅ | 별개 결함 |
| 1차 fix 헬퍼·라우터 분기 | 그대로 유지 (판정 임계값만 변경) | ✅ | |

---

## 6. 검증 항목

### 6.1 본 fix 자체 검증

1. **신규 회의 (수정 후 첫 녹음)**
   - 5분 녹음 → 7단계 ☑ 녹음 파일 다운로드 + .webm → 미디어 플레이어 재생 시간 ≈ 5분, 파일 크기 ≥ 3 MB
   - 30분+ 실회의 → 다운로드 → 재생 시간 ≈ 회의 길이, 파일 크기 ≈ chunks 총합
   - .mp3 다운로드 → libmp3lame 정상 변환 (192kbps × N분)
2. **자동 복구 (기존 손상 세션)**
   - **`session_20260513_919435a7`** (1436 chunks, 117 MB, 80 KB merged) — 히스토리 [녹음 다운로드] 1회 클릭 → 자동 unlink → 즉석 raw concat (1초 미만) → 결과 webm 크기 ≈ 117 MB / 재생 시간 = 실제 회의 길이
   - **`session_20260507_6e5990a1`** (349 chunks, 28 MB, 41 KB merged) — 동일 흐름으로 약 29분 회의 복구
3. **POST 404 재현 안 됨**
   - 사용자 보고 시나리오 그대로(새 회의 → 녹음 → 7단계 송신) 재현 → POST 200 + Content-Disposition 정상

### 6.2 회귀 — false positive 미발생

4. chunks 1개만 있는 짧은 정상 세션 → 손상 감지 미트리거 (`len(chunks) <= 1` 조기 반환)
5. upload 모드 (`uploaded.webm`) → chunks 디렉토리에 chunk_*.webm 없음 → 손상 감지 분기 무관, 정상 export

### 6.3 부수 검증

6. **partial 파일 잔여 0** — 어떤 실패 케이스에서도 디스크에 partial output이 남지 않음 (raise 전 unlink)
7. **stderr 깨끗** — ffmpeg subprocess 호출이 사라졌으므로 silent failure 출처 원천 차단
8. **4단계 Whisper 입력** — 신규 녹음에서 merged_audio.webm = chunks 합 확인. Whisper 처리 시간이 5분 이상 걸리는지 (전체 회의 처리 증거)

---

## 7. 알려진 한계 — 별도 QA-FIX-3 제안

### 한계: 재개·복구 세션 (한 세션에서 두 번 녹음)

**시나리오:** 녹음 중 마이크 끊김 / 사용자 일시 중지 / WebSocket 재연결 후 같은 세션에서 이어 녹음.

**구조 분석:** `audio.py:81` — `chunk_index = session.audio_chunk_count`로 이어쓰기. 같은 chunks/ 디렉토리에 두 묶음이 함께 저장됨:
- 첫 묶음(chunk_000~099): 첫 MediaRecorder 인스턴스의 EBML 헤더 + Cluster들
- 두 묶음(chunk_100~149): 두 번째 인스턴스의 **새 EBML 헤더** + Cluster들

raw concat 시 두 EBML 헤더가 단일 stream 안에 섞이므로 미디어 플레이어가 두 번째 EBML 위치에서 디코딩을 멈출 수 있음 → **재개된 후반부 녹음이 손실될 가능성**.

**해결 방향 후보 (본 fix 범위 밖):**
- (a) `audio.py`를 단일 파일 append 모드로 전환 + resume 시 새 MediaRecorder 인스턴스가 만든 헤더를 서버에서 제거 후 append
- (b) resume 시 새 sub-디렉토리 만들기 + merge_audio_chunks가 두 묶음을 처리하는 별도 분기
- (c) resume을 비활성화하고 재개 시 새 세션 강제

**우선순위:** 🟡 Medium — 일반 단일 녹음 시나리오에서는 무영향. 사용자가 마이크 끊김·재연결을 자주 겪는다면 우선순위 상향.

**조치:** 본 fix 적용 후 검수 세션이 별도 QA-FIX-3 작성 예정.

---

## 8. 권장 작업 순서

1. **4.1 적용** (raw binary concat) — 가장 핵심
2. **4.2 적용** (손상 감지 단순화)
3. **신규 5분 녹음** → 정상 다운로드 검증
4. **신규 30분+ 녹음** → 다운로드 + 재생 길이 = 회의 길이 검증
5. **`session_20260513_919435a7` 손상 복구 검증** (가장 큰 케이스로 raw concat 안정성 입증)
6. **DEV-REPORT-20260514.md에 추가 절 작성** ("QA-AUDIO-MERGE-LOSS-2 반영" — 1차 fix와 본 fix가 결합되어야 완성됨을 명시)
7. **커밋 분리 권장**: 1차 fix와 본 fix를 한 커밋으로 묶지 말고 별도 커밋. 1차 fix 단독으로는 동작 안 함이 확정되었으므로 squash해도 무방 — 커밋 메시지에 본 진단 경위 명시 권장.

---

## 9. 우선순위

🔴 **Critical** — 사용자가 직접 보고한 운영 차단 이슈. 1차 fix가 부분만 동작하여 현재 새 회의에서도 다운로드가 작동하지 않음. 즉시 반영 필요.

---

## 10. 검수 교훈 (다음 검수 세션 참고용)

- **silent failure는 exit code 외에 출력 결과 자체로도 검증**: 이번 결함은 ffmpeg exit 0 + 41 KB partial output. exit code만 봐서는 잡히지 않음.
- **MediaRecorder + ffmpeg 조합 일반론**: streamable WebM 청크는 ffmpeg concat demuxer로 처리 불가. raw bytes 조립이 표준 패턴.
- **수정 검증 시 입력·출력 데이터 크기 비교를 1차 척도로**: 출력이 입력 합과 비슷한가? 첫 입력과 비슷한가? → 한눈에 결함 판정 가능. 이번 검수에서는 PowerShell로 6개 세션의 chunks 합과 merged 크기를 한 번에 비교한 것이 결정타.
- **검수가 직접 명령 재현 가능한 진단 환경의 가치**: 가설을 ffmpeg subprocess로 직접 돌려서 검증 → 추측이 아니라 사실 기반 진단.
