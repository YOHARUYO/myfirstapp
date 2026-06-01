# 개발 세션 인수인계 — 2026-05-15

> 작성 주체: 직전 개발 세션 (05-14 종료 직후 / 05-15 새 세션 시작용)
> 목적: 다음 개발 세션이 첫 5분에 상황을 파악하고 바로 이어 작업할 수 있도록 정리
> 참조: `HANDOVER.md` 8절, `reports/DEV-REPORT-20260514.md` (상세), `QA-FIX/QA-AUDIO-MERGE-LOSS-20260514-2.md` (Critical 명세)

---

## 0. 30초 요약

- 05-14 단일 세션에서 **핸드오프 3건 + 회귀 1건 + Critical 1건** 모두 working tree 반영 완료
- HEAD = `73109e9` (push 완료) / **작업트리에 10 modified + 6 untracked (모두 05-14 산출물, 커밋 대기)**
- **운영 차단 1건(녹음 99.93% 손실)은 코드 fix 완료, 사용자 실증 검증만 남음**
- 다음 액션: ① 사용자 실증 검증 → ② 권장 분할 커밋 → ③ resume 한계(QA-FIX-3) 의사 결정 대기

---

## 1. 첫 행동 (순서대로)

### Step 1. dev server 상태 확인
- 백엔드는 **재기동 필수** (Pydantic 모델·라우터 시그니처·`merge_audio_chunks` 본문 변경 포함)
- 프론트는 HMR로 충분 — 브라우저 새로고침 1회

### Step 2. 사용자에게 검증 부탁
다음 표 중 ①·② 두 케이스가 핵심입니다.

| # | 검증 | 기대 결과 |
|---|------|----------|
| ① **Critical** | `session_20260513_919435a7` (1436 chunks / 117MB) → 히스토리 [녹음 다운로드] 1회 클릭 | 자동 unlink → raw concat **1초 미만** → 결과 webm ≈ 117MB / 재생 길이 = 회의 실제 시간 |
| ② **신규 녹음** | 새 회의 5분 + 가능하면 30분+ → 7단계 다운로드 | 재생 길이 = 회의 길이, **파일 크기 ≈ chunks 총합 (raw concat 1:1)**, POST 404 재현 안 됨 |
| ③ 모바일 회귀 | DevTools ~375px → 히스토리 하단 5버튼 + 7단계 녹음 카드 | 그룹 단위 줄바꿈, "녹음 다운로드" 어절 유지, 세그먼트 헤딩 아래 |
| ④ ngrok 다른 데스크톱 | 이슈 2 본질 해결 확인 | 그 데스크톱의 다운로드 폴더에 저장 |

`reports/DEV-REPORT-20260514.md` 5절에 13~18 시나리오 전체 정리되어 있음.

### Step 3. 검증 통과 시 권장 분할 커밋

```powershell
# 1) PLAN-DEV-HANDOFF -1/-2 합본 (저장 경로 폐기 + UI 회귀)
git add backend/models/settings.py backend/routers/settings.py `
        backend/routers/sessions.py backend/routers/history.py backend/routers/slack.py `
        frontend/src/pages/Settings.tsx frontend/src/pages/SendSave.tsx `
        frontend/src/pages/HistoryDetail.tsx `
        reports/PLAN-DEV-HANDOFF-20260514.md reports/PLAN-DEV-HANDOFF-20260514-2.md
git commit  # 메시지는 아래 §5 참고

# 2) QA-AUDIO-MERGE-LOSS 1+2 squash (Critical 단독)
git add backend/services/audio_service.py `
        QA-FIX/QA-AUDIO-MERGE-LOSS-20260514.md QA-FIX/QA-AUDIO-MERGE-LOSS-20260514-2.md
git commit  # 메시지는 아래 §5 참고

# 3) 기획·검수 산출물 + 개발 리포트 + HANDOVER 일괄
git add HANDOVER.md reports/DEV-REPORT-20260514.md reports/QA-REPORT-20260514.md `
        reports/PLAN-REPORT-20260514.md reports/PLAN-SESSION-RESUME-20260514.md `
        reports/DEV-SESSION-RESUME-20260515.md
