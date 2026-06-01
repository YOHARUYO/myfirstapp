# 기획 업무 보고서 — 2026-05-29

> 작성 주체: 기획 세션
> 대상 기간: 2026-05-29 (열한 번째 기획 세션, 단일)
> 이전 보고서: `reports/PLAN-REPORT-20260515.md`
> 상태: **최종** (개발 반영 완료 + 자동/로컬/외부 접속 검증 통과. 다음 주 실회의 검증만 대기)

---

## 1. 오늘 수행한 작업 요약

| 카테고리 | 건수 | 요약 |
|---------|------|------|
| **검수→기획 ngrok 차단 진단 수신** | 1건 | `reports/QA-TO-PLAN-NGROK-REPLACE-20260529.md` 정독 — ngrok 무료 플랜 bandwidth 차단(외부 접속 15초 timeout), Cloudflare Quick Tunnel 권장, 코드 변경 거의 0건 사전 확인, PM 확정 3건(5절) + 기획 결정 요청 5건(6절) + 권장 명세(7절) 구조 파악 |
| **기획 세션 사전 확인** | 3건 | `backend/main.py`(CORS·`/api/health` 라우트), `frontend/vite.config.ts`(`allowedHosts: true` + `/api` proxy + `ws: true`), `memory/project_ngrok_demo.md` 정독 → 코드 변경 범위 정확히 가늠 |
| **6절 5건 PM 결정 확정** | 5건 | ①.env 단일자격+/api/health 공개(보안 안전 확인) / ②수동 기동(터미널 3개)+절전 안내 / ③HANDOVER 신규 절 / ④cloudflared 메모리 신규+ngrok 삭제 / ⑤1주 보존 후 폐기, 회의 데이터(backend/data/) 무관 보존 |
| **검수 보고서 보완** | 1건 | 검수 7-B는 백엔드 Basic Auth만 명시했으나 cloudflared가 5173만 가리키므로 **Vite에도 Basic Auth 필수** → 양쪽 모두 적용으로 핸드오프에 보강 |
| **개발 핸드오프 작성** | 1건 | `reports/PLAN-DEV-HANDOFF-20260529.md` (배경·결정·코드 상태·수정 명세 4.1~4.6·검증 시나리오·영향 범위·작업 순서·메모리 갱신 항목) |
| **HANDOVER.md 갱신** | 1건 | 8절 정보박스 + 8·10절 기획→개발 / 검수→개발 전달 사항 등록 |
| **개발 세션 발주** | 1건 | PM이 핸드오프 복붙 메시지로 개발 세션 시작 → 동일 세션 내 반영·검증 통과 보고 수신 |
| **개발 반영 결과 수신 + 리포트 갱신** | 1건 | `reports/DEV-REPORT-20260529.md` 수신: 명세 그대로 + A 보조 변경(vite가 backend/.env 자동 로드) + 자동/로컬/외부 접속 검증 통과. HANDOVER 8·10절 + 메모리 갱신 |

---

## 2. 변경된 파일 목록

| 파일 | 변경 유형 | 상세 |
|------|----------|------|
| `reports/PLAN-DEV-HANDOFF-20260529.md` | 신규 | 개발 상세 명세 (코드 2곳 + cloudflared 설치 + 운영 절차 + 메모리 갱신 + 비변경 항목 명시) |
| `reports/PLAN-REPORT-20260529.md` | 신규 | 본 리포트 |
| `reports/PLAN-SESSION-RESUME-20260529.md` | 신규 | 다음 기획 세션 인수인계 |
| `HANDOVER.md` | 수정 (4곳) | 8절 정보박스(05-29 개발 반영 완료 + 다음 검수 액션 갱신) + 8/10절 기획→개발 + 8/10절 검수→개발 |
| `memory/project_status.md` | 수정 (예정) | 05-29 시점으로 갱신 — cloudflare 작업 완료 + 실회의 검증 대기 |
| `memory/MEMORY.md` | 수정 (예정) | project_status 한 줄 갱신 |

