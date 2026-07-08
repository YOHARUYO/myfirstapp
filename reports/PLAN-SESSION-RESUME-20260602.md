# 기획 세션 인수인계 — 2026-06-02

> 이 파일은 기획 세션 재개 시 첫 메시지로 사용

---

## 새 세션 시작 프롬프트

```
HANDOVER.md를 읽어줘. 난 이 프로젝트의 사용자이자 PM이야, 너는 기획 담당이고.
reports/PLAN-REPORT-20260602.md와 reports/PLAN-SESSION-RESUME-20260602.md도
읽고 작업 준비 해줘.

이전 기획 세션 진행 내용 (2026-06-02):
1. PM이 LLM 확장성 검토 결정 회신 — 옵션 B 채택, provider 다중(Claude/Gemini/Local/+OpenAI 선택),
   별도 fix 함께, Local 우선, 설정에서만 변경 UX
2. 슬랙 포맷 변경 4건 + prefill 신규 기능 + 추가 버그 2건(회의 제목 변경 미반영, "님 님" 중복) 결정
3. Phase 분할 확정 — 1A(LLM 추상화), 1B(슬랙·버그), 2(Local+요약·프롬프트+MacBook Whisper),
   3(Gemini), 4(OpenAI 선택)
4. 별도 발주 결정 (옵션 Y) — 1번 audio merge → 1A → 1B 순차
5. 두 핸드오프 작성 완료:
   - reports/PLAN-DEV-HANDOFF-20260602-2.md (Phase 1A) — 즉시 발주 가능
   - reports/PLAN-DEV-HANDOFF-20260602.md (Phase 1B) — Phase 1A 완료 후

미결 (가장 가까운 것부터):
- 1번 audio merge 검수 통과 + commit 대기 (PM "정상" 확인 받음)
- Phase 1A 발주 → 개발 반영 → 검수 → commit
- Phase 1B 발주 → 개발 반영 → 검수 → commit
- Phase 2 핸드오프 작성 (Local + 요약·프롬프트 + MacBook Whisper)
- 잔여 🟡 5건 / 이슈 3 PoC

이어서 기획 작업 진행해줘.
```

---

## 현재 상태 요약

| 항목 | 상태 |
|------|------|
| Sprint 1~5 | ✅ 전체 완료 |
| 05-15 resume audio 기획 결정 (1-C+2-A) | ⏳ 개발 발주 진행 중 (PM "정상" 확인) |
| 05-29 cloudflared 인프라 변경 | ✅ 완료, 실회의 검증 통과 |
| **06-01 LLM 확장성 검토** | ✅ 본문 작성 (`PLAN-REPORT-20260601.md`) |
| **06-02 PM 결정 수신 + Phase 분할 확정** | ✅ |
| **06-02 슬랙 포맷 변경 + prefill + 버그 2건 결정** | ✅ |
| **Phase 1A 핸드오프** | ✅ 작성 완료 (`PLAN-DEV-HANDOFF-20260602-2.md`) |
| **Phase 1B 핸드오프** | ✅ 작성 완료 (`PLAN-DEV-HANDOFF-20260602.md`) |
| Phase 2 핸드오프 | ⏳ 1A·1B 통과 후 작성 |
| 자동 메모리 | 미갱신 (다음 세션이 필요 시 보강) |

---

## 핵심 결정 (06-02)

### 발주 시퀀스 — 옵션 Y (별도 발주, PM 결정)

```
[현재] 1번 audio merge — 진행 중, PM "정상" 확인
   ↓ 완료 + commit
[다음] Phase 1A 발주 — PLAN-DEV-HANDOFF-20260602-2.md
   ↓ 완료 + commit  ← 다음 기획 세션 시작 시점이 이 위치이길 권장
[그 다음] Phase 1B 발주 — PLAN-DEV-HANDOFF-20260602.md
   ↓ 완료 + commit
[그 후] Phase 2 (MacBook 환경 사이클)
   ↓
[그 후] Phase 3 (Gemini) → Phase 4 (OpenAI, 선택)
```

### Phase별 작업 묶음

