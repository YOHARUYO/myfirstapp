# 개발 업무 보고서 — 2026-05-14

> 작성 주체: 개발 세션
> 대상 기간: 2026-05-14 (열여섯 번째 개발 세션)
> 이전 보고서: `reports/DEV-REPORT-20260507.md`
> 처리한 핸드오프: `reports/PLAN-DEV-HANDOFF-20260514.md` (저장 경로 폐기) + `reports/PLAN-DEV-HANDOFF-20260514-2.md` (UI 회귀 2건) + `QA-FIX/QA-AUDIO-MERGE-LOSS-20260514.md` (Critical 1차 시도 — 부분만 동작) + `QA-FIX/QA-AUDIO-MERGE-LOSS-20260514-2.md` (Critical 2차 — raw binary concat 재설계, 완성)

---

## 1. 오늘 수행한 작업 요약

| 카테고리 | 건수 | 요약 |
|---------|------|------|
| **저장 경로 개념 폐기 (PLAN-DEV-HANDOFF-20260514, -1)** | **8건** | `export_path` 필드/요청 모델 5곳에서 제거. `POST /export-md` · `/export-audio` 4종을 `FileResponse`로 전환(항상 EXPORT_DIR에 저장 + 같은 파일을 스트림 반환). Slack 첨부·delete_meeting 검색 로직을 EXPORT_DIR 단일 후보로 축소. Settings.tsx의 "기본 저장 경로" 섹션 + showDirectoryPicker 호출 + interface 필드 전부 제거. SendSave.tsx에서 `exportPath` state·폴더 선택 UI 제거, 체크박스 라벨을 "저장" → "다운로드"로 갱신, doExecute + 재시도 핸들러 2곳을 blob responseType + Content-Disposition 파싱 방식으로 통일, Slack 첨부 실패 토스트 문구 갱신 |
| **UI 회귀 (PLAN-DEV-HANDOFF-20260514-2)** | **2건** | #1 HistoryDetail 하단 버튼 5개를 주액션(재편집·재전송) / 보조 다운로드(.md·녹음) / 위험(삭제) **3그룹**으로 분리, 외곽 `flex flex-wrap items-center gap-x-6 gap-y-3`, 각 버튼 `whitespace-nowrap` 적용. #2 SendSave 녹음 파일 카드 헤딩 영역을 `flex flex-col sm:flex-row sm:flex-wrap` 패턴으로 변경(체크박스/제목은 라벨로 묶고, .webm/.mp3 세그먼트는 모바일에서 자연스럽게 다음 줄로 내려가도록 `sm:ml-auto`) |
| **회귀 fix (-1 부수)** | **1건** | HistoryDetail의 `.md 다운로드` 버튼 핸들러도 `responseType: 'blob'` + Content-Disposition 파싱 패턴으로 통일 — 백엔드가 JSON에서 FileResponse로 바뀌었으므로 기존 `res.data.content` 의존 코드가 깨지는 회귀를 함께 처리 (핸드오프에는 "이미 blob 다운로드 → 변경 없음"이라 명시됐으나 실제 코드는 JSON 본문을 Blob으로 감싸는 방식이라 응답 형식 변경 시 깨짐) |
| **🔴 Critical 데이터 무결성 1차 시도 (QA-AUDIO-MERGE-LOSS-20260514)** | **3건** | ① `audio_service.merge_audio_chunks`의 ffmpeg 옵션을 `-c copy` → `-c:a libopus -b:a 96k` 재인코딩으로 전환. ② `_is_merged_audio_corrupted` 헬퍼 신규 (merged < first*1.2 AND merged < total*0.5). ③ `resolve_or_build_audio` + `history._resolve_meeting_audio`에 손상 자동 감지 + lazy 재병합. **결과: 부분만 동작** — ffmpeg가 exit 0으로 반환하면서 41KB partial output을 silent하게 만드는 두 번째 손상 패턴이 발생, 사용자 새 회의에서 POST 404 발생. 1차 fix의 헬퍼·라우터 분기·sanity check 구조는 2차에서도 유효 (임계값만 단순화) |
| **🔴 Critical 데이터 무결성 2차 — 완성 (QA-AUDIO-MERGE-LOSS-20260514-2)** | **2건** | ① `merge_audio_chunks`를 **raw binary concat으로 전면 재구현** (ffmpeg subprocess 완전 제거). 1MB 버퍼 streaming copy + try/except로 partial 출력 자동 정리 + `written == expected` 1:1 매칭 강제 검증. MediaRecorder는 단일 stream을 슬라이스해서 첫 청크에만 EBML 헤더가 있고 chunk_001+는 headerless Cluster bytes라 ffmpeg concat demuxer로는 본질적으로 처리 불가 — raw bytes 조립이 원본 stream 복원의 정답(검수 0.33초 / 100% 보존 검증). ② `_is_merged_audio_corrupted` 판정을 **`merged < total * 0.5` 단일 조건**으로 단순화. raw concat은 1:1 매칭이라 first_chunk 비교는 무의미하고, 단일 임계값이 80KB·41KB·향후 partial 패턴 모두 잡음 |