> 개발 세션 산출물(`backend/main.py` 미들웨어 / `frontend/vite.config.ts` 미들웨어 + dotenv 로더 / `backend/.env` / 7-A절 / `memory/project_cloudflared_demo.md` 신규 / `memory/project_ngrok_demo.md` 삭제 / `reports/DEV-REPORT-20260529.md`)는 동일 working tree에 함께 있음. 기획·개발 산출물 단독 커밋 권장(인프라 변경, 다른 fix와 묶지 말 것).

---

## 3. 주요 결정/변경 사항

### 3-1. 인프라 도구 교체 — ngrok → Cloudflare Quick Tunnel

| 항목 | 결정 | 사유 |
|------|------|------|
| 터널 도구 | Cloudflare Quick Tunnel (`*.trycloudflare.com` 임시 URL) | ngrok 1:1 대체 + **무제한 대역폭**(차단 재발 없음) + 계정·소유 도메인 불필요 + WS/HTTPS 정식 지원 |
| 인증 | HTTP Basic Auth **Vite + 백엔드 양쪽** | Quick Tunnel은 Cloudflare Access 미지원(유료). cloudflared가 5173만 가리키므로 Vite 인증 없으면 frontend asset 무인증 노출 — **검수 보고서가 백엔드만 명시한 부분을 기획에서 보강** |
| 자격증명 | `backend/.env` 단일 1쌍 (`BASIC_AUTH_USER`/`BASIC_AUTH_PASSWORD`) | 기존 `.env` 패턴. 시연자 1인(PM)이라 단일 충분. 16자+ 무작위 비밀번호 |
| 헬스체크 | `/api/health`만 인증 예외 | cloudflared/외부 헬스체크 필요. `{"status":"ok"}`뿐이라 정보 노출 0 |
| 운영 | 회의 30분 전 수동 기동 (터미널 3개) + Windows 절전 차단 안내 | 외부 공격면 최소화. 기존 ngrok 운영 패턴 유지 |
| 운영 매뉴얼 위치 | HANDOVER.md 신규 절 | 짧음(설치 1회 + 절차 3단계). 새 세션 자동 로드 문서에 두어 누락 방지 |
| 메모리 | `project_cloudflared_demo.md` 신규 + `project_ngrok_demo.md` 삭제 | 슬러그 이름이 실제 도구와 일치해야 의미 명확 |
| ngrok 정리 | 1주 보존 후 폐기 | 안정성 검증 전 폴백 보유. 무료 플랜이라 보존 비용 0 |
| 회의 데이터 | `backend/data/` 전부 보존 | ngrok과 무관. PM 명시 |

### 3-2. 보안 검증 (PM 확인 완료)

- cloudflared 자동 HTTPS/TLS → Basic Auth 자격증명은 헤더가 TLS로 암호화 전송. 평문 노출 없음
- `/api/health`는 민감 정보 0. 외부 봇이 발견해도 다른 경로는 401로 차단
- 16자+ 무작위 비밀번호 → brute force 실효성 없음
- 결론: 본 구성은 임시 외부 노출 환경에 적합한 최소 안전 구성

### 3-3. 검수 보고서 보완점 (기획 세션 추가 발견)

- 검수 보고서 §7-B는 "백엔드 Basic Auth"만 명시
- 그러나 frontend HTML/JS/CSS는 Vite가 직접 서빙(백엔드 거치지 않음) → 백엔드 인증만으로는 페이지 무인증 노출
- 핸드오프에서 **Vite + 백엔드 양쪽 모두 Basic Auth** 적용으로 명세
- WebSocket 핸드셰이크는 첫 HTTP 요청이라 같은 미들웨어가 처리 + 브라우저는 같은 origin이면 자격증명 자동 첨부 → §5.2 #5에서 필수 검증

### 3-4. 🟡 A 보조 변경 — 개발 단계 PM 결정 갱신

