# 기획 세션 인수인계 — 2026-05-15

> 이 파일은 기획 세션 재개 시 첫 메시지로 사용

---

## 새 세션 시작 프롬프트

```
HANDOVER.md를 읽어줘. 난 이 프로젝트의 사용자이자 PM이야, 너는 기획 담당이고.
reports/PLAN-REPORT-20260515.md와 reports/PLAN-SESSION-RESUME-20260515.md도 읽고 작업 준비 해줘.

이전 기획 세션 진행 내용 (2026-05-15):
1. resume·복구 audio 한계(한 세션 두 번 녹음 시 후반부 손실) 기획 결정 완결
2. 기존 데이터 스캔 → 다중녹음 손상 2건 식별 + EBML 시그니처로 1-C 설계 도출
3. 저장구조 1-C(평탄+EBML 분할) + 병합 2-A(segment concat) 확정, 리스크 R6′·R3·R4 정직하게 정리
4. decisions.md / technical-design.md 반영 + PLAN-DEV-HANDOFF-20260515 작성
5. 자동 메모리 갱신 + 리포트 작성

미결: 핸드오프 개발 반영 / 05-14분 사용자 실증 검증 / working tree 커밋 / 이슈 3 PoC

이어서 기획 작업 진행해줘.
```

---

## 현재 상태 요약

| 항목 | 상태 |
|------|------|
| Sprint 1~5 | ✅ 전체 완료 |
| 기획 문서 동기화 | ✅ 05-15 기준 최신 (decisions.md 7단계 / technical-design.md 4-5절) |
| resume 한계 기획 결정 | ✅ 완료 (1-C + 2-A 확정) |
| PLAN-DEV-HANDOFF-20260515 | ⏳ 개발 반영 대기 (🔴 High) |
| 05-14 핸드오프/QA-AUDIO | ✅ working tree 반영, 사용자 실증 검증 + 커밋 대기 |
| 이슈 3 (백엔드 호스팅) | 🟡 보류 + PoC 별도 진행 의향 |
| 자동 메모리 | ✅ 05-15 갱신 (project_status / user_profile / feedback 신규) |

## 핵심 결정 (05-15)

**한 세션 다중 녹음 통합 단일 파일** — `reports/PLAN-DEV-HANDOFF-20260515.md`

- 저장구조 **1-C**: 청크 평탄 구조 유지(`audio.py` 무변경) + 청크 첫 4바이트 EBML 시그니처(`1A45DFA3`)로 segment 자동 분할. segment 경계의 진실의 원천 = 바이너리.
- 병합 **2-A**: 단일 segment=기존 raw concat(검증 경로 무손) / 멀티=segment별 raw concat→ffmpeg concat **filter**(재인코딩) 단일 webm. mp3는 결과 변환.
- 정밀 처리 3건:
  - **R6′**: multi-segment 손상판정은 크기 비교 폐기→ffprobe duration. 안 그러면 **무한 재병합 루프**(가장 큰 함정).
  - **R3**: 2번째+ segment 블록·Whisper에 timestamp offset 가산(`recording_gaps` 활용).
  - **R4**: ffmpeg silent failure — exit code 외 출력 검증 필수.
- 기존 손상 2건(`session_20260511_823c8751` 25분 전략회의 / `session_20260423_4286be01` 5분): 1-C라 보너스 복구 가능. **명세는 신규 중심, 기존은 보너스(필수 검증 아님)** — PM 결정.

> 왜 1-A(sub-디렉토리)가 아니라 1-C인가: 스캔에서 EBML 시그니처가 평탄 구조에서도 segment 경계를 노이즈 0으로 검출 실증 → `audio.py` 무변경 + 클라 신호 불필요 + 기존 데이터 같은 코드 복구. 리스크가 저장구조→병합로직으로 이동하며 감소(단 "더 쉽다"는 아님 — R6′·R3·R4 정밀 처리 조건부).

## 기획→개발 전달 사항

**[2026-05-15] 한 세션 다중 녹음 통합 단일 파일**: `reports/PLAN-DEV-HANDOFF-20260515.md` — ⏳ 개발 반영 대기 (🔴 High)

이전 전달 사항 (모두 반영 완료):
- 05-14 PLAN-DEV-HANDOFF -1/-2 ✅ (working tree)
- 05-07 이전 8건 ✅

## 미결 논의 사항

### 이슈 3 (백엔드 호스팅 전환) — 보류 유지

PoC(Whisper.wasm small/tiny 정확도·속도) 별도 진행 의향. 상세: [[project-issue3-pending]] / `memory/project_issue3_pending.md`. LLM 어댑터 추상화도 동시 보류(로컬 LLM 도입 시점).

### 잔여 🟡 5건

Part D 2 / 환경 의존 2 / 미리보기 1 — 우선순위 낮음, 사용자 실사용 피드백 대기.

## 다음 할 일

1. PLAN-DEV-HANDOFF-20260515 개발 반영 완료 확인 (개발 세션 작업 후)
2. multi-segment 신규 검증 + R6′ 무한 루프 미발생 (검수 세션)
3. 05-14분 사용자 실증 검증 결과 (신규 다운로드 + `session_20260513_919435a7` 자동 복구)
4. working tree 일괄 커밋 (3분할 권장: 05-14 핸드오프 / QA-AUDIO 1+2 squash / 05-15 기획 결정)
5. 이슈 3 PoC 진행 의향 재확인
6. 잔여 🟡 5건 처리 방향
