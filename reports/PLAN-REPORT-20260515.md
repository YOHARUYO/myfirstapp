# 기획 업무 보고서 — 2026-05-15

> 작성 주체: 기획 세션
> 대상 기간: 2026-05-15 (열 번째 기획 세션)
> 이전 보고서: `reports/PLAN-REPORT-20260514.md`
> 상태: **최종**

---

## 1. 오늘 수행한 작업 요약

| 카테고리 | 건수 | 요약 |
|---------|------|------|
| 현재 코드·QA 문서 진단 | 1건 | `audio_service.py` + QA-AUDIO-MERGE-LOSS 1/2 정독 → resume 한계 구조 정확히 파악 |
| 기존 데이터 스캔 (읽기 전용) | 1건 | 34개 세션 중 다중녹음 이력 2건 식별 + EBML 시그니처로 segment 경계 실증(노이즈 0) |
| 기획 결정 — 저장구조 + 병합 방법 | 1건 | 1-C(평탄 유지+EBML 분할) + 2-A(segment별 raw concat→ffmpeg concat filter) 확정 |
| 리스크 검토 (PM 요청) | 2건 | 1-A 리스크 9건 정리 → 스캔이 1-C 도출 → 1-C 숨은 리스크(R6′·R3·R4) 정직하게 제시 |
| 기획 문서 갱신 | 2건 | `decisions.md`(7단계 다중녹음 통합 절 신규) + `technical-design.md`(4-5절 오디오 병합 전면 재작성 + 4곳 보강) |
| 개발 핸드오프 작성 | 1건 | `reports/PLAN-DEV-HANDOFF-20260515.md` (QA-FIX-3 제안을 대체) |
| HANDOVER.md 갱신 | 1건 | 8·10절 전달 사항 등록 + 미구현 표 + 정보 박스 + working tree 현황 |
| 자동 메모리 갱신 | 4건 | project_status 갱신 + user_profile 보강 + feedback 신규 + MEMORY.md 인덱스 |
| 리포트 + 인수인계 | 1건 | 본 리포트 + PLAN-SESSION-RESUME-20260515.md |

---

## 2. 변경된 파일 목록

| 파일 | 변경 유형 | 상세 |
|------|----------|------|
| `decisions.md` | 수정 (1절 신규) | 7단계에 "녹음 파일 — 다중 녹음 통합 단일 파일 (2026-05-15)" 절 추가 (사용자 가시 동작) |
| `technical-design.md` | 수정 (5곳) | 4-5절 오디오 병합 전면 재작성(EBML 분할+segment concat+R6′+R3 의사명세) + WebM 무결성 노트 갱신 + recording_gaps 설명 보강 + export-audio API 2곳 + 병합 원칙 4번 신규 |
| `HANDOVER.md` | 수정 (6곳) | 8절 정보박스(working tree+resume 한계 상태) + 미구현 표 + 8·10절 기획→개발 전달 + 검수→개발 잠재항목 |
| `reports/PLAN-DEV-HANDOFF-20260515.md` | 신규 | 개발 상세 명세 (1-C+2-A 구현, R6′·R3·R4 정밀, multi-segment 필수 검증, 기존 2건 보너스) |
| `reports/PLAN-REPORT-20260515.md` | 신규 | 본 리포트 |
| `reports/PLAN-SESSION-RESUME-20260515.md` | 신규 | 다음 기획 세션 인수인계 |
| **자동 메모리** | | |
| `memory/project_status.md` | 수정 | 05-15 시점 갱신 — resume 한계 기획 결정 완료 + 기존 2건 정보 |
| `memory/user_profile.md` | 수정 | "추천안 리스크 선제 요구" 패턴 보강 |
| `memory/feedback_readonly_no_confirm.md` | 신규 | 읽기 전용+흐름상 필요 작업은 confirm 없이 진행 |
| `memory/MEMORY.md` | 수정 | project_status 줄 갱신 + feedback 신규 등록 |

---

## 3. 주요 결정/변경 사항

### 3.1 한 세션 다중 녹음 통합 단일 파일 — 사용자 가시 동작

녹음이 여러 번 나뉘어도(일시중단→재개) 다운로드 결과물은 **시간 순 단일 파일 1개**. 미리 합치지 않고 다운로드 누른 시점 lazy 통합(이후 캐시). 첫 다운로드 대기는 진행 표시로 안내.

