# 기획→개발 핸드오프 — 한 세션 다중 녹음 통합 단일 파일 (저장구조 1-C + 병합 2-A)

> 작성일: 2026-05-15
> 작성 주체: 기획 세션
> 심각도: 🔴 **High** — resume(한 세션 두 번 녹음)이 사용자 실사용에서 **자주 발생**. 현재 다운로드 시 후반부 손실 가능
> 관련 문서: `decisions.md` 7단계 "녹음 파일 — 다중 녹음 통합 단일 파일", `technical-design.md` 4-5절 오디오 병합, `QA-FIX/QA-AUDIO-MERGE-LOSS-20260514-2.md` 7절(알려진 한계)
> 선행 의존: 이 핸드오프는 QA-AUDIO-MERGE-LOSS-20260514-2(raw concat 전면 교체)가 **working tree에 이미 반영된 상태**를 전제로 한다. 그 fix와 충돌하지 않고 그 위에 multi-segment 분기를 얹는다.

---

## 개발 세션 전달 지시사항 (복붙용)

```
PLAN-DEV-HANDOFF-20260515.md 읽고 반영 부탁해.
한 회의를 진행하며 사용자가 일시중단했다가 다시 이어 녹음하면(자주 발생), 현재는 다운로드한
녹음 파일의 후반부가 손실될 수 있어. 기획 결정: 다운로드를 누른 시점에 전체를 통합한
단일 파일(.webm/.mp3)을 내려준다. 미리 합쳐두지는 않음(lazy).

핵심 설계 (기획 확정):
- 저장구조 1-C: 청크는 종전대로 평탄 구조(chunks/chunk_*.webm). audio.py 청크 저장 로직 변경 금지.
  segment 경계는 청크 첫 4바이트 EBML 시그니처(1A45DFA3)가 진실의 원천.
- 병합 2-A: 단일 segment면 기존 raw concat 그대로(검증 경로 무손). 2개+면 segment별 raw concat
  → 각 valid webm → ffmpeg concat FILTER(재인코딩)로 단일 webm. mp3는 그 결과 변환.
- R6′ 손상판정: multi-segment는 크기 비교 폐기, ffprobe duration 기준으로 분기 (무한 재병합 루프 방지).
- R3 timestamp: 2번째+ segment 블록·Whisper에 offset 가산(recording_gaps 활용) 후 merge_blocks.

검증 필수: 단일 녹음 회귀 무손 + multi-segment 신규(녹음→일시중단→재개→추가녹음)→다운로드
재생 길이 = 두 녹음 합. 기존 2건(아래 5절)은 보너스 복구 — 자동으로 되면 좋고 필수 아님.

세션 종료 시 reports/DEV-REPORT-20260515.md 작성 부탁해.
```

---

## 1. 배경 — 무엇이 왜 문제인가

`MediaRecorder.start(timeslice)`는 단일 streamable WebM을 잘라낸 조각을 만든다. 첫 청크에만 EBML 헤더가 있고 이후는 헤더 없는 Cluster bytes다. 그런데 사용자가 **녹음 도중 일시중단했다가 재개**하면 클라이언트가 **새 MediaRecorder 인스턴스**를 만들고, 그 인스턴스의 첫 청크는 **또 하나의 EBML 헤더**로 시작한다.

현재 `merge_audio_chunks`(raw byte concat, QA-AUDIO-2 fix 반영본)는 모든 청크를 그대로 이어 붙인다. 단일 녹음에서는 완벽하지만, 두 EBML 헤더가 한 스트림에 섞이면 플레이어가 두 번째 EBML 지점에서 디코딩을 멈출 수 있어 **재개된 후반부가 손실**된다.

검수 세션이 `QA-AUDIO-MERGE-LOSS-20260514-2.md` 7절에서 이 한계를 별도 항목으로 분리해 두었고, PM이 "resume은 자주 발생"으로 우선순위를 올리며 기획 결정을 내렸다.

