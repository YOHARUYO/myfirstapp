# 개발 업무 보고서 — 2026-04-22

> 작성 주체: 개발 세션
> 대상 기간: 2026-04-22 (여섯 번째 ~ 여덟 번째 개발 세션)
> 이전 보고서: `reports/DEV-REPORT-20260421.md`

---

## 1. 오늘 수행한 작업 요약

### 세션 6 (오전)

| 카테고리 | 건수 | 요약 |
|---------|------|------|
| QA 수정 (Sprint 5 추가) | 5건 | export-md 404, 복구 CTA 비활성, 탭 복귀 조건부 토스트, deps, 검색 스니펫 |
| Web Speech 안정화 | 4건 | onerror 분기, no-speech backoff, 재시작 실패 안내, instanceIdRef |
| 버그 수정 | 1건 | useVisibility 호출 위치 |

### 세션 7 (오후 전반)

| 카테고리 | 건수 | 요약 |
|---------|------|------|
| 기획 변경 | 6건 | AI 로딩, 키보드 명령어, 위계 강화, Slack textarea, 히스토리 삭제, 미리보기 fetch |
| 버그 수정 | 7건 | Slack 유저 ID, 재편집 404, API 설정, 복구, 3→5 미반영, 첫 블록, 요약 미반영 |
| 핸드오프 누락 | 4건 | Recording 키보드+서버저장, Slack 멘션, Summary 오버레이 |
| 전수조사 (기획 대비) | 5건 | beforeunload, resummarize, resend-slack, 회의정보 접힘 |
| 전수조사 (최종 품질) | 20건 | split 재작성, uuid ID, 화이트리스트, Lock, 로깅 등 |
| 코드 정리 | 10건 | config 경고, 데드코드, formatTs 통합, Modal 포커스 등 |
| 이전 미착수 | 2건 | 반응형 Stepper, sticky 레이아웃 |

### 세션 8 (오후 후반)

| 카테고리 | 건수 | 요약 |
|---------|------|------|
| block_id 동기화 | 3건 | 클라이언트→서버 block_id 전달 (audio.py+useAudioStream+Recording) |
| 기획 변경 (2차 핸드오프) | 12건 | 수정 마크, whitespace-pre-wrap, 스레드 로딩, 폴더 선택, 5→3 뒤로가기, Whisper 스킵, 복구 전사, 요약 생략, 마이크 민감도, FAB 통합, 입력 필드 대비, 하단 네비 통합 |
| 핸드오프 누락 (2차) | 2건 | WizardLayout 이전 버튼 렌더링, GainNode 오디오 증폭 |
| 디자인 | 2건 | FAB 좌하단 위치, 하단 네비 바 Secondary+Primary 대칭 |

---

## 2. 주요 기술 결정

### Web Speech 최종 아키텍처
- no-speech: 지수 backoff (1s→1.5s→...5s, max 10회)
- 에러별 분기: onStatusChange 콜백 → 토스트
- instanceIdRef: 인스턴스 동일성 보장
- 탭 복귀: stop→50ms→start (경쟁 해소)

### block_id 동기화
- 클라이언트(Recording.tsx): `blk_${Date.now()}` 생성
- 서버(audio.py): `data.get("block_id") or uuid fallback`
- 동일 ID 보장 → split/merge/edit API 404 해결

### 하단 네비 바 통합
- WizardLayout에 `nextSlot` prop 추가
- 이전(Secondary) + 다음(Primary) 대칭 배치
- 각 페이지의 개별 버튼 → nextSlot으로 이동

### 마이크 민감도
- useAudioStream에 AudioContext→GainNode→MediaStreamDestination 파이프라인
- setGain() 메서드로 실시간 조절
- 원본 stream은 mic level meter에 사용 (GainNode 이후가 아님)

---

## 3. 현재 코드 상태

### 전체 구현 완성도

| 영역 | 완성도 |
|------|--------|
| 1단계 홈 | ~98% |
| 2단계 회의 정보 | ~97% |
| 3단계 녹음 | ~97% |
| 4단계 Whisper | ~90% (스킵 옵션 추가, Whisper 미설치) |
| 5단계 편집 | ~97% |
| 6단계 요약 | ~97% |
| 7단계 전송 | ~97% |
| 히스토리 | ~97% |
| 설정 | ~95% |
| 다크모드 | ~95% |

### 커밋 이력

| 커밋 | 내용 |
|------|------|
| `b03da01` | Initial commit: Sprint 2 |
| `437b568` | Sprint 3+4 + 다크모드 + QA 15건 |
| `3f8747f` | QA 16건 + 기획 변경 + 요약 저장 API |
| `c13ec58` | Sprint 5 + QA 27건 + Web Speech 안정화 |
| `5426c9c` | QA 전수조사 37건 + 기획 변경 6건 + 버그 7건 + 코드 정리 10건 |
| `47027ca` | 기획 변경 12건 + 핸드오프 누락 5건 + block_id 동기화 + 하단 네비 통합 |

---

## 4. 배포 상태

| 항목 | URL |
|------|-----|
| GitHub | https://github.com/YOHARUYO/myfirstapp |
| ngrok | https://schilling-parka-unclad.ngrok-free.dev (세션 유지 시) |
| 로컬 프론트 | http://localhost:5173 |
| 로컬 백엔드 | http://localhost:8000 |

---

## 5. 다음 세션에서 확인할 것

### 즉시
- 브라우저에서 전체 플로우 재검증 (특히 FAB, 하단 네비, 키보드 명령어, block_id 동기화)
- 마이크 민감도 슬라이더 실제 동작 확인

### 추후
- Whisper 설치 + 4단계 실제 테스트 (MacBook 배포 시)
- MacBook 크로스 플랫폼 배포 확인