git commit
```

⚠ 검증 실패 시: 커밋 보류하고 사용자에게 증상 + 진단 정보 요청. 특히 ①에서 시간 초과/POST 404 재현 시 백엔드 로그(ffmpeg 호출 흔적이 없어야 함)와 디스크 상태(`merged_audio.webm` 크기) 즉시 확인.

---

## 2. Working tree 상태

```
M  HANDOVER.md
M  backend/models/settings.py
M  backend/routers/history.py
M  backend/routers/sessions.py
M  backend/routers/settings.py
M  backend/routers/slack.py
M  backend/services/audio_service.py     ← Critical fix
M  frontend/src/pages/HistoryDetail.tsx
M  frontend/src/pages/SendSave.tsx
M  frontend/src/pages/Settings.tsx
?? QA-FIX/QA-AUDIO-MERGE-LOSS-20260514.md       (1차 부분 효과)
?? QA-FIX/QA-AUDIO-MERGE-LOSS-20260514-2.md     (2차 완성)
?? reports/DEV-REPORT-20260514.md
?? reports/PLAN-REPORT-20260514.md               (기획 세션 산출물)
?? reports/PLAN-SESSION-RESUME-20260514.md       (기획 세션 산출물)
?? reports/QA-REPORT-20260514.md                 (검수 세션 산출물)
```

---

## 3. 변경 요약 (커밋 메시지 작성용)

### 3-1. PLAN-DEV-HANDOFF-20260514 (저장 경로 폐기 + 브라우저 다운로드 일원화)
- 백엔드: `models/settings.py` `export_path` 제거 / `routers/settings.py` 요청 모델 정리 / `sessions.py` + `history.py`의 `POST /export-md` · `/export-audio` 4종을 `FileResponse`로 전환 (항상 `EXPORT_DIR`에 저장 + 같은 파일 스트림 반환) / `slack.py` .md 검색을 `EXPORT_DIR` 단일 경로로 / `history.py delete_meeting` 같은 패턴
- 프론트: `Settings.tsx` "기본 저장 경로" 섹션 완전 제거 / `SendSave.tsx` `exportPath` state·showDirectoryPicker 제거 + `downloadBlobFromPost` 헬퍼 도입 + 라벨 "저장"→"다운로드" + 토스트 문구 갱신
- **근본 원인**: 브라우저 보안 제약상 `showDirectoryPicker`의 `handle.name`이 폴더 이름만 반환 → 백엔드 CWD 기준 상대 경로 해석 → 사용자 의도와 다른 위치 저장 + ngrok 다른 데스크톱에서 "파일 사라진 듯" 보임

### 3-2. PLAN-DEV-HANDOFF-20260514-2 (UI 회귀)
- HistoryDetail 하단 버튼 5개 → 3그룹 (주액션 / 보조 다운로드 / 위험) + `flex flex-wrap items-center gap-x-6 gap-y-3` + 각 버튼 `whitespace-nowrap`
- SendSave 녹음 카드 헤딩 → `flex flex-col sm:flex-row sm:flex-wrap` + `.webm/.mp3` 세그먼트 `sm:ml-auto`

### 3-3. 회귀 fix (-1 부수, 핸드오프에 없던 항목)
- HistoryDetail의 `.md 다운로드` 핸들러도 `responseType: 'blob'` + Content-Disposition 패턴으로 통일. 백엔드 FileResponse 전환 시 기존 `res.data.content` 의존 코드가 깨지는 회귀 차단

### 3-4. QA-AUDIO-MERGE-LOSS 1+2 squash (Critical — 녹음 99.93% 손실)
- **1차 시도 (부분 효과)**: `merge_audio_chunks`의 `-c copy` → `-c:a libopus -b:a 96k` 재인코딩. 검수 재진단으로 ffmpeg가 exit 0 + 41KB partial output을 만드는 silent failure 확인 → 부분만 동작
- **2차 완성 (raw binary concat 전면 교체)**:
  - `merge_audio_chunks`에서 ffmpeg subprocess **완전 제거**, 1MB 버퍼 streaming raw byte concat + try/except로 partial 자동 unlink + `written == expected` 1:1 매칭 강제
  - `_is_merged_audio_corrupted`를 `merged < total * 0.5` 단일 조건으로 단순화 (raw concat은 1:1이라 first_chunk 비교 무의미, 단일 임계값이 80KB·41KB·향후 partial 모두 포함)
  - `resolve_or_build_audio` + `history._resolve_meeting_audio` 흐름(1차에서 추가)은 그대로 유지 — 손상 감지 → unlink → fallthrough → lazy 재병합
- **근본 원인 (검수 ffmpeg 직접 재현으로 확정)**: MediaRecorder는 단일 stream을 슬라이스해서 첫 청크에만 EBML 헤더 + Segment, chunk_001+는 headerless Cluster bytes. ffmpeg concat demuxer는 (어떤 옵션이든) chunk_001+를 valid WebM으로 인식 못함 → raw byte concat이 원본 단일 stream 복원의 유일한 표준 패턴

---

## 4. 검증 자동화된 부분 (어제 마무리)

| 항목 | 결과 |
|------|------|
| 백엔드 모듈 import | OK (`python -c "from routers import sessions, history, slack, settings; from services.audio_service import ..."`) |
| `merge_audio_chunks` AST 검사 | 본문에 `subprocess` 호출 0건 확인 |
| `_is_merged_audio_corrupted` in-memory 검증 | 4가지 케이스 통과 — 919435a7 / 6e5990a1 손상 판정, 단일 청크 + 정상 raw concat exempt |

이미 했으니 다음 세션에서 재실행 불필요 — 사용자 실증만.

---

## 5. 커밋 메시지 권장

### 커밋 1 (PLAN-DEV-HANDOFF -1/-2 합본)

```
저장 경로 폐기 + UI 회귀 보정 (PLAN-DEV-HANDOFF-20260514 + -2)