## 2. 기획 결정 (확정)

| 항목 | 결정 | 사유 |
|------|------|------|
| 사용자 가시 동작 | 녹음 횟수와 무관하게 다운로드 결과물은 **시간 순 단일 파일** 1개 | 사용자는 녹음이 몇 번 끊겼는지 알 필요 없음. zip·조각 제공 안 함 |
| 합치는 시점 | 다운로드를 **실제 누른 시점** lazy 통합, 이후 캐시 | "미리 합쳐둘 필요 없다"(PM). 단일 녹음 경로 성능 무손 |
| 저장 구조 | **1-C**: 평탄 구조 유지 + EBML 시그니처로 segment 자동 분할 | `audio.py` 무변경 → 디렉토리 분기 영속(R1) 없음. 클라 신호 의존(R2) 없음 — 바이너리가 진실 |
| 병합 방법 | **2-A**: segment별 raw concat → ffmpeg concat **filter**(재인코딩) | concat **demuxer**는 EBML 경계 못 넘음(1차 fix에서 실증된 silent failure). filter는 디코딩 후 재인코딩이라 안전 |
| 기존 손상 데이터 | 명세는 신규 동작 중심. 기존 다중녹음 회의는 **보너스 복구**(필수 검증 아님) | PM 결정 "신규만 명시, 기존은 보너스" |

> **왜 1-A(sub-디렉토리)가 아니라 1-C인가**: 스캔 결과 EBML 시그니처(`1A45DFA3`)로 평탄 구조에서도 segment 경계가 노이즈 0으로 정확히 검출됨을 34개 세션으로 실증. 1-C는 `audio.py` 무변경 + 클라이언트 신호 불필요 + 기존 데이터 같은 코드로 복구라는 점에서 1-A 대비 리스크가 저장 구조 → 병합 로직으로 이동하며 줄어듦. 단 "더 쉽다"가 아니라 R6′·R3·R4를 명세대로 정밀 처리해야 한다는 조건부.

## 3. 현재 코드 상태 (수정 대상)

| 파일/함수 | 현재 | 변경 |
|-----------|------|------|
| `backend/routers/audio.py` (청크 저장) | `chunk_index = session.audio_chunk_count`로 평탄 이어쓰기 | **변경 없음** (1-C 핵심) |
| `backend/services/audio_service.py:merge_audio_chunks` | 전체 청크 raw byte concat (단일 stream 가정) | segment 경계 검출 → 단일/멀티 분기 추가 |
| `backend/services/audio_service.py:_is_merged_audio_corrupted` | `merged < total*0.5` 단일 조건 | segment 개수로 분기 (R6′) |
| `backend/services/audio_service.py:resolve_or_build_audio` | 손상감지 → unlink → merge 재호출 | 흐름 유지, multi-segment 손상판정만 분기 위임 |
| `backend/routers/history.py:_resolve_meeting_audio` | 동일 손상 감지 분기 | 동일 — `_is_merged_audio_corrupted` 분기에 위임 |
| `backend/routers/processing.py:87` | `merge_audio_chunks(chunks_dir, merged_output)` 호출 | 호출부 무변경(시그니처 유지). 내부가 multi-segment 자동 처리 |
| merger / 블록 timestamp | segment offset 미적용 | R3 offset 가산 |

> 호출처(`processing.py`·`sessions.py`·`history.py`)는 `merge_audio_chunks` **시그니처·반환을 그대로 유지**하면 무변경. 모든 분기는 함수 내부로 캡슐화.

## 4. 수정 명세

### 4.1 segment 경계 검출 (신규 헬퍼)

```python
EBML_MAGIC = b"\x1a\x45\xdf\xa3"

def _segment_boundaries(chunk_files: list[Path]) -> list[int]:
    """첫 4바이트가 EBML 헤더인 청크 인덱스 = 각 녹음 segment 시작점."""
    starts = []
    for i, f in enumerate(chunk_files):
        with open(f, "rb") as fh:
            if fh.read(4) == EBML_MAGIC:
                starts.append(i)
    return starts or [0]   # chunk_000이 비정상이면 전체를 1 segment로 폴백
```