---

## 2. 변경된 파일 목록

### 백엔드

| 파일 | 변경 유형 | 상세 |
|------|----------|------|
| `backend/models/settings.py` | 수정 | `export_path: str = ""` 필드 제거 |
| `backend/routers/settings.py` | 수정 | `UpdateSettingsRequest.export_path` 제거 (기존 settings.json의 `export_path` 키는 무시되어 무해) |
| `backend/routers/sessions.py` | 수정 | `from fastapi.responses import FileResponse` import 추가. `ExportMdRequest` 모델 제거 + `export_md`를 인자 없이 받고 `FileResponse(text/markdown)`로 반환. `ExportAudioRequest`에서 `export_path` 제거, `export_session_audio`를 `FileResponse(audio/webm \| audio/mpeg)`로 반환. 둘 다 항상 `EXPORT_DIR`에 저장 |
| `backend/routers/history.py` | 수정 | `ExportMdRequest` 모델 제거, `export_meeting_md`/`export_meeting_audio`를 `FileResponse`로 전환. `delete_meeting`의 `.md` 검색을 `settings.json export_path` 분기 없이 `EXPORT_DIR` 단일 후보로 축소. 미사용된 `DATA_DIR` import 정리 |
| `backend/routers/slack.py` | 수정 | `send_slack_message`의 `.md` 첨부 후보 검색을 `EXPORT_DIR` 단일 경로로 축소(`md_attached` 응답 필드는 유지) |
| `backend/services/audio_service.py` | 수정 (2회) | **최종 상태**: `merge_audio_chunks`는 raw binary concat (ffmpeg subprocess 제거, 1MB 버퍼 streaming, partial 자동 정리, 1:1 매칭 검증). `_is_merged_audio_corrupted`는 `merged < total*0.5` 단일 조건. `resolve_or_build_audio` 시작부에 손상 감지 → unlink → fallthrough 흐름 (1차 fix에서 추가, 2차에서 유지). 1차 fix의 libopus·sanity check 코드는 2차에서 raw concat 검증으로 대체됨 |
| `backend/routers/history.py` | 수정 (추가) | `_resolve_meeting_audio`에 손상 감지 분기 추가 — `Meeting.merged_audio_path`가 가리키는 파일이 손상 패턴이면 unlink 후 `resolve_or_build_audio(session_dir)`로 위임. `_is_merged_audio_corrupted` 공통 헬퍼 재사용 (1차에서 작성, 2차에서 변경 없음) |

### 프론트엔드