- 핸드오프 §4.6 본체는 "환경변수 export 후 백엔드/프론트 기동"(순수 수동) 권장
- 개발 Step 2 통과 직후 PM이 갱신 결정: **Vite가 `backend/.env`를 fs로 직접 로드** (의존성 0, 5줄 KEY=VALUE 파서, ESM `import.meta.url`로 path 해석)
- 효과: 매 회의 export 절차 제거 + 비밀번호가 터미널 history에 미잔여 + backend(dotenv)/frontend(fs) 양쪽이 같은 `backend/.env` 단일 source of truth
- 위험: 거의 없음(모노레포 구조 path 의존 외)
- **HANDOVER 7-A절은 A 적용 반영하여 CMD 친화 명령으로 작성됨**

### 3-5. HANDOVER.md 7-A 신설 — 절 번호 재정렬 회피

- 핸드오프 §4.6은 "7절 알려진 제약 인접에 신규 절 추가"라 함
- 그대로 8절로 추가 시 8~12절 번호 재정렬 필요(diff 큼) → **7-A**로 신설하여 8~12절 무변경 (개발 세션 판단)

---

## 4. 검증 결과 (개발 세션 보고 반영)

### 4-1. 통과 ✅
- §5.3 #8·#10·#11 curl probe — 401/200/인증통과 모두 명세대로
- §5.1 #1·#2·#3 로컬 회귀 — Basic Auth 프롬프트 + 기존 기능(녹음/다운로드/Slack/히스토리/설정)
- A 적용 후 frontend 재기동 (env export 없이 단순 `npm run dev`)
- §5.2 #4 — cloudflared 발급 URL을 MacBook에서 접속 → Basic Auth → 홈 렌더

### 4-2. 대기 ⏳ — 다음 주 1시간 실회의 (PM 자체 진행)
- §5.2 #5 — MacBook WebSocket chunk 누락 0건 (**가장 중요**, 회의 중 전사 블록 끊김 없음)
- §5.2 #6 — 녹음 다운로드 50MB+ 정상 재생 (cloudflare streaming 한계)
- §5.2 #7 — MacBook Slack 전송 + MD 첨부 정상
- §5.4 #12 — cloudflared 종료 후 외부 접속 불가 확인

---

## 5. 전달 사항

### 개발 세션에 전달
- 본 핸드오프 반영 완료. 추가 변경 없음. 다음 주 실회의 검증 결과는 PM이 직접 확인 후 다음 개발 세션에 전달

### 검수 세션에 전달
- 본 인프라 변경은 자동/로컬/외부 접속까지 통과. 실회의 검증 결과에 따라 검수 추가 진행 여부 결정
- WS 핸드셰이크가 Vite+백엔드 양쪽 인증 통과해야 한다는 점이 핵심 — 회의 중 chunk 누락이 보고되면 가장 먼저 의심

### PM에 전달 (1주 후 회수 항목)
- 실회의 1주 운영 안정성 확인 후 ngrok 계정·터널 폐기
- 본 회수 시 다음 기획 세션이 PLAN-REPORT-2026MMDD에 결과 반영

---

## 6. 다음 세션에서 확인할 것

- [ ] 다음 주 실회의 검증 결과 수신 (§5.2 #5~7 + §5.4 #12)
- [ ] 1주 후 ngrok 폐기 (PM 직접) → 본 결정의 §11 회수
- [ ] PLAN-DEV-HANDOFF-20260515 (resume·복구 audio) 개발 반영 — 🔴 High, 본 인프라 작업과 독립적이라 병행 가능
- [ ] working tree 일괄 커밋 (4분할 권장: 05-14 PLAN-HANDOFF -1/-2, QA-AUDIO 1+2 squash, 05-15 기획 결정, 05-29 cloudflared)
- [ ] 잔여 🟡 5건 처리 방향 (Part D 2 / 환경 의존 2 / 미리보기 1)
- [ ] 이슈 3 (백엔드 호스팅) PoC 진행 의향 — `memory/project_issue3_pending.md`