- 우연 일치 우려: 4바이트 특정 시퀀스라 확률상 무시 가능. 34개 세션 스캔에서 노이즈 0 실증. 같은 MediaRecorder 인스턴스 내 `1A45DFA3` 재등장은 WebM 표준상 불가(Cluster=`1F43B675`).

### 4.2 `merge_audio_chunks` 분기

```python
def merge_audio_chunks(chunks_dir: Path, output_path: Path) -> Path:
    chunk_files = sorted(chunks_dir.glob("chunk_*.webm"))
    # 없음 / 단일 청크 / uploaded.* 폴백: 기존 로직 그대로 유지
    if not chunk_files:
        uploaded = list(chunks_dir.glob("uploaded.*"))
        if uploaded: return uploaded[0]
        raise FileNotFoundError(...)
    if len(chunk_files) == 1:
        return chunk_files[0]

    starts = _segment_boundaries(chunk_files)
    if len(starts) <= 1:
        return _raw_concat(chunk_files, output_path)            # 기존 검증 경로 (1MB 버퍼, 1:1 매칭 강제)
    return _concat_segments(chunk_files, starts, output_path)   # multi-segment
```

- `_raw_concat`: 현재 `merge_audio_chunks` 본문(1MB streaming + `written==expected` + 실패 시 partial unlink)을 그대로 추출. **단일 녹음 경로는 동작·성능 변화 0이어야 함.**
- `_concat_segments`:
  1. `starts`로 청크를 segment별 그룹화. 각 그룹을 `_raw_concat`으로 임시 `seg_{k}.webm` 생성(각각 자기완결 valid WebM).
  2. ffmpeg concat **filter**로 결합:
     ```
     ffmpeg -y -i seg_0.webm -i seg_1.webm [...-i seg_{N-1}.webm]
       -filter_complex "[0:a][1:a]...[{N-1}:a]concat=n=N:v=0:a=1[out]"
       -map "[out]" -c:a libopus output_path
     ```
  3. `subprocess.run(..., check=True, capture_output=True)` 후 **출력 검증**(4.3) 통과해야 성공. 실패/예외 시 `output_path` + 임시 `seg_*` 모두 unlink 후 raise.
  4. 성공 시 임시 `seg_*.webm` 정리.

### 4.3 손상 자동 감지 — R6′ (경로별 분기, 무한 루프 방지)

```python
def _is_merged_audio_corrupted(merged: Path, chunks: list[Path]) -> bool:
    if len(chunks) <= 1:
        return False
    starts = _segment_boundaries(chunks)
    if len(starts) <= 1:
        # 단일 segment: 기존 로직 유지 (raw concat은 1:1 → 정상본 항상 통과)
        return merged.stat().st_size < sum(c.stat().st_size for c in chunks) * 0.5
    # multi-segment: 크기 비교 폐기. ffprobe duration 기준.
    dur = _ffprobe_duration(merged)                       # 실패/0이면 손상
    if dur <= 0:
        return True
    expected = _expected_total_duration(chunks, starts)   # segment별 ffprobe 합
    return dur < expected * 0.8
```

- **핵심 함정**: multi-segment 정상본은 재인코딩 결과라 크기가 청크 총합과 1:1이 아님. 기존 `< total*0.5`를 그대로 쓰면 정상본을 손상으로 오판 → 매 다운로드마다 재병합 → **무한 루프 + 사용자 대기 폭증**. 반드시 segment 개수로 분기.
- `_ffprobe_duration`: `ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1`. 호출 실패는 "손상"으로 간주(보수적).
- `_expected_total_duration`: 각 segment의 임시 raw concat duration 합 — 비용이 크면, 대안으로 "merged duration > 0 && ffprobe가 valid audio stream 반환"만으로 완화 가능(개발 판단, 단 무한 루프만은 절대 금지).