| 파일 | 변경 유형 | 상세 |
|------|----------|------|
| `frontend/src/pages/Settings.tsx` | 수정 | `AppSettings.export_path` 필드 제거, "기본 저장 경로" 섹션 전체(showDirectoryPicker / prompt 폴백 / `setSettings export_path` 핸들러) 제거 |
| `frontend/src/pages/SendSave.tsx` | 수정 | `exportPath` state + settings fetch (`useEffect` 안의 `api.get('/settings').then(setExportPath)`) 제거. `downloadBlobFromPost(url, body, fallback)` 헬퍼 신규 (Content-Disposition `filename*=UTF-8''` 및 plain `filename=` 양쪽 파싱). doExecute의 `.md`/`녹음` 호출 + 완료 화면 재시도 핸들러 2곳을 헬퍼로 일원화. ".md 저장"/"녹음 파일 저장" 헤딩을 "다운로드"로 변경, 안내 문구를 "브라우저 다운로드 폴더에 저장됩니다"로 갱신. Slack 첨부 실패 토스트 문구를 갱신("…백엔드에 생성되지 않아 첨부 없이 전송되었습니다. 잠시 후 재전송을 시도해주세요."). 녹음 카드 헤딩 라인을 `flex flex-col sm:flex-row sm:flex-wrap` + 세그먼트 `sm:ml-auto`로 모바일 안전 구조 적용. 미사용 lucide-react import (`Download`, `Trash2`) 정리 |
| `frontend/src/pages/HistoryDetail.tsx` | 수정 | 하단 버튼 영역을 3그룹(주액션 / 보조 / 위험)으로 분리, 외곽 `flex flex-wrap items-center gap-x-6 gap-y-3`, 각 버튼 `whitespace-nowrap`. `.md 다운로드` 핸들러를 `responseType: 'blob'` + Content-Disposition 파싱으로 전환(백엔드 FileResponse 회귀 fix) |

---

## 3. 주요 기술 결정/변경 사항

### 3-1. `export_path` 개념 완전 제거 — 데이터 흐름 일원화

이전 흐름은 사용자가 "폴더 선택"으로 `showDirectoryPicker`의 `handle.name` (= 폴더 이름만)을 settings.json에 저장하고, 백엔드가 그것을 상대 경로로 해석해 `backend/{폴더이름}/`에 저장하는 구조였음. 브라우저 보안 제약상 절대 경로를 받을 수 없어 의도한 위치에 저장되지 않았고, ngrok 등 외부 데스크톱 접속 시 백엔드 CWD는 개발 데스크톱이라 파일이 "사라진 듯" 보이는 사용자 보고 이슈 1·2의 진짜 원인.

새 흐름:
- **백엔드 측** — `.md`는 항상 `EXPORT_DIR`(`backend/data/exports/`)에 저장. Slack `.md` 첨부 lookup, `delete_meeting` 정리도 EXPORT_DIR 단일 경로로 통일. `export_path`는 schema·모델·요청 본문에서 전부 사라짐(기존 settings.json의 `export_path` 키는 더 이상 읽지 않아 무해)
- **사용자 측** — 7단계 체크박스 또는 히스토리 다운로드 버튼 → `FileResponse` 응답 → 브라우저 다운로드 폴더로 저장(브라우저 설정에서 사용자가 변경 가능)

### 3-2. POST + FileResponse 일관 패턴

기존의 `POST → JSON {filename, content}` 응답 패턴은 (1) `.md`만 적용되고 audio는 `POST → JSON {file_path}` 였으며 (2) 프론트에서 Blob을 본문 문자열로 감싸 다운로드 → 응답 형식 변경에 취약했음. 이번에 4개 export 엔드포인트(`sessions/export-md`, `sessions/export-audio`, `meetings/export-md`, `meetings/export-audio`) 전부 `FileResponse`로 통일했고, 프론트는 `responseType: 'blob'` + Content-Disposition 파싱 단일 패턴(`downloadBlobFromPost`)을 사용.

### 3-3. 핸드오프 명세에 없던 회귀 fix

핸드오프 -1은 "히스토리 상세의 [.md 다운로드] / [녹음 다운로드]는 이미 blob 다운로드 → 변경 없음"이라 명시했으나 실제 HistoryDetail의 `.md 다운로드`는 JSON `content` 의존 코드였음. 백엔드 응답이 FileResponse로 바뀌면서 동작 회귀가 발생하므로 audio와 동일한 blob + Content-Disposition 패턴으로 함께 통일. 결과적으로 SendSave / HistoryDetail의 `.md` · 녹음 다운로드 4곳이 동일 패턴.

### 3-4. 모바일 반응형 — 본질 동일

HistoryDetail 하단(버튼 5개)과 SendSave 녹음 카드 헤딩(체크박스+제목+세그먼트)이 모두 **`flex` + 강제 한 줄** 구조에서 발생한 회귀. 동일한 해결책(`flex-wrap` + `whitespace-nowrap`로 어절 단위 줄바꿈)으로 통일. 데스크탑 시각은 변동 없음 — 모바일 폭(~375px)에서만 그룹 단위로 자연스럽게 다음 줄로 내려감.