저장 경로 폐기 (-1, 8건)
- backend: export_path 필드/요청 모델 전 영역 제거
- backend: POST /export-md, /export-audio 4종 → FileResponse (항상 EXPORT_DIR
  저장 + 동일 파일 스트림 반환). Slack .md 검색, delete_meeting .md 정리도
  EXPORT_DIR 단일 경로
- frontend: Settings "기본 저장 경로" 섹션 + showDirectoryPicker 전 제거
- frontend: SendSave exportPath state/UI 제거, downloadBlobFromPost 헬퍼 신규
  (Content-Disposition filename*=UTF-8'' / plain 양쪽 파싱),
  체크박스 라벨 "저장"→"다운로드", 안내·Slack 첨부 실패 토스트 문구 갱신
- 근본 원인: showDirectoryPicker handle.name이 폴더 이름만 반환 → 백엔드 CWD
  기준 상대 해석 → 사용자 의도와 다른 위치, ngrok 다른 데스크톱에서 파일
  사라진 듯 보임 (사용자 보고 이슈 1·2 본질 해결)

UI 회귀 (-2, 2건)
- HistoryDetail 하단 5버튼 → 3그룹 (주액션 / 보조 다운로드 / 위험)
  flex-wrap items-center gap-x-6 gap-y-3 + 각 버튼 whitespace-nowrap
- SendSave 녹음 카드 → flex flex-col sm:flex-row sm:flex-wrap +
  세그먼트 sm:ml-auto (모바일 ~375px 세그먼트 자동 줄바꿈)

회귀 fix (핸드오프 외 1건)
- HistoryDetail .md 다운로드 핸들러도 responseType: 'blob' +
  Content-Disposition 파싱 패턴으로 통일 (백엔드 FileResponse 전환 시 기존
  res.data.content 의존 코드가 깨지는 회귀 차단)
```

### 커밋 2 (QA-AUDIO-MERGE-LOSS 1+2 squash)

```
녹음 파일 99.93% 손실 근본 fix — raw binary concat (QA-AUDIO-MERGE-LOSS 1+2)

서비스 시작부터 존재하던 데이터 무결성 결함. merged_audio.webm이 청크 총합과
무관하게 ~80KB(첫 청크 크기) 또는 ~41KB(libopus partial)로 고정되어 모든 회의
녹음이 5초만 재생되던 상태. 4단계 Whisper 입력도 동일 영향이었으나 하이브리드
전사(Web Speech가 첫 5초 이후를 메움)로 가려졌고, e262762 녹음 파일 다운로드
도입 이후 사용자가 실제 audio 상태를 확인하면서 비로소 노출됨.