### 4.4 시간축 정합 — R3 (segment offset)

- `session.recording_gaps[i]` = `{after_block_id, gap_seconds}` (이미 기록됨, `audio.py:_record_resume`).
- segment N(0-기반)의 모든 블록·Whisper 세그먼트 timestamp에 가산할 offset:
  `offset_N = Σ_{k<N} ( segment_k 재생길이 + recording_gaps[k].gap_seconds )`
- `after_block_id`로 segment 경계 블록을 식별 → 그 블록 이후 블록들이 다음 segment.
- `merge_blocks`(technical-design 5절)는 **offset이 이미 적용된 통합 타임라인**에서 매칭. Whisper는 segment별 audio 0 기준으로 나오므로 동일 offset 가산 후 병합.
- 미적용 시 증상: 5단계 편집/히스토리에서 두 번째 녹음분 블록이 첫 녹음분과 시간이 겹쳐 순서가 뒤섞임 — 사용자 즉시 인지하는 회귀.

### 4.5 ffmpeg silent failure 차단 — R4

- 1차 fix(libopus)에서 ffmpeg가 exit 0 + 41KB partial을 낸 전례. concat **filter**는 valid WebM 입력이라 안전할 것으로 예측되나 **미검증 — 반드시 출력 검증**:
  - exit code만 믿지 말 것. `_concat_segments` 후 ffprobe duration > 0 그리고 segment 합의 80%+ 확인. 실패 시 raise + partial unlink.
- stderr를 로깅(WARNING)으로 남겨 향후 silent failure 추적 가능하게 (QA-FIX-2 10절 검수 교훈).

## 5. 기존 손상 데이터 — 보너스 복구 (필수 검증 아님)

스캔 결과 다중 녹음 이력(`recording_gaps` 비어있지 않음 + EBML 2개) 세션 **2건** 존재:

| 세션 | 회의 | chunks | EBML 경계 | 현재 merged | 1-C 적용 후 기대 |
|------|------|--------|----------|------------|-----------------|
| `session_20260511_823c8751` | "260000 전략 회의 메모" (05-11, ~25분) | 302 | `[0, 34]` (seg2가 회의 본체) | 80K (손상) | 다운로드 시 자동 통합 복구 — 가장 좋은 검증 케이스 |
| `session_20260423_4286be01` | "260423(수) 데이터 분석 회의" (04-23, ~5분) | 57 | `[0, 13]` | 없음 | 다운로드 시 자동 통합 |

- 1-C는 평탄 구조 + EBML 검출이라 **기존 2건도 별도 코드 없이 같은 경로로 복구**된다(보너스). `resolve_or_build_audio`/`_resolve_meeting_audio`의 손상 감지가 80K merged를 잡아 unlink → multi-segment 재병합.
- 단 PM 결정상 **필수 검증 항목은 아님**. 동작하면 검증 케이스로 활용하되, 안 되더라도 신규 동작이 정상이면 본 핸드오프는 완료로 본다.

## 6. 검증 시나리오

### 6.1 회귀 — 단일 녹음 무손 (최우선, 반드시 통과)
1. 5분 단일 녹음 → 7단계 .webm 다운로드 → 재생 ≈ 5분, 크기 ≈ 청크 총합 (raw concat 1:1)
2. 30분+ 단일 녹음 → 동일. **단일 segment 경로가 종전과 byte-identical인지** 확인
3. 기존 정상 세션 .mp3 다운로드 → libmp3lame 정상

### 6.2 multi-segment 신규 (핵심, 필수)
4. 녹음 시작 → ~3분 → **일시중단** → 잠시 후 **재개** → 추가 ~3분 → 7단계 .webm 다운로드
   - 재생 길이 ≈ 6분(+gap), 끊김 지점 이후 후반부가 **끝까지 재생**되는지
   - 5단계/히스토리에서 두 번째 녹음분 블록이 첫 녹음분 **뒤에** 시간순 정렬 (R3)