### 3-5. 🔴 Critical: 녹음 첫 청크만 보존 결함 — 1차 시도 (Sprint 3부터 존재)

검수가 디스크를 직접 확인하여 발견: 최근 6개 세션 모두 `merged_audio.webm`이 청크 총합과 무관하게 약 78~80KB(첫 청크 크기)에 고정 — `session_20260513_919435a7`은 chunks 117MB 대 merged 79KB로 **99.93% 손실**. 사용자는 4단계 Whisper 흐름에서 하이브리드 전사(Web Speech가 첫 5초 이후를 메움) 덕에 인지하지 못했고, e262762로 녹음 파일 다운로드가 도입되면서 비로소 노출됨.

1차 가설은 "stream copy 모드의 EBML 컨테이너 경계 문제 → libopus 재인코딩으로 단일 streamable opus 재출력". 그러나 사용자 검증 시 **POST 404**가 발생하여 부분 동작만 확인됨 (3-6 참조).

### 3-6. 🔴 Critical 완성 — raw binary concat 재설계 (1차 fix는 부분만 동작)

1차 fix(libopus 재인코딩) 적용 후 사용자 새 회의에서 **POST 404**가 발생. 검수가 재진단:
- `session_20260507_6e5990a1` (chunks 28MB / 349개) → libopus 재인코딩 결과 **41KB**만 출력 (0.15% 보존)
- ffmpeg **exit code 0** + stderr 깨끗 → silent failure
- `ffmpeg -i chunk_001.webm` 단독 디코딩 시도 → `EBML header parsing failed` 에러
- **결정적 사실 확정**: `chunk_001.webm`은 독립적인 WebM 파일이 아님

**진짜 근본 원인**: `MediaRecorder.start(timeslice)`로 슬라이스해도 출력은 **연속된 단일 WebM 스트림의 단편**. 첫 청크에만 EBML 헤더 + Segment 시작 + Cluster가 있고, **후속 청크는 headerless Cluster bytes만**. 즉 ffmpeg concat demuxer는 (어떤 옵션이든) 본질적으로 부적합 — chunk_001+를 valid WebM으로 인식조차 못함. raw byte concat이 원본 단일 stream을 복원하는 표준 패턴.

**2차 fix 의사결정**:
- `merge_audio_chunks`를 **ffmpeg subprocess를 완전히 제거**하고 1MB 버퍼 streaming raw byte concat으로 재구현. 검수 검증: 28MB → 28MB (100% 보존), 0.33초 처리, ffprobe `codec_name=opus / 48kHz / stereo`, mp3 변환 시 회의 실제 길이(29분 16초) 인식
- 실패 시 partial output을 자동 unlink하고 raise (디스크에 잘못된 캐시가 남지 않음 — 1차 fix 부분 동작 시 router 404의 원인이 partial 파일 잔여였음)
- raw concat은 **1:1 매칭**이므로 `written != expected` 시 RuntimeError로 즉시 노출 (1차의 first_chunk 비교 sanity는 더 강한 조건으로 대체)
- `_is_merged_audio_corrupted`는 `merged < total * 0.5` 단일 조건으로 단순화 — 80KB·41KB·향후 partial 패턴 모두 한 임계값으로 잡힘
- 손상 감지 + lazy 재병합 흐름(1차에서 추가)은 그대로 유지 — 다음 다운로드 요청 시 자동 복구

**처리 시간 비교**:
| 방식 | 60분 회의 처리 시간 | 비고 |
|------|------|------|
| 1차 fix: libopus 재인코딩 | 30~60초 (예상) | 실제로는 0.15%만 보존되어 무의미 |
| 2차 fix: raw binary concat | 0.5~1.5초 | CPU 무료, 디스크 IO만 |

**영향 범위 (2차 완성 기준)**:
- 🎵 녹음 파일 다운로드: 5초 → 전체 회의 (사용자 보고 증상 해결)
- 🎙 4단계 Whisper: 5초만 입력 → 전체 회의 입력 (다음 회의부터 자연스럽게 전사 품질 향상)
- 🗃 과거 모든 손상 세션: 재 다운로드 1회로 자동 복구 (raw concat 0.5~1.5초)
- 📦 7단계 export-audio: 손상본 → 정상
- ⚠ 다운로드 대역폭: 80KB → 회의 길이에 비례 (60분 ~55MB) — ngrok/무선 환경 무난