근본 원인 (검수 ffmpeg 직접 재현으로 확정)
- MediaRecorder는 단일 WebM stream을 슬라이스해서 첫 청크에만 EBML 헤더+
  Segment가 있고 chunk_001+는 headerless Cluster bytes
- ffmpeg concat demuxer는 (-c copy / -c:a libopus / -fflags +genpts /
  wav 중간 단계) 어떤 옵션이든 chunk_001+를 valid WebM으로 인식 못함
- 1차 시도(libopus 재인코딩)는 ffmpeg exit 0 + 41KB partial output을
  만드는 silent failure로 부분만 동작 (사용자 새 회의에서 POST 404 재발)

수정 (raw binary concat)
- audio_service.merge_audio_chunks: ffmpeg subprocess 완전 제거.
  1MB 버퍼 streaming raw byte concat + try/except로 partial 자동 unlink
  + written == expected 1:1 매칭 강제 (silent failure 원천 차단)
- _is_merged_audio_corrupted: merged < total * 0.5 단일 조건으로 단순화
  (raw concat은 1:1이라 first_chunk 비교 무의미)
- resolve_or_build_audio + history._resolve_meeting_audio: 손상 자동 감지
  → unlink → fallthrough → lazy 재병합. 과거 손상 세션은 재 다운로드
  1회로 자동 복구 (60~90초 → 1초 미만으로 단축)

검증
- 검수: 28MB / 349 chunks → 28MB 출력 0.33초, ffprobe codec=opus,
  mp3 변환 시 회의 실제 길이(29분 16초) 인식
- 자동 복구 헬퍼 in-memory 4 케이스: 919435a7/6e5990a1 손상 판정,
  단일 청크 + 정상 raw concat false positive 없음
```

---

## 6. 알려진 미결 (인계)

### 🟠 resume·복구 audio 한계 (QA-FIX-3 제안 단계)
- 한 세션에서 두 번 녹음 (마이크 끊김 / 일시정지 / WebSocket 재연결) 시 `chunks/`에 두 묶음의 EBML 헤더가 함께 저장
- raw concat 결과 단일 stream 안에 EBML 헤더 2개가 섞여 미디어 플레이어가 두 번째 위치에서 디코딩 중단 가능 → **후반부 녹음 손실 위험**
- 일반 단일 녹음은 무영향. 사용자(PM)의 마이크 끊김·재연결 빈도에 따라 우선순위
- 검수 세션이 QA-FIX-3 명세를 작성할지 의사 결정 대기 (해결 후보: audio.py 단일 파일 append 모드 / resume 시 새 sub-디렉토리 / resume 비활성화 + 새 세션 강제)

### 🟡 잔여 5건
Part D 2건 / 환경 의존 2건 / 미리보기 1건. `reports/QA-REPORT-20260514.md` 참조.

### 이슈 3 (백엔드 호스팅 전환)
보류 + Whisper.wasm PoC 별도 진행 중.

---

## 7. 사용자 컨텍스트 (다음 세션이 알면 좋은 점)

- 사용자는 PM 역할. 결과물 브라우저 직접 확인 + 반복적 피드백 루프 선호
- 한국어 + 존댓말로 응대. 코드 주석·변수명은 영문
- 결정 후 "이거 왜 이렇게 했지?" 되묻는 습관 → 근거를 함께 기록할 것
- 어제 세션에서 `/loop` 등 자동화 없이 단계별 확인을 선호한다는 신호: 핸드오프 -1·-2를 한 세션에서 처리할지 분리할지 선택권 줬을 때 "한 세션에서 처리해도 되고 충돌만 조심하면 됨"이라고 명확히 결정
- 60~120분 안정성 + ngrok·MacBook 배포가 단기 관심사

---

## 8. 참조 문서 (읽는 순서)

1. **`HANDOVER.md`** 8절 (구현 완료 항목) + 10절 (전달 사항)
2. **`reports/DEV-REPORT-20260514.md`** — 변경 사항 + 의사결정 + 검증 시나리오 18가지
3. **`QA-FIX/QA-AUDIO-MERGE-LOSS-20260514-2.md`** — Critical 근본 원인·명세 (1차 문서는 동작 안 함이 확정된 시도로 참고용)
4. **`reports/QA-REPORT-20260514.md`** — 검수 진단 경위 + 8절 검수 교훈
