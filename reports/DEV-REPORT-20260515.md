# 개발 업무 보고서 — 2026-05-15

> 작성 주체: 개발 세션
> 대상 기간: 2026-06-01 (실제 작업일, PLAN-DEV-HANDOFF-20260515 반영 세션)
> 이전 보고서: `reports/DEV-REPORT-20260529.md` (05-29 cloudflared 반영 세션)
> 관련 기획: `reports/PLAN-DEV-HANDOFF-20260515.md`

---

## 0. 30초 요약

- PLAN-DEV-HANDOFF-20260515 (한 세션 다중 녹음 통합 단일 파일, 저장구조 1-C + 병합 2-A) working tree 반영 완료
- 변경 파일 1개: `backend/services/audio_service.py` 단독 — 호출처(processing/history/sessions/slack) 무변경
- in-memory 검증 6종 모두 통과 (회귀 무손 + multi-segment 신규 + R6′ 함정 + 보너스 복구)
- **R3 timestamp offset은 PM 승인 후 건너뜀** — 현 useTimer 구조상 web_speech 블록이 이미 audio-active 연속 시간으로 기록돼 offset 가산이 오히려 회귀 유발
- 실회의 실증(PM)만 남음 — 녹음→일시중단→재개→추가녹음→7단계 다운로드

---

## 1. 오늘 수행한 작업 요약

| 카테고리 | 건수 | 요약 |
|---------|------|------|
| 사전조사 | 4 | audio_service / merger / Session 모델 / useTimer·Recording.tsx 흐름 |
| 기획 차이 보고 | 1 | R3 명세와 현 코드 충돌 발견 → PM 승인 후 옵션 A (건너뛰기) |
| 신규 함수 구현 | 3 | `_segment_boundaries`, `_ffprobe_duration`, `_raw_concat`, `_concat_segments` |
| 기존 함수 분기 | 2 | `merge_audio_chunks` 단일/멀티 분기, `_is_merged_audio_corrupted` R6′ hybrid |
| 검증 (in-memory) | 6 | 회귀 무손 3 + multi-segment 신규 2 + 보너스 복구 1 |

---

## 2. 변경된 파일 목록

| 파일 | 변경 유형 | 상세 |
|------|---------|------|
| `backend/services/audio_service.py` | 수정 (구조 확장) | EBML 검출 + 단일/멀티 분기 + R6′ hybrid + R4 출력 검증. 시그니처·호출처 전부 무변경 |
| `reports/DEV-REPORT-20260515.md` | 신규 | 본 보고서 |

호출처 무변경 확인:
- `backend/routers/processing.py:88-90` — `merge_audio_chunks(chunks_dir, merged_output)` 호출만, 시그니처·반환 동일
- `backend/routers/sessions.py`, `backend/routers/history.py` — `resolve_or_build_audio` 경유, 모두 동일

---

## 3. 주요 기술 결정

### 3-1. R3 timestamp offset 건너뜀 (PM 승인)

**기획 명세 (§4.4)**: segment N의 모든 블록·Whisper 세그먼트 timestamp에 `offset_N = Σ_{k<N} (segment_k 재생길이 + recording_gaps[k].gap_seconds)` 가산

**현 코드 사실**:
- `frontend/src/hooks/useTimer.ts:25-27` — `stop()`은 rAF만 멈추고 `startTimeRef` 보존
- `useTimer.ts:16-21` — resume `start()`은 `startTimeRef = Date.now() - elapsed * 1000`으로 보정하여 누적 시간 이어감
- 결과: `getElapsedSeconds()`는 **gap을 제외한 audio-active 연속 시간** 반환 → web_speech 블록의 `timestamp_start/end`가 이미 누적 시간
- ffmpeg concat **filter** 결과의 Whisper 출력도 동일하게 audio-active 연속 시간 (filter가 gap 제거하고 재인코딩)
- → **양쪽 이미 같은 타임라인. offset 가산하면 segment 2 블록만 미래로 이동, §6.2 #4 검증 오히려 깨짐**

**결정**: 옵션 A (PM 승인). R3 구현 안 함. §4.1·4.2·4.3·4.5만 반영.

### 3-2. R6′ hybrid 분기 (plan 대안보다 강화)

**기획 명세 (§4.3 본문)**: `merged duration < expected_total * 0.8`로 손상 판정. 단 expected_total 계산이 비싸면 "merged duration > 0"만으로 완화 가능.

