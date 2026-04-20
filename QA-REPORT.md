# 개발 검수 보고서

> 작성일: 2026-04-17
> 작성자: 개발 검수 세션
> 목적: 개발 검수 결과 및 미해결 항목을 기록하여 다음 세션에서 이어갈 수 있도록 함

---

## 1. 검수 범위

| 대상 | 범위 | 기준 문서 |
|------|------|----------|
| Sprint 1 (기반 구조) | 백엔드 구조, 프론트엔드 세팅, 데이터 모델 | technical-design.md |
| Sprint 2 (핵심 플로우) | Home, MeetingSetup, Recording + hooks/stores/api | decisions.md, technical-design.md |
| 디자인 시스템 v2 | 색상 토큰, 타이포, 컴포넌트 스타일 | design-system.md |
| 사용자 버그 수정 | 중복 기록 버그 2건 | useWebSpeech.ts |

---

## 2. 검수 진행 경과

### 1차 검수 — 설계 대비 불일치 발견

기획 문서(decisions.md, technical-design.md, design-system.md) 기준으로 전수 검사.
**11건 불일치/누락 발견** → 개발 세션에 수정 프롬프트 전달.

| # | 항목 | 심각도 |
|---|------|--------|
| 1 | Recording.tsx — 회의 정보 요약 영역 누락 | ❌ 불일치 |
| 2 | Recording.tsx — 중요도 바 클릭 팝오버 미구현 | ❌ 불일치 |
| 3 | Recording.tsx — 편집 진입이 싱글클릭 (설계: 더블클릭) | ❌ 불일치 |
| 4 | Recording.tsx — recording 중 다음 단계 버튼 활성화 | ⚠️ 부분 |
| 5 | MeetingSetup.tsx — 장소 inline creation 누락 | ⚠️ 부분 |
| 6 | MeetingSetup.tsx — 파일 업로드 서버 전송 TODO | ⚠️ 부분 |
| 7 | contacts.py — PATCH 엔드포인트 누락 | ⚠️ 부분 |
| 8 | settings.py — AppSettings 모델 미활용 | ⚠️ 부분 |
| 9 | useAudioStream.ts — audioBitsPerSecond 누락 | ⚠️ 부분 |
| 10 | TagInput.tsx — v1 스타일 잔류 | ⚠️ 부분 |
| 11 | types/index.ts — Meeting 타입 필드 누락 | ⚠️ 부분 |

### 2차 검수 — 수정 확인 + 전체 오류 스캔

- **11건 전부 수정 완료 확인 (11/11)**
- **사용자 수정 중복 기록 버그 2건 검증 완료** (abort() + forceFinalize() 패턴 — 견고함)
- **전체 코드베이스 오류/위험 스캔 실시** → 아래 미해결 항목 발견

---

## 3. 완료된 항목 (수정 확인됨)

### 설계 불일치 수정 (11/11 완료)

- ✅ Recording.tsx — 회의 정보 요약 영역 (접기/펼치기, 편집, PATCH on blur)
- ✅ Recording.tsx — 중요도 바 클릭 → 가로 4색 팝오버
- ✅ Recording.tsx — 편집 진입 onDoubleClick으로 변경
- ✅ Recording.tsx — 다음 단계 버튼 post_recording에서만 활성
- ✅ MeetingSetup.tsx — 장소 inline creation (addLocation API)
- ✅ MeetingSetup.tsx — 파일 업로드 서버 전송 (uploadAudioFile)
- ✅ contacts.py — PATCH participants/{id}, locations/{id}
- ✅ settings.py — AppSettings Pydantic 모델 활용
- ✅ useAudioStream.ts — audioBitsPerSecond: 128000
- ✅ TagInput.tsx — bg-bg-subtle + focus-within:ring-2 (v2)
- ✅ types/index.ts — SlackSentInfo 인터페이스 + merged_audio_path

### 사용자 버그 수정 (2/2 검증됨)