### 3-7. 알려진 한계 — 재개·복구 세션 (별도 QA-FIX-3 예정)

`audio.py:81`의 `chunk_index = session.audio_chunk_count` 이어쓰기 구조상, 같은 세션에서 두 번 녹음한 경우 (마이크 끊김 / 일시 중지 / WebSocket 재연결) chunks/ 디렉토리에 두 묶음의 EBML 헤더가 함께 저장됨. raw concat 시 두 EBML이 단일 stream 안에 섞이면서 미디어 플레이어가 두 번째 EBML 위치에서 디코딩을 멈출 가능성 — **재개된 후반부 녹음 손실 위험**.

🟡 Medium — 일반 단일 녹음에는 무영향. 본 fix 범위 밖이며 검수가 별도 QA-FIX-3 작성 예정 (해결 후보: audio.py 단일 파일 append 모드 / resume 시 새 sub-디렉토리 / resume 비활성화 + 새 세션 강제).

---

## 4. 검증 결과

### 4-1. 자동 검증

- 백엔드 모듈 import: `python -c "from routers import sessions, history, slack, settings; from models import settings as ms"` → OK (신규 TS·Python 에러 0건)
- SendSave.tsx의 `downloadBlobFromPost` 헬퍼는 Content-Disposition `filename*=UTF-8''` (RFC 5987) 및 plain `filename=` 양쪽을 파싱 — FastAPI `FileResponse(filename=...)`가 한국어 파일명을 UTF-8 인코딩으로 보내는 케이스에 안전

### 4-2. 브라우저 검증 (미수행 — 사용자 직접 확인 필요)

7단계 + 히스토리 + 설정 화면 모두 실 동작 확인이 필요합니다. 아래 5절의 검증 시나리오 참고.

---

## 5. 다음 세션에서 확인할 것

### PLAN-DEV-HANDOFF-20260514 (-1) 검증

1. **신규 회의 → 7단계 → ☑ .md 다운로드 + ☑ Slack 전송 → [실행]**
   - 브라우저 다운로드 폴더에 `{제목}_{날짜}.md` 저장 확인
   - Slack 채널에 .md 첨부 + 본문 정상 (md_attached: true)
   - 히스토리 목록에 #전송됨 태그 노출 (직전 세션 fix 회귀 여부 확인)
2. **☐ 녹음 파일 다운로드 + .webm** → 브라우저 다운로드 폴더에 `{제목}_{날짜}.webm` 저장
3. **☐ 녹음 파일 다운로드 + .mp3** → ffmpeg 변환된 `{제목}_{날짜}.mp3` 저장 (audioStatus loading→success)
4. **다른 데스크톱에서 같은 흐름** (ngrok) → 그 데스크톱의 다운로드 폴더에 저장 확인 (이슈 2 해결 확인)
5. **설정 화면** → "기본 저장 경로" 항목이 더 이상 보이지 않음. 다른 항목(Slack 토큰, Claude API 키, Whisper 모델, 마이크 민감도, 인사 문구)은 정상
6. **히스토리 상세 [.md 다운로드]** → 백엔드 FileResponse 변경 후에도 정상 다운로드 (회귀 fix 확인)
7. **히스토리 상세 [녹음 다운로드]** → 기존 동작 그대로
8. **Slack 첨부 실패 케이스(.md가 어떤 이유로 EXPORT_DIR에 없으면)** → 토스트 ".md 파일이 백엔드에 생성되지 않아…" 노출

### PLAN-DEV-HANDOFF-20260514-2 검증

