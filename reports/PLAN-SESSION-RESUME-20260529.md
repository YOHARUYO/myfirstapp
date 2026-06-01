# 기획 세션 인수인계 — 2026-05-29

> 이 파일은 기획 세션 재개 시 첫 메시지로 사용

---

## 새 세션 시작 프롬프트

```
HANDOVER.md를 읽어줘. 난 이 프로젝트의 사용자이자 PM이야, 너는 기획 담당이고.
reports/PLAN-REPORT-20260529.md와 reports/PLAN-SESSION-RESUME-20260529.md도 읽고 작업 준비 해줘.

이전 기획 세션 진행 내용 (2026-05-29):
1. 검수→기획 ngrok 차단 진단 수신 (QA-TO-PLAN-NGROK-REPLACE-20260529)
2. 6절 5건 PM 결정 확정 + 검수 보고서 보완(Vite Basic Auth)
3. PLAN-DEV-HANDOFF-20260529 작성 → 개발 세션 발주
4. 개발 반영 완료 수신: 명세 + A 보조 변경(vite가 backend/.env 자동 로드) + 자동/로컬/외부 접속 검증 통과
5. HANDOVER.md / PLAN-REPORT / 본 RESUME / 메모리 갱신

미결 (가장 가까운 것부터):
- 다음 주 실회의 검증 결과 수신 (§5.2 #5~7 + §5.4 #12) — PM 자체 진행
- 1주 후 ngrok 폐기 회수 (PLAN-REPORT-2026MMDD에 결과 반영)
- PLAN-DEV-HANDOFF-20260515 개발 반영 대기 (🔴 High, 본 작업과 독립적)
- working tree 일괄 커밋 (4분할 권장)
- 잔여 🟡 5건 / 이슈 3 PoC

이어서 기획 작업 진행해줘.
```

---

## 현재 상태 요약

| 항목 | 상태 |
|------|------|
| Sprint 1~5 | ✅ 전체 완료 |
| 05-15 resume 한계 기획 결정 (1-C+2-A) | ✅ 완료, ⏳ 개발 반영 대기 (🔴 High) |
| **05-29 ngrok→cloudflared 인프라 변경 기획 결정** | ✅ 완료 |
| **05-29 개발 반영** | ✅ 완료 (자동/로컬/외부 접속 검증 통과, A 보조 적용) |
| **05-29 실회의 검증** | ⏳ 다음 주 1시간 회의로 PM 자체 진행 |
| 자동 메모리 | ✅ 05-29 갱신 (project_status + project_cloudflared_demo 신규 + project_ngrok_demo 삭제 + MEMORY 인덱스) |
| 이슈 3 (백엔드 호스팅) | 🟡 보류 + PoC 별도 진행 의향 |

## 핵심 결정 (05-29)

**ngrok → Cloudflare Quick Tunnel + Basic Auth** — `reports/PLAN-DEV-HANDOFF-20260529.md` / `DEV-REPORT-20260529.md`

- 터널: `cloudflared tunnel --url http://localhost:5173` → 임시 `*.trycloudflare.com`
- 인증: Vite + 백엔드 양쪽 Basic Auth (`backend/.env` 단일 자격). cloudflared가 5173만 가리키므로 Vite 인증 필수
- A 보조: `vite.config.ts`가 `backend/.env`를 fs로 직접 로드 → 매 회의 export 절차 제거 + 비밀번호 터미널 history 미잔여
- 운영: 회의 30분 전 수동 기동(CMD 3터미널), HANDOVER 7-A 신규 절
- 메모리: `project_cloudflared_demo.md` 신규 / `project_ngrok_demo.md` 삭제
- ngrok 폐기: 1주 안정 운영 후 (PM 직접). 회의 데이터(`backend/data/`)는 무관 보존

> **검수 보고서 보완점**: 검수 7-B는 백엔드 Basic Auth만 명시했으나 frontend asset이 무인증 노출될 수 있어 기획에서 Vite 양쪽 인증으로 보강. 향후 인프라 결정 시 frontend asset 서빙 경로도 함께 검토할 것.

## 다음 할 일

### 가까운 순서

1. **다음 주 1시간 실회의 검증** (PM 자체)
   - §5.2 #5: MacBook WebSocket chunk 누락 0건 (가장 중요)
   - §5.2 #6: 녹음 다운로드 50MB+ 정상 재생
   - §5.2 #7: Slack 전송 + MD 첨부 정상
   - §5.4 #12: cloudflared 종료 후 외부 차단 확인
   - 결과는 다음 기획 또는 개발 세션에 전달

2. **1주 후 ngrok 폐기** (PM 직접) → 다음 기획 세션이 PLAN-REPORT에 결과 반영 + 본 핸드오프 §11 회수

3. **PLAN-DEV-HANDOFF-20260515 (resume·복구 audio) 개발 반영** — 🔴 High, 본 작업과 독립적
   - multi-segment 신규(녹음→일시중단→재개→추가→다운로드 재생=두 녹음 합) + R6′ 무한 재병합 미발생

4. **working tree 일괄 커밋** (4분할 권장)
   - 05-14 PLAN-DEV-HANDOFF -1/-2 (저장 경로 폐기 + UI 회귀)
   - QA-AUDIO-MERGE-LOSS 1+2 squash (녹음 손실 근본 fix)
   - 05-15 기획 결정 (decisions/technical-design + reports)
   - 05-29 cloudflared (backend/main.py + vite.config.ts + backend/.env + HANDOVER 7-A + 메모리 + reports)

5. **잔여 🟡 5건** (Part D 2 / 환경 의존 2 / 미리보기 1) — 실회의 환경 살아난 후 환경 의존 2건 실기기 검증 가능

6. **이슈 3 (백엔드 호스팅) PoC** — Whisper.wasm small/tiny 정확도·속도 측정, PM 진행 의향

## 잠재 회귀 모니터링

- 실회의 중 chunk 누락 발생 시: WS 핸드셰이크가 Vite+백엔드 양쪽 인증 통과 못한 가능성 가장 먼저 의심
- 회의 중 cloudflared 끊김 시: Windows 절전 차단 미적용 가능성 (HANDOVER 7-A 명시) 또는 cloudflare idle WS 끊김 → 자동 재기동 스크립트 필요 여부 별도 검토
- 다음 회의 시 새 URL 공유 잊지 말 것 — 매 cloudflared 기동마다 URL 변경