- ✅ 문장 중복 기록 → abort() + forceFinalize() idempotent 패턴
- ✅ 녹음 중지 시 중복 → stop()에서 forceFinalize() 후 abort()

---

## 4. 미해결 항목 — 개발 세션에 전달 완료

2차 검수에서 발견된 오류/위험 항목. 수정 프롬프트를 개발 세션에 전달한 상태이나, **아직 수정 미확인**.

### 🔴 즉시 수정 (핵심 기능 영향)

| # | 파일 | 이슈 | 영향 |
|---|------|------|------|
| 1 | Recording.tsx ~186행 | AudioContext 리소스 누수 — close() 미호출 | 반복 녹음 시 브라우저 리소스 고갈 |
| 2 | Recording.tsx ~315행 | 녹음 재개 시 mic level 미시작 + try-catch 없음 | 재개 후 레벨 미터 멈춤, 실패 시 크래시 |
| 3 | Recording.tsx ~328행 | handleNext에서 stop 후 즉시 disconnect → 마지막 청크 유실 | 녹음 마지막 ~5초 오디오 손실 |
| 4 | Recording.tsx ~105행 | 참여자 변경 시 saveMetadata 미호출 | 참여자 수정이 서버에 저장 안 됨 |

### 🔴 Sprint 3 전 수정 (안정성)

| # | 파일 | 이슈 | 영향 |
|---|------|------|------|
| 5 | audio.py ~122행 | 파일 업로드 시 전체 메모리 로드 후 크기 검증 | 대용량 파일 → 서버 OOM |
| 6 | audio.py ~37행 | WebSocket 핸들러 동기 파일 I/O 블로킹 | 이벤트 루프 블로킹 |
| 7 | audio.py ~50행 | session.json 동시 쓰기 race condition | 블록 유실 가능 |
| 8 | contacts/templates/sessions | 타임스탬프 기반 ID — 같은 초 내 충돌 | 데이터 덮어쓰기 |
| 9 | sessions.py ~131행 | complete_session에서 duration_seconds 미계산 | 히스토리 소요 시간 항상 null |
| 10 | audio.py ~129행 | 업로드 시 audio_chunks_dir에 파일 경로 저장 | Sprint 3 Whisper 처리 시 오류 예상 |

### 🟡 중간 위험

| # | 파일 | 이슈 |
|---|------|------|
| 11 | settings.py | GET/PATCH 응답에 API 키·토큰 평문 노출 |
| 12 | audio.py ~133행 | 업로드 응답에 서버 파일 경로 노출 |
| 13 | Toast.tsx ~13행 | onHide 인라인 함수 시 useEffect 무한 리셋 가능 |
| 14 | Recording.tsx | 중요도 팝오버에 "미지정(null)" 옵션 없음 (키보드 0키는 가능) |
| 15 | templates.py ~68행 | DELETE 시 없는 ID도 성공 응답 |
| 16 | contacts.py ~59행 | DELETE 동일 문제 |
| 17 | sessions.py ~151행 | session_id path traversal 미검증 |

### 🟢 낮은 위험 (참고)

| # | 파일 | 이슈 |
|---|------|------|
| 18 | sessions.py ~93행 | participants 타입 `list` → `list[str]` 미명시 |
| 19 | main.py ~12행 | CORS origins 하드코딩 |
| 20 | useWebSpeech.ts ~90행 | console.log 디버그 로그 잔류 |
| 21 | Recording.tsx ~225행 | 키보드 단축키 전역 등록 (모달 열려도 동작) |
| 22 | Recording.tsx ~345행 | renderItems 매 렌더마다 O(n*m) — useMemo 미적용 |
| 23 | config.py ~8행 | DATA_DIR 기본값 `"./data"` 의 `./` 불필요 |
| 24 | useWebSpeech/Recording | stale closure 위험 — 콜백 ref 패턴 미적용 |

---

## 5. 설계 일치 확인 완료 항목 (문제 없음)