9. **데스크탑(≥768px) / 히스토리 상세 하단** → 5개 버튼이 3그룹(재편집·재전송 / .md·녹음 다운로드 / 삭제)으로 명확한 간격(gap-x-6)에 한 줄 표시
10. **모바일(~375px) / 히스토리 상세 하단** → 그룹 단위로 줄바꿈, "녹음 다운로드"가 글자 중간에서 잘리지 않음
11. **데스크탑 / 7단계 녹음 파일 카드** → 체크 시 .webm/.mp3 세그먼트가 우측 정렬(`sm:ml-auto`)되어 헤딩 옆 인라인 (현행 시각 유지)
12. **모바일 / 7단계 녹음 파일 카드** → 체크 시 세그먼트가 헤딩 아래로 자연스럽게 내려옴
13. **라이트/다크 모드 둘 다 시각 일관성**

### QA-AUDIO-MERGE-LOSS-2 검증 (Critical — raw concat 기준)

14. **신규 회의 (수정 후 첫 녹음)**
    - 5분 녹음 → 7단계 ☑ 녹음 파일 다운로드 + .webm → 미디어 플레이어 재생 시간 ≈ 5분, 파일 크기 ≥ 3MB
    - 30분+ 실회의 → 다운로드 → 재생 시간 ≈ 회의 길이, **파일 크기 ≈ chunks 총합** (raw concat은 1:1)
    - .mp3 다운로드 → libmp3lame이 streamable WebM 정상 디코드 (192kbps × N분)
15. **자동 복구 (기존 손상 세션)** — Critical 검증 핵심
    - **`session_20260513_919435a7`** (1436 chunks, 117MB, ~79KB merged) → 히스토리 [녹음 다운로드] 1회 클릭 → 자동 unlink → 즉석 raw concat (**1초 미만**) → 결과 webm 크기 ≈ 117MB / 재생 시간 = 실제 회의 길이
    - **`session_20260507_6e5990a1`** (349 chunks, 28MB, 41KB merged) — 1차 fix 부분 동작으로 생성된 partial 케이스 → 동일 흐름으로 약 29분 회의 복구
    - 두 번째 요청부터는 새 merged_audio.webm 캐시 사용 (즉시)
    - 보조 검증: `session_20260514_cf94d6f5` (813 chunks, 66MB)
16. **POST 404 재현 안 됨**
    - 사용자 보고 시나리오 그대로 (새 회의 → 녹음 → 7단계 송신) → POST 200 + Content-Disposition 정상
    - partial 파일이 디스크에 남는 케이스 없음 (raise 전 unlink)
17. **회귀 — false positive 미발생**
    - chunks 1개만 있는 짧은 정상 세션 → `len(chunks) <= 1` 조기 반환
    - upload 모드 (`uploaded.webm`) → chunks/chunk_*.webm 없음, 분기 무관
18. **다음 회의 4단계 Whisper 입력 품질**
    - 신규 녹음 → 4단계 Whisper 처리 → 처리 시간이 5분 이상(전체 회의 처리 증거) + 전사 결과가 전체 회의 커버하는지 체감 비교

### 추가 정리(선택)

- `backend/data/settings.json`에 남아있을 `export_path` 키는 더 이상 읽지 않음 → 그대로 둬도 무해. 손으로 지워도 됨
- frontend의 잔여 unused import (`Trash2`는 SendSave에서 제거, lucide-react 외 다른 페이지의 unused는 별도 정리 세션)
- `merge_audio_chunks` stderr 로깅 표준화 (silent failure 일반 차단) — QA-FIX 10절 잠재 후속 검토 항목

---

## 6. 커밋 이력

| 커밋 | 내용 |
|------|------|
| (대기) | PLAN-DEV-HANDOFF-20260514 (-1) + (-2) 일괄 반영 — 저장 경로 폐기 + UI 회귀 2건 + HistoryDetail .md 다운로드 blob fix |
| (대기) | QA-AUDIO-MERGE-LOSS-20260514 (1+2 합산) — `merge_audio_chunks` raw binary concat 전환 + 손상 자동 감지(`_is_merged_audio_corrupted`, `merged < total*0.5`) + lazy 재병합 + 1:1 매칭 검증 + partial 정리 |

> 사용자 검증 후 PLAN-DEV-HANDOFF / QA-AUDIO 분할 커밋 권장 (QA-AUDIO는 Critical로 별도 커밋, 1차+2차는 squash). 1차 fix 단독은 동작 안 함이 확정되어 squash 시 커밋 메시지에 진단 경위 명시 권장 (QA-FIX -2 문서 참조).
