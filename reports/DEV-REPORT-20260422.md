# 개발 업무 보고서 — 2026-04-22

> 작성 주체: 개발 세션
> 대상 기간: 2026-04-22 (여섯 번째 개발 세션)
> 이전 보고서: `reports/DEV-REPORT-20260421.md`

---

## 1. 오늘 수행한 작업 요약

| 카테고리 | 건수 | 요약 |
|---------|------|------|
| QA 수정 (Sprint 5 추가) | 5건 | `QA-FIX/QA-SPRINT5-FIX2-20260422.md` — export-md 404, 복구 배너 CTA 비활성, 탭 복귀 조건부 토스트, useVisibility deps, 검색 스니펫 |
| Web Speech 안정화 | 4건 | `QA-FIX/QA-WEBSPEECH-FIX-20260422.md` — onerror 분기, no-speech backoff, 재시작 실패 안내, instanceIdRef 2중 실행 방지 |
| 버그 수정 | 1건 | useVisibility 호출 위치 오류 (webSpeech 선언 전 참조 → 선언 뒤로 이동) |

---

## 2. 변경된 파일 목록

### 백엔드

| 파일 | 변경 유형 | 상세 |
|------|----------|------|
| `routers/history.py` | 수정 | `POST /{meeting_id}/export-md` 엔드포인트 추가, search 응답에 `snippet`/`matched_field` 필드 추가, `_extract_snippet()` 유틸 함수 |

### 프론트엔드

| 파일 | 변경 유형 | 상세 |
|------|----------|------|
| `hooks/useWebSpeech.ts` | **전면 교체** | FIX-1: onerror 에러별 분기(no-speech/not-allowed/network/audio-capture/aborted) + `onStatusChange` 콜백. FIX-2: no-speech 지수 backoff(1s→1.5s→...5s) + 10회 초과 시 전사 일시중지. FIX-3: onend 재시작 실패 시 사용자 안내. FIX-5: `instanceIdRef`로 인스턴스 동일성 보장 |
| `pages/Recording.tsx` | 수정 | useWebSpeech에 `onStatusChange` 콜백 연결, useVisibility를 webSpeech 선언 뒤로 이동 (초기화 순서 버그 수정), 탭 복귀 로직을 stop→50ms대기→start로 변경 (인스턴스 경쟁 해소) |
| `pages/Home.tsx` | 수정 | 복구 세션 존재 시 "새 회의 시작" 버튼 `disabled` + 안내 문구 표시 |
| `pages/History.tsx` | 수정 | 검색 결과에 매칭 스니펫 표시 (`highlightMatch` 함수 + 필드 라벨), `FIELD_LABELS` 매핑 |
| `types/index.ts` | 수정 | `MeetingListItem`에 `snippet`, `matched_field` 필드 추가 |

---

## 3. 주요 기술 결정

### Web Speech 안정화 — 최종 아키텍처

| 문제 | 해결 |
|------|------|
| no-speech 무한 루프 | 지수 backoff (1s base, 1.5x, max 5s) + 10회 초과 시 전사 일시중지 |
| 에러 사용자 안내 없음 | `onStatusChange` 콜백으로 에러별 토스트 (no-speech/권한/네트워크/마이크/재시작 실패) |
| 탭 복귀 시 인스턴스 2중 실행 | `instanceIdRef` — 새 start 시 ID 발급, onend에서 현재 ID 아니면 재시작 안 함 |
| 탭 복귀 stop→start 경쟁 | stop 후 50ms setTimeout으로 이전 onend 처리 대기 후 start |
| 재시작 실패 무시 | try-catch + onStatusChange로 사용자 안내, `setIsListening(false)` |

### 검색 스니펫

- 백엔드: 필드별 순서 매칭 (title → participants → keywords → summary → transcript), ±30자 snippet 추출
- 프론트: 검색어를 `<mark>` 태그로 하이라이트, 매칭 필드 라벨 표시 (제목/참여자/키워드/요약/전사)

---

## 4. 현재 코드 상태

### 전체 구현 완성도

| 영역 | 완성도 | 비고 |
|------|--------|------|
| 1단계 홈 | ~98% | 복구 카드 + CTA 비활성 |
| 2단계 회의 정보 | ~95% | |
| 3단계 녹음 | ~95% | Web Speech 안정화 완료, 백그라운드 탭 ①②③ |
| 4단계 Whisper | ~85% | Whisper 미설치 |
| 5단계 편집 | ~95% | |
| 6단계 요약 | ~95% | |
| 7단계 전송 | ~95% | |
| 히스토리 | ~95% | 검색 스니펫 + 기간 필터 + 재편집/재전송 |
| 설정 | ~93% | 테마·템플릿·주소록·연동·메시지 |
| 다크모드 | ~95% | |

### 미구현/미완

| 항목 | 상태 |
|------|------|
| B-2 ④ 타이머 보정 | useTimer가 Date.now() 기반이면 불필요 |
| B-2 ⑤ Web Worker | MVP 선택적 |
| Meeting 재편집 저장 분기 | editMode 상태 준비됨, API 분기 미적용 |
| Whisper 설치 | MacBook 배포 시 |

### 미커밋 변경사항

- Sprint 5 전체 + QA Sprint 5 수정 18건 + Web Speech 안정화 4건 + 기획 변경 보완 → 커밋 필요

---

## 5. 다음 세션에서 확인할 것

### 즉시
- 미커밋 변경사항 커밋 + push
- 브라우저에서 녹음 플로우 재검증 (Web Speech 안정화 동작 확인)
- 전체 플로우 테스트 (1→7단계 + 히스토리 + 설정)

### 추후
- Meeting 재편집 시 PATCH /meetings/{id} 저장 분기 구현
- Whisper 설치 + 4단계 실제 테스트
- MacBook 크로스 플랫폼 배포 확인