### 백엔드
- ✅ 데이터 모델 6종 (Block, Session, Meeting, Template, Settings, Contacts) — 100% 일치
- ✅ CORS 설정 + 라우터 등록
- ✅ 환경 변수 로드 (python-dotenv + pathlib)
- ✅ WebSocket 프로토콜 (바이너리/텍스트 프레임 분리, chunk_ack, block_created)
- ✅ 파일 업로드 검증 (형식, 크기)
- ✅ 히스토리 조회/전문 검색
- ✅ 템플릿 CRUD
- ✅ 복구 세션 목록

### 프론트엔드
- ✅ 색상 토큰 20개 전수 검사 — hex 값 전부 일치
- ✅ 폰트 (Pretendard CDN, Inter 700 포함, JetBrains Mono)
- ✅ 라우팅 10개 페이지 일치
- ✅ TypeScript 타입 — 핵심 모델 정확 반영
- ✅ sessionStore, wizardStore 설계 일치
- ✅ useTimer, useAudioStream, useWebSpeech 핵심 로직
- ✅ WizardStepper (7단계 + 업로드 스킵 표시)
- ✅ Toast (하단 중앙, 3초, fade-out)

### 페이지별
- ✅ Home.tsx — 설계 + 디자인 시스템 거의 완벽 준수
- ✅ MeetingSetup.tsx — 템플릿 선택/토스트/하이라이트, 마이크 권한, 세그먼트 컨트롤
- ✅ Recording.tsx — 3상태 컨트롤, 블록 구조, 단축키, 재개/빈 구간, 자동 스크롤
- ✅ 4~7단계 + History + Settings — 플레이스홀더 정상

---

## 6. 참고: 패키지 버전 차이

설계 문서(technical-design.md 11절)와 실제 설치 버전이 다름. 동작에 문제없으나 문서 갱신 필요.

| 패키지 | 설계 | 실제 |
|--------|------|------|
| React | ^18.3 | ^19.2 |
| Tailwind | ^3.4 | ^4.2 (CSS-first, @theme) |
| Tiptap | ^2.1 | ^3.22 |
| Vite | ^5.0 | ^8.0 |
| React Router | ^6.20 | ^7.14 |
| Zustand | ^4.4 | ^5.0 |
| TypeScript | ^5.3 | ~6.0 |

→ **기획 세션에서 technical-design.md 11절 버전 갱신 필요** (개발→기획 전달 사항으로 기록 권장)

---

## 7. 다음 검수 세션 시작 방법

1. 이 파일(`QA-REPORT.md`)을 먼저 읽기
2. HANDOVER.md도 함께 읽어 전체 맥락 파악
3. **4절 미해결 항목** 수정 여부 확인 — 해당 파일들을 읽고 수정 완료 여부 검증
4. 수정 완료 확인 시 해당 항목을 이 문서에서 "완료" 처리
5. Sprint 3 구현이 시작되었으면, Sprint 3 산출물에 대한 신규 검수 진행

### 검수 시 첫 메시지 예시
```
QA-REPORT.md를 읽어줘. 나는 개발 검수 세션이야.
미해결 항목(4절)의 수정 여부를 확인하고, 새로 구현된 부분이 있으면 검수해줘.
```

---

## 8. 검수 원칙 (이 세션에서 확립된 기준)

- **설계 문서가 기준**: decisions.md(UX), technical-design.md(기술), design-system.md(스타일)
- **코드가 설계와 다르면 불일치**: 변경 필요 시 개발 세션이 기획 세션에 사유 설명 후 승인
- **검수 결과는 프롬프트 형태로 전달**: 개발 세션이 바로 착수할 수 있도록 파일 경로, 현재 상태, 설계 근거, 수정 방향을 명시
- **심각도 3단계**: 🔴 높음(크래시/데이터 손실) → 🟡 중간(특정 조건 오동작) → 🟢 낮음(엣지 케이스)