### 3.2 저장구조 1-C + 병합 2-A (확정)

| 항목 | 결정 | 핵심 사유 |
|------|------|----------|
| 저장구조 | 1-C: 평탄 유지 + EBML 시그니처(`1A45DFA3`) segment 자동 분할 | `audio.py` 무변경. segment 경계를 클라 신호가 아닌 바이너리에서 → R1·R2 소멸. 34개 세션 스캔 노이즈 0 실증 |
| 병합 | 2-A: 단일=기존 raw concat / 멀티=segment별 raw concat→ffmpeg concat **filter** | concat demuxer는 EBML 경계 못 넘음(1차 fix 실증). filter는 디코딩 후 재인코딩이라 안전 |
| 기존 손상 2건 | 명세는 신규 동작 중심, 기존은 보너스 복구(필수 검증 아님) | PM 결정 |

**스캔 핵심 수확**: 단순 피해 규모 파악(2건)을 넘어, EBML 시그니처로 평탄 구조에서도 segment 경계가 정확히 검출됨이 드러나 **1-C라는 더 나은 설계를 도출**. 1-A(sub-디렉토리) 원안 대비 리스크가 저장구조→병합로직으로 이동하며 감소.

### 3.3 1-C의 정직한 리스크 (PM 요청으로 명시)

- **R6′ (가장 놓치기 쉬움)**: multi-segment는 재인코딩이라 결과 크기가 청크 총합과 1:1 아님 → 기존 손상판정(`< total*0.5`)을 그대로 쓰면 정상본을 손상으로 오판 → **무한 재병합 루프**. segment 개수로 분기 + ffprobe duration 기준 필수.
- **R3**: 2번째+ segment 블록·Whisper에 timestamp offset 미가산 시 5단계 블록 순서 회귀. `recording_gaps` 활용.
- **R4**: ffmpeg concat filter도 silent failure 가능 — exit code 외 출력 검증 필수.
- 결론: "1-C가 장점만 있는가? 아니오. 저장구조 리스크를 없애는 대신 병합로직 리스크를 명세로 정밀 처리할 것을 요구. 단 R6′·R3·R4는 1-A를 골라도 동일하므로 1-C가 여전히 우월."

### 3.4 기존 손상 데이터 2건 (스캔 결과)

| 세션 | 회의 | chunks | EBML 경계 | 비고 |
|------|------|--------|----------|------|
| `session_20260511_823c8751` | "260000 전략 회의 메모" (05-11, ~25분) | 302 | `[0, 34]` | 회의 본체가 seg2. merged 80K 손상. 최상 검증 케이스 |
| `session_20260423_4286be01` | "260423(수) 데이터 분석 회의" (04-23, ~5분) | 57 | `[0, 13]` | merged 없음 |

1-C는 평탄+EBML이라 별도 코드 없이 같은 경로로 보너스 복구 가능.

---

## 4. 전달 사항

### 개발 세션에 전달

- **`reports/PLAN-DEV-HANDOFF-20260515.md`** (🔴 High) — resume 자주 발생. 단일 녹음 회귀 무손이 최우선, multi-segment 신규가 핵심, R6′ 무한 재병합 차단이 함정. QA-AUDIO-2 working tree 분 위에 얹는 것 전제(충돌 주의).

### 검수 세션에 전달

- 개발 반영 후: multi-segment 신규 시나리오(녹음→일시중단→재개→추가→다운로드 재생=두 녹음 합 + 5단계 블록 순서) + R6′ 무한 재병합 미발생 + 단일 녹음 byte-identical 회귀 중점.
- 보너스: `session_20260511_823c8751` 자동 복구 시 25분 전체 재생 확인.

---

## 5. 다음 세션에서 확인할 것

- [ ] PLAN-DEV-HANDOFF-20260515 개발 반영 완료 확인
- [ ] multi-segment 신규 검증 + R6′ 무한 루프 미발생 확인
- [ ] 05-14분 사용자 실증 검증(신규 다운로드 + `session_20260513_919435a7` 자동 복구) 결과
- [ ] working tree 일괄 커밋 진행 여부 (3분할 권장: 05-14 핸드오프 / QA-AUDIO 1+2 squash / 05-15 기획 결정)
- [ ] 이슈 3 PoC 진행 의향 (Whisper.wasm) — [[project-issue3-pending]]
- [ ] 잔여 🟡 5건 처리 방향
