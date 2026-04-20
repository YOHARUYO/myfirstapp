# 개발 업무 보고서 — 2026-04-20

> 작성 주체: 개발 세션
> 대상 기간: 2026-04-20 (두 번째 개발 세션)
> 이전 보고서: `DEV-REPORT-20260417.md`

---

## 1. 오늘 수행한 작업 요약

이 세션은 Sprint 2 검수 완료 상태에서 시작하여, **Web Speech 안정화 + 기획 변경 반영 + Wizard 네비게이션 구현 + GitHub 업로드 준비**를 수행했습니다.

| 카테고리 | 건수 | 요약 |
|---------|------|------|
| Web Speech 안정화 | 4건 | interim 합산, 중복 블록 해결(abort 방식 확정), VB-Cable 환경 진단, 클로저 문제 해결 |
| 기획 변경 반영 | 3건 | is_edited 조건 명확화, interim 클릭 강제 확정, 싱글클릭 분할 삭제 |
| Wizard 네비게이션 | 1건 | 홈 아이콘, 이전 단계 버튼, 모달, 단계별 규칙 |
| UI 개선 | 1건 | 가로 스크롤 제거 |
| 인프라 | 1건 | GitHub CLI 설치, git 업로드 준비 |

---

## 2. 변경된 파일 목록

### 프론트엔드

| 파일 | 변경 내용 |
|------|----------|
| `src/hooks/useWebSpeech.ts` | abort 기반 중복 방지 확정, `flush()` 메서드 추가(interim 강제 확정), 진단 로그(onstart/onaudiostart/onspeechstart) |
| `src/pages/Recording.tsx` | is_edited 원본 비교 로직, 싱글클릭 분할 제거, interim 클릭→flush 연결, WizardLayout에 네비게이션 props 연결, 가로 스크롤 방지 |
| `src/components/wizard/WizardStepper.tsx` | 홈 아이콘(Home) 추가, onHomeClick/homeDisabled props |
| `src/components/wizard/WizardLayout.tsx` | 홈 확인 모달, prevRoute/prevDisabled/homeDisabled/onBeforeHome props, overflow-x-hidden |
| `src/components/common/Modal.tsx` | **신규** — 공통 모달 컴포넌트 |
| `src/pages/MeetingSetup.tsx` | prevRoute="/" 연결 |
| `src/pages/Processing.tsx` | homeDisabled, prevRoute={false} |
| `src/pages/Editing.tsx` | prevDisabled |
| `src/pages/Summary.tsx` | prevRoute="/editing" |
| `src/pages/SendSave.tsx` | prevRoute="/summary" |
| `src/index.css` | `html, body { overflow-x: hidden }` 추가 |

### 백엔드

변경 없음 (04-17 수정 상태 유지)

---

## 3. Web Speech 안정화 히스토리 (의사결정 기록)

이번 세션에서 Web Speech API 중복 블록 문제에 대해 여러 방식을 시도했으며, 최종적으로 **abort 방식**으로 확정했습니다.

| 시도 | 방식 | 결과 |
|------|------|------|
| 1 | index 추적 (abort 제거) | ❌ Chrome Web Speech가 주기적 재시작 없이는 동작 중단 |
| 2 | stop() 방식 (abort 대신) | ❌ 동일하게 인식 중단 |
| 3 | abort + ref 패턴 콜백 | ❌ HMR 좀비 인스턴스 충돌 |
| **4** | **abort 롤백 (원본 복원)** | **✅ 동작 확인** |

**결론**: Chrome Web Speech API는 `continuous: true`여도 주기적 abort+restart가 필수. 단어 누락은 이 방식의 트레이드오프이며, Whisper 후처리가 보완.

### VB-Cable 테스트 환경 주의사항
- Chrome 출력 장치를 **CABLE Input**으로 변경해야 함 (Windows 볼륨 믹서에서 Chrome 앱별 설정)
- 변경 후 **Chrome 완전 재시작** 필요 (탭 새로고침만으로는 부족)
- 포트 변경(5173→5174) 시 마이크 권한 재부여 필요

---

## 4. 현재 코드 상태

### 구현 완료 (3개 페이지 + 백엔드 API)

| 페이지 | 완성도 | 비고 |
|--------|--------|------|
| 1단계 홈 | ~95% | 복구 "이어가기" 라우팅만 연결 |
| 2단계 회의 정보 | ~95% | 파일 업로드 서버 전송 구현 완료 |
| 3단계 녹음 | ~90% | 회의 정보 패널, 중요도 팝오버, interim 강제 확정, 마이크 레벨 |

### Wizard 네비게이션 구현 상태

| 기능 | 상태 |
|------|------|
| 홈 아이콘 (Stepper 좌측) | ✅ |
| 홈 확인 모달 | ✅ |
| 녹음 중 홈 이동 모달 | ✅ |
| 4단계 홈 비활성 | ✅ |
| 이전 단계 버튼 | ✅ (prevRoute prop) |
| 6→5→6 재요약 모달 | ❌ (Sprint 4에서 6단계 구현 시) |
| 브라우저 뒤로가기 동기화 | ❌ (Sprint 5) |

### 미구현 (placeholder)

4~7단계, History, Settings — Sprint 3/4/5에서 구현 예정

---

## 5. 다음 세션에서 해야 할 일

### 즉시: GitHub 업로드
1. `gh auth login` (GitHub CLI 로그인)
2. `git init` + 첫 커밋
3. `gh repo create` → 리포지토리 생성
4. `git push`

### 이후: Sprint 3 착수
1. `backend/services/audio_service.py` — ffmpeg 청크 병합
2. `backend/services/whisper_service.py` — Whisper 실행
3. `backend/services/merger_service.py` — 블록 병합
4. `backend/routers/processing.py` — 4단계 API
5. `frontend/src/pages/Processing.tsx` — 4단계 UI
6. `backend/services/claude_service.py` — AI 태깅
7. `frontend/src/pages/Editing.tsx` — 5단계 편집

---

## 6. 알아둘 사항

### dev server 실행
```bash
cd backend && python -m uvicorn main:app --reload --port 8000
cd frontend && npm run dev
```

### VB-Cable 테스트 절차
1. Windows 볼륨 믹서 → Chrome 출력을 CABLE Input으로
2. Chrome 완전 재시작
3. YouTube 영상 탭 먼저 열고 재생
4. localhost:5173 탭에서 녹음 시작

### 검수 세션 운영
- 별도 검수 세션이 코드를 문서 기준으로 전수 검사
- 1차 검수(11건) + 2차 검수(17건) 모두 수정 완료
- 다음 검수는 Sprint 3 완료 후