**문제**: 완화안 "duration > 0"으로는 PLAN §5의 보너스 복구 케이스인 `session_20260511_823c8751`을 잡지 못함. 이 세션의 legacy raw-concat 잔재는 80KB짜리이지만 첫 EBML 헤더는 정상이라 ffprobe가 **4.97초 정상 duration 반환** → 손상 미감지 → 보너스 복구 불발

**채택 방식 (hybrid)**:
```python
if _ffprobe_duration(merged) <= 0:
    return True
total = sum(c.stat().st_size for c in chunks)
return merged.stat().st_size < total * 0.1
```
- ffprobe duration > 0 (cheap 1차 sanity)
- AND merged_size ≥ chunk total의 10% (legacy 80KB-from-24MB 패턴 = 0.33% 탐지)
- 무한 루프 차단: 새로 생성된 concat filter 결과는 보통 청크 총합의 50%+이라 10% 임계는 충분히 여유

**검증**: session_20260511_823c8751 fresh concat filter 결과 = 17.4MB / 24.4MB = 71.5% → corrupted=False (재병합 없음, 함정 차단). 같은 세션 legacy 80KB = 0.33% → corrupted=True (탐지 성공).

### 3-3. `_concat_segments` 임시 작업 디렉토리

`tempfile.TemporaryDirectory(prefix="audio_seg_")`로 OS temp에 격리. 함수 종료 시 자동 정리 (예외 포함). 세션 디렉토리에 잔여물 0 보장.

### 3-4. R4 ffmpeg 출력 검증 강제

`_concat_segments`는 exit 0만으로 신뢰하지 않음 — libopus silent failure 전례 때문:
1. ffprobe duration > 0 (필수)
2. duration ≥ expected_total * 0.8 (segment별 ffprobe 합 기준)
3. 둘 중 하나라도 미달 시 partial 즉시 unlink + RuntimeError

`expected_total` 계산은 임시 seg_*.webm에 이미 만들어둔 자기완결 valid WebM에 대한 ffprobe 합으로 비용 적음.

---

## 4. 검증 결과

### 4-1. 회귀 — 단일 녹음 무손 (§6.1, 최우선)

raw concat 경로는 코드 변화 0이라 byte-identical 검증:

| 세션 | chunks | 크기 | 처리 시간 | byte 매칭 |
|------|--------|------|----------|---------|
| `session_20260513_919435a7` | 1436 | 117MB | 1.96s | ✅ 1:1 |
| `session_20260508_b41eeadc` | 1292 | 105MB | 1.74s | ✅ 1:1 |
| `session_20260520_581cfbf8` | 1256 | 101MB | 1.62s | ✅ 1:1 |

→ QA-AUDIO-MERGE-LOSS-20260514-2 결과 보존. 단일 녹음 경로 동작·성능 변화 0.

### 4-2. multi-segment 신규 동작 (§6.2)

| 세션 | chunks | segments | 입력 크기 | 출력 크기 | 처리 시간 | ffprobe duration |
|------|--------|---------|---------|---------|----------|----------------|
| `session_20260423_4286be01` | 57 | 2 (`[0,13]`) | 4.5MB | 2.6MB | 2.3s | 4분 40초 |
| `session_20260511_823c8751` | 302 | 2 (`[0,34]`) | 24.4MB | 17.4MB | 14.9s | **25분 12초** |

두 세션 모두 PLAN §5 표의 추정(~5분 / ~25분)과 일치. 처리 시간 합리적.

### 4-3. R6′ 함정 검증 (§6.3)

| 케이스 | 기대 | 결과 |
|--------|------|------|
| #8 multi-segment 정상본(fresh concat filter)을 손상으로 오판하는가 | False | False ✓ (무한 루프 차단) |
| legacy 80KB multi-segment 잔재 (session_20260511) | True | True ✓ |
| legacy 41KB single-segment 잔재 (session_20260507_6e5990a1) | True | True ✓ (기존 동작 유지) |
| 단일 청크 / 빈 청크 리스트 | False | False ✓ (false positive 0) |

### 4-4. 보너스 복구 (§6.4 #11)

`session_20260511_823c8751`:
- 기존: merged_audio.webm = 80KB (구 raw concat 잔재, 첫 EBML만 재생 가능, 실제 25분 회의가 5초만 재생)
- 신규 동작: 자동 corruption 감지 → unlink → `_concat_segments`로 자동 통합 → 17.4MB / 25분 12초 결과
- 사용자 직접 [녹음 다운로드] 클릭으로 실증 가능 (1회 자동 복구)