| Phase | 영역 | 핵심 결정 |
|-------|------|----------|
| 1A | LLM 추상화 + 모델 ID 동적 fix | services/llm/{base, claude, factory} 신규. claude_service 호환 래퍼. 설정 UI에 provider 드롭다운. 회귀 무손 |
| 1B | 슬랙 포맷 + prefill + 버그 2건 | F/U `[xxx님]` 평탄+인접정렬. 3종 메시지 thread. 1번/2번 prefill 서버 저장. IME isComposing 가드. 제목 변경 frontend 진단 |
| 2 | Local + 요약 포맷·프롬프트 + MacBook Whisper | MacBook 환경 사이클로 한 번에 |
| 3 | Gemini provider | Windows 단독 |
| 4 | OpenAI provider | 선택, 생략 가능 |

---

## 다음 할 일 (가까운 순서)

### 즉시 (다음 기획 세션 시작 시)
1. **HANDOVER.md 8·10절 갱신** — 본 세션 산출물 반영 (Phase 1A·1B 핸드오프 등록, working tree 상태)
2. **1번 audio merge 결과 확인** — 검수 통과 / commit 여부
3. **Phase 1A 발주 가능 상태 확인** — 1번 commit 완료되었는지

### Phase 1A 발주 후
4. 개발 반영 결과 수신 → 검수 발주
5. 검수 통과 → commit (메시지에 "Phase 1A" 명시)

### Phase 1B 발주 후
6. 개발 반영 결과 수신 → 검수 발주
7. 검수 통과 → commit (메시지에 "Phase 1B" 명시)

### Phase 1A·1B 모두 commit 후
8. **Phase 2 PLAN-DEV-HANDOFF 작성** — Local provider + 요약 포맷·프롬프트 + MacBook Whisper 설치
   - Phase 2의 요약 포맷이 Phase 1B에서 만진 슬랙 포맷과 다른 영역(요약 본문 vs 슬랙 표현)임 명시
   - MacBook 환경 사이클이라 PM이 MacBook 작업 시점을 결정해야 함
9. Phase 2 발주

### 잔여 항목 (보류 가능)
- 잔여 🟡 5건 처리 방향
- 이슈 3 (백엔드 호스팅) PoC — Whisper.wasm 정확도·속도
- HANDOVER.md 7-A 회수 (1주 안정 운영 후 ngrok 폐기)

---

## 잠재 회귀 모니터링

### Phase 1A 관련
- 호출처 6곳(ai.py / processing.py / history.py / sessions.py) 코드 변경 0 확인 필수
- 기본 동작(provider 미설정 또는 claude) 회귀 무손 확인
- 모델 ID 동적 fix 후 설정에서 잘못된 모델 ID 입력 시 401/404 처리 명확성

### Phase 1B 관련
- 슬랙 메시지 분할 후 첫 회의에서 thread 구조가 PM 의도대로 보이는지
- F/U 인물별 정렬이 요약 프롬프트로 처리되었는지, 후처리로 처리되었는지(개발 선택)
- 회의 제목 변경 fix의 실제 원인 — 개발이 진단 결과 보고할 것
- IME 가드 도입 후 영문 입력 회귀 미발생

### 영역 간
- Phase 1A의 claude_service 래퍼와 Phase 1B의 프롬프트 변경이 같은 파일을 다시 만짐 → 1A 완료·commit 후 1B 진행이 안전 (이미 결정됨)
- 1번 audio merge와 Phase 1A·1B 영역 완전 분리 (PLAN-REPORT-20260602 §5 매트릭스)

---

## 산출물 인덱스

| 파일 | 유형 | 발주 가능 |
|------|------|---------|
| `reports/PLAN-DEV-HANDOFF-20260515.md` | 1번 audio merge | 발주됨 |
| `reports/PLAN-DEV-HANDOFF-20260602-2.md` | Phase 1A | **즉시 발주 가능** |
| `reports/PLAN-DEV-HANDOFF-20260602.md` | Phase 1B | Phase 1A 완료 후 |
| `reports/PLAN-REPORT-20260601.md` | LLM 확장성 검토 본문 | — |
| `reports/PLAN-REPORT-20260602.md` | 06-02 결정 종합 | — |
| `reports/PLAN-SESSION-RESUME-20260602.md` | 본 인수인계 | — |

---

## 메모

- 다음 세션 시작 시 HANDOVER.md 갱신을 잊지 말 것 (8절 정보박스 + 10절 기획→개발 전달 사항에 Phase 1A·1B 핸드오프 등록 필요)
- 자동 메모리 갱신 보류 — Phase 분할 / 발주 시퀀스가 길고 변동 가능성 있어 1A·1B commit 후에 갱신이 정합
- working tree 상태: 본 세션은 코드 변경 0. reports/ 폴더에만 4개 신규 파일