5. 4의 .mp3 다운로드 → 전체 길이 정상
6. 3회 이상 재개한 케이스 → segment 3개+ concat 정상
7. **같은 회의 재다운로드** → 캐시 사용(빠름), 재병합 안 일어남(R6′ 무한 루프 미발생 확인 — 로그/처리시간으로)

### 6.3 R6′ / R4 (함정 검증)
8. multi-segment 정상 merged가 손상으로 **오판되지 않는지** (재다운로드 시 재병합 로그 없음)
9. `_concat_segments` 실패를 인위 유발(예: ffmpeg 미존재 모킹) → partial·seg_* 디스크 잔여 0, 명확한 에러
10. ffmpeg exit 0인데 출력이 짧은 케이스 → ffprobe 검증이 잡아 raise

### 6.4 보너스 (선택)
11. `session_20260511_823c8751` 히스토리 [녹음 다운로드] → 첫 클릭 자동 통합 → 재생 ≈ 25분

## 7. 영향 범위

| 영역 | 변화 | 위험 |
|------|------|------|
| 단일 녹음 다운로드/Whisper | 변화 없음 (별도 분기) | ✅ 회귀 검증 6.1 필수 |
| multi-segment 다운로드 | 손실 → 통합 단일 파일 | ✅ 본 fix 핵심 |
| `audio.py` 청크 저장 | 변경 없음 | ✅ 1-C 핵심 |
| Whisper 입력(4단계) | multi-segment 시 전체 회의 입력 + 처리시간 증가 | ⚠ 의도된 동작, 첫 다운로드 대기 UX 표시 |
| 디스크 | multi-segment 시 임시 seg_* (정리됨) + merged 캐시 | ⚠ 작음, 정리 보장 |
| `_is_merged_audio_corrupted` 호출처 2곳 | 분기 위임 | ✅ 시그니처 무변경 |
| merger/timestamp | R3 offset 가산 | ⚠ 회귀 위험 — 6.2 #4 필수 |

## 8. 권장 작업 순서

1. 4.1 `_segment_boundaries` + 4.2 `_raw_concat` 추출(현 본문 그대로) → **6.1 회귀부터** (단일 경로 무손 확인)
2. 4.2 `_concat_segments` → 6.2 #4 (가장 중요한 신규 케이스)
3. 4.3 R6′ 분기 → 6.3 #7·#8 (무한 루프 함정 차단 확인)
4. 4.4 R3 offset → 6.2 #4의 블록 순서 재확인
5. 4.5 출력 검증·stderr 로깅 → 6.3 #9·#10
6. (선택) 6.4 보너스 — `session_20260511_823c8751`
7. `reports/DEV-REPORT-20260515.md` 작성. 단일 경로 무손 + multi-segment 동작 + R6′ 무한루프 미발생을 명시. 커밋은 QA-AUDIO-2 working tree 분과 어떻게 묶을지 개발 판단(별도 커밋 권장 — 본 건은 신규 동작이라 진단 경위가 다름).

## 9. 우선순위

🔴 **High** — resume이 사용자 실사용에서 자주 발생(PM 확인). 현재 다중 녹음 회의의 후반부가 다운로드 시 손실될 수 있어 핵심 자료 무결성에 직접 영향. QA-AUDIO-2(단일 녹음 무결성)에 이어 다중 녹음까지 메워야 "녹음 파일 보존"이 완결됨.

## 10. 비변경 항목 (명시)

- `audio.py` 청크 저장 로직 — 변경 금지 (1-C 전제)
- `merge_audio_chunks` 시그니처·반환 — 유지 (호출처 무영향)
- `Meeting.merged_audio_path` 모델 — 유지 (자동 재생성)
- upload 모드(`uploaded.*`) — segment 개념 무관, 기존 폴백 그대로
- 단일 녹음 raw concat 경로 — 동작·성능 변화 0 (검증된 QA-AUDIO-2 결과 보존)