### 4-5. 실회의 실증 (남은 작업, PM)

§6.2 #4 — **녹음 시작 → ~3분 → 일시중단 → 잠시 후 재개 → 추가 ~3분 → 7단계 .webm 다운로드**
- 기대: 재생 길이 ≈ 6분, 끊김 지점 후반부 끝까지 재생, 5단계/히스토리에서 두 번째 녹음분 블록이 첫 녹음분 뒤에 시간순 정렬 (R3 미적용이라도 useTimer 누적 시간으로 자동 보장)
- 기대: 같은 회의 재다운로드 시 캐시 사용, 재병합 미발생

§6.2 #5 — 4의 .mp3 다운로드 전체 길이 정상
§6.2 #6 — 3회 이상 재개 케이스 (segments=3+) concat 정상
§6.4 #11 — `session_20260511_823c8751` 히스토리 [녹음 다운로드] → 25분 자동 복구 (보너스, 필수 아님)

---

## 5. 전달 사항

### 개발→기획

R3 명세 (§4.4)와 현 코드 충돌 보고 + 옵션 A (건너뛰기) 채택 결과 공유 필요. 향후 기획 세션이 R3 관련 후속 명세 작성 시 다음 사실 반영:
- `useTimer`는 pause 동안 멈추고 resume 시 누적 시간 이어감 → web_speech 블록은 audio-active 연속 시간
- ffmpeg concat filter도 gap 제거하므로 Whisper 출력 동일 타임라인
- `recording_gaps`는 UI에 ⏸ 표시용으로만 사용 (Recording.tsx:680). 블록 timestamp 보정 불필요

### 개발→검수

검수 시 중점 (PLAN-DEV-HANDOFF-20260515 §6 기준):
1. `_segment_boundaries` 우연 일치 우려는 34개 세션 스캔 0건 + WebM 표준상 단일 stream 내 1A45DFA3 재등장 불가로 안전 (`_concat_segments` 임시 출력 격리·정리도 확인)
2. **R6′ hybrid 분기 보너스**: plan의 "duration > 0" 완화안 대신 `duration > 0 AND size ≥ total*0.1`로 강화 — 검증 결과 정상본/legacy 모두 올바르게 분기됨
3. **R3 건너뛰기 근거**: useTimer + concat filter 조합으로 자연 정렬. §6.2 #4의 두 번째 녹음분 블록 정렬이 실제로 회귀 없는지 실회의 검증 필요
4. R4 silent failure 차단 동작 — `_concat_segments`가 ffmpeg 실패 시 partial unlink + RuntimeError

---

## 6. 다음 세션에서 확인할 것

### 즉시
- PM 실회의 실증 결과 수신 (§6.2 #4 multi-segment 신규 동작)
- 결과에 따라 커밋 + push (단독 커밋 권장, plan §8 #7)

### 후속
- 추후 커밋 메시지 권장:
  ```
  다중 녹음 통합 단일 파일 — segment 분기 + concat filter (PLAN-DEV-HANDOFF-20260515)
  ```
- 검수 세션 진행 (multi-segment 신규 시나리오 중점, R6′ 무한 루프 미발생 + R3 미적용 회귀 없음)
- 다음 PM 사용 패턴 모니터링 — multi-segment 실사용 빈도 / 처리 시간 만족도

---

## 7. 참고 정보

### 변경 함수 시그니처 (전부 무변경)
```python
def merge_audio_chunks(chunks_dir: Path, output_path: Path) -> Path
def _is_merged_audio_corrupted(merged: Path, chunks: list[Path]) -> bool
def resolve_or_build_audio(session_dir: Path) -> Optional[Path]
def get_uploaded_audio(chunks_dir: Path) -> Optional[Path]
def convert_to_mp3(src: Path, dst: Path) -> Path
```

### 신규 함수 (모두 모듈 private)
```python
EBML_MAGIC = b"\x1a\x45\xdf\xa3"
def _segment_boundaries(chunk_files: list[Path]) -> list[int]
def _ffprobe_duration(path: Path) -> float
def _raw_concat(chunk_files: list[Path], output_path: Path) -> Path
def _concat_segments(chunk_files, starts, output_path) -> Path
```

### Working tree 상태 (커밋 대기)
```
M  backend/services/audio_service.py
?? reports/DEV-REPORT-20260515.md
```
