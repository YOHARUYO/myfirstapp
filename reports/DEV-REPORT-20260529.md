# 개발 업무 보고서 — 2026-05-29

> 작성 주체: 개발 세션
> 대상 기간: 2026-05-29 (열일곱 번째 개발 세션)
> 이전 보고서: `reports/DEV-REPORT-20260514.md`
> 처리한 핸드오프: `reports/PLAN-DEV-HANDOFF-20260529.md` (ngrok 차단 대응 — Cloudflare Quick Tunnel + Basic Auth)

---

## 1. 오늘 수행한 작업 요약

| 카테고리 | 건수 | 요약 |
|---------|------|------|
| **백엔드 Basic Auth 미들웨어 (§4.2)** | 1건 | `main.py`에 `@app.middleware("http")` 추가. `secrets.compare_digest`로 timing attack 차단, `os.environ[...]` 직접 접근으로 누락 시 KeyError 기동 실패(무인증 노출 안전장치), `/api/health`만 인증 예외. `base64` import 모듈 상단으로 정리 |
| **Vite dev server Basic Auth 미들웨어 (§4.3)** | 1건 | `vite.config.ts`에 `configureServer` hook 플러그인 추가. `/api/health` 예외, 단순 문자열 비교(dev 환경 충분), 401 + `WWW-Authenticate: Basic` 응답 |
| **🟡 A 보조 변경 — Vite가 `backend/.env` 자동 로드 (§4.6 PM 결정 갱신)** | 1건 | `vite.config.ts` 상단에 `fs.readFileSync` 기반 5줄 KEY=VALUE 파서 + `import.meta.url`/`fileURLToPath`로 ESM 호환 path 해석. `process.env` 우선, fallback이 `../backend/.env`. **단일 source of truth**: backend는 dotenv, frontend는 fs로 같은 파일에서 로드. 매 회의 환경변수 export 절차 제거 + 비밀번호가 터미널 history에 남지 않음 |
| **자격증명 (§4.1)** | 1건 | `secrets.token_urlsafe(16)`으로 22자 URL-safe 비밀번호 생성, `backend/.env`에 `BASIC_AUTH_USER=meeting` / `BASIC_AUTH_PASSWORD=<22자>` 추가 |
| **운영 문서 (§4.6)** | 1건 | `HANDOVER.md` 7절 알려진 제약 직후에 **7-A. 외부 시연 운영 절차 (Cloudflare Quick Tunnel)** 신규 절 추가 (8~12절 번호 재정렬 회피). A 적용 반영해 환경변수 export 라인 없는 CMD 친화 명령으로 작성 |
| **메모리 갱신 (§10)** | 3건 | `project_ngrok_demo.md` 삭제, `project_cloudflared_demo.md` 신규 작성(자격증명 위치 + 운영 절차 + A 적용 반영), `MEMORY.md` 인덱스 한 줄 교체 |

---

## 2. 변경된 파일 목록

### 백엔드

| 파일 | 변경 유형 | 상세 |
|------|----------|------|
| `backend/.env` | 수정 | `BASIC_AUTH_USER=meeting` / `BASIC_AUTH_PASSWORD=<22자 url-safe>` 2줄 추가 |
| `backend/main.py` | 수정 | `base64`/`os`/`secrets` import 상단 추가, `Request`/`Response`/`status` from fastapi 추가. `BASIC_AUTH_USER`/`PASSWORD` 모듈 상수, `PUBLIC_PATHS = {"/api/health"}` 상수, `basic_auth_middleware` 추가. CORS·라우터 등록·`/api/health` 라우트는 무변경 |

### 프론트엔드

| 파일 | 변경 유형 | 상세 |
|------|----------|------|
| `frontend/vite.config.ts` | 수정 (2회 — Step 2 후 A 보조 적용) | (1차) `configureServer` hook으로 Basic Auth 미들웨어. (2차) `fs`/`path`/`url` import 추가 + `loadDotenv()` 5줄 파서 + `import.meta.url`/`fileURLToPath` 기반 path 해석 + `process.env` 우선 + fallback `../backend/.env` |

### 문서

| 파일 | 변경 유형 | 상세 |
|------|----------|------|
| `HANDOVER.md` | 수정 | 7절 직후 **7-A. 외부 시연 운영 절차 (Cloudflare Quick Tunnel)** 신규 절 추가 (인프라 개요·사전 1회성 셋업·회의 30분 전 기동(CMD 3터미널)·종료·주의 5개 sub). A 보조 적용 반영 |
| `reports/DEV-REPORT-20260529.md` | 신규 | 본 보고서 |

### 메모리

| 파일 | 변경 유형 | 상세 |
|------|----------|------|
| `memory/project_ngrok_demo.md` | 삭제 | 도구 자체 변경으로 슬러그 폐기 |
| `memory/project_cloudflared_demo.md` | 신규 | type=project, 운영 절차(A 적용 반영) + 자격증명 위치 + 절전 차단 + URL 매 실행 변경 명시 + `[[issue3-pending]]` 링크 |
| `memory/MEMORY.md` | 수정 | 인덱스 라인 한 줄 교체 (`ngrok 데모 세팅` → `cloudflared 데모 세팅`) |

> 비변경 (명세 §9 준수): `backend/data/` 전체, 라우터(`backend/routers/*`), CORS 설정, `useAudioStream.ts` host-relative URL, Vite `allowedHosts: true`

---

## 3. 주요 기술 결정/변경 사항

### 3-1. 백엔드 Basic Auth 미들웨어 — 명세 §4.2 그대로

`secrets.compare_digest`로 timing attack 차단. `os.environ["..."]` 직접 접근으로 변수 누락 시 KeyError 기동 실패 — 의도된 안전장치(무인증 노출 차단). WebSocket 핸드셰이크는 첫 HTTP 요청이라 같은 미들웨어가 처리 + 브라우저는 같은 origin이면 자격증명 자동 첨부.

### 3-2. Vite Basic Auth — Quick Tunnel은 Cloudflare Access 미지원(유료)이라 앱 자체 인증 필수

cloudflared가 5173만 가리키므로 Vite에 인증 없으면 frontend asset이 무인증 노출. 백엔드·Vite 양쪽 동일 자격증명 사용 → 브라우저는 한 번 입력으로 양쪽 통과(same-origin).

### 3-3. 🟡 A 보조 변경 적용 — 명세 §4.6 PM 결정 갱신

핸드오프 §4.6은 "본체는 순수 수동 패턴 유지"로 명시했으나, Step 2 통과 직후 PM이 A 적용으로 결정 갱신. 이유:
- 회의 30분 전 운영 단계 수 감소(터미널 2개 각각 export 4줄 → 0줄)
- 비밀번호가 터미널 history에 남지 않음 (보안 부수효과)
- backend(dotenv)/frontend(fs) 양쪽이 같은 `backend/.env` 단일 source of truth
- 위험 거의 없음 (모노레포 구조 path 의존 외)

구현은 의존성 0(Node 내장 `fs`/`path`/`url`만), 5줄 KEY=VALUE 파서. ESM(`"type": "module"`)이라 `__dirname` 대신 `fileURLToPath(import.meta.url)`로 path 해석.

### 3-4. HANDOVER 7-A절 신설 — 절 번호 재정렬 회피

핸드오프 §4.6은 "7절 알려진 제약 인접에 신규 절 추가"라 했음. 그대로 8절로 추가하면 8~12절 번호 재정렬이 필요해 diff가 커지므로 **7-A**로 신설하여 8~12절 무변경. 새 세션 자동 로드 문서에 두어 누락 방지.

### 3-5. 메모리 슬러그 갱신 — 도구 자체 변경

`project_ngrok_demo.md`는 도구 이름이 슬러그라 그대로 두면 의미 어긋남. 삭제 + `project_cloudflared_demo.md` 신규. `MEMORY.md` 인덱스는 한 줄 교체.

---

## 4. 검증 결과

### 4-1. 자동 검증 (curl probe — 본 세션에서 완료)

| 시나리오 | 기대 | 결과 |
|---------|------|------|
| §5.3 #10 — `GET /api/health` no-creds | 200 + `{"status":"ok"}` | ✅ |
| §5.3 #8 — `GET /api/sessions` no-creds | 401 + `WWW-Authenticate: Basic realm="meeting-recorder"` | ✅ |
| §5.3 #11 — `GET /api/sessions` with creds | 인증 통과(404/405 등 인증 외 응답) | ✅ (405 Method Not Allowed = 인증 통과 후 라우터 메서드 미지원) |

### 4-2. 사용자 실증 검증 (본 세션 내 완료)

| 시나리오 | 결과 |
|---------|------|
| §5.1 #1 — 로컬 `localhost:5173` 접속 → Basic Auth 프롬프트 → 홈 렌더 | ✅ (Vite 재기동 후 통과) |
| §5.1 #2·#3 — 로컬 기존 기능 회귀 (녹음/다운로드/Slack/히스토리/설정) | ✅ |
| A 적용 후 frontend 재기동 (env export 없이 `cd && npm run dev`) | ✅ |
| §5.2 #4 — cloudflared 발급 URL을 MacBook에서 접속 → Basic Auth → 홈 렌더 | ✅ |

### 4-3. 사용자 실증 검증 (다음 주 실회의 예정)

| 시나리오 | 상태 |
|---------|------|
| §5.2 #5 — MacBook 5분+ 녹음 → WebSocket chunk 누락 0건 (핵심) | ⏳ 다음 주 1시간 실회의로 검증 예정 |
| §5.2 #6 — MacBook 녹음 다운로드 50MB+ 정상 재생 (cloudflare streaming 한계) | ⏳ 다음 주 |
| §5.2 #7 — MacBook Slack 전송 + MD 첨부 정상 | ⏳ 다음 주 |
| §5.4 #12·#13 — cloudflared Ctrl+C 후 외부 차단 + 로컬 계속 동작 | ⏳ 회의 종료 시 함께 확인 |

---

## 5. 다음 세션에서 확인할 것

### 5-1. 다음 주 1시간 실회의 검증 (PM 자체 진행)

- §5.2 #5 — WebSocket chunk 누락 0건 (가장 중요. 회의 중 전사 블록이 끊김 없이 표시되면 통과)
- §5.2 #6 — 회의 종료 후 녹음 다운로드 파일 크기 ≈ chunks 총합, 재생 시간 = 1시간
- §5.2 #7 — Slack 전송 + .md 첨부 정상
- §5.4 #12 — cloudflared 종료 직후 MacBook에서 새로고침 시 접속 불가
- 결과는 다음 개발 세션에 보고 → DEV-REPORT 또는 본 리포트 추가 섹션으로 정리

### 5-2. 운영 절차 (다음 주 회의 30분 전)

CMD 창 3개 — A 보조 변경 적용 후 환경변수 export 라인 사라짐:

```cmd
:: 터미널 1 — 백엔드
cd /d "C:\Users\rsa4635\Desktop\coding\project\myfirstapp\backend" && uvicorn main:app --reload --port 8000

:: 터미널 2 — 프론트
cd /d "C:\Users\rsa4635\Desktop\coding\project\myfirstapp\frontend" && npm run dev

:: 터미널 3 — cloudflared
cloudflared tunnel --url http://localhost:5173
```

→ 터미널 3 출력의 **새 URL**(`*.trycloudflare.com`)을 MacBook에 공유 → MacBook 브라우저로 접속 → Basic Auth (`meeting` / `backend/.env` 비밀번호) 입력.

> URL은 매 실행마다 바뀜. 자격증명은 동일. 회의 종료 후 cloudflared Ctrl+C.

### 5-3. 후속 작업 (1주 후 — 핸드오프 §11)

- 실회의 1주 운영 안정성 확인 후 ngrok 계정·터널 폐기(PM 직접 진행)
- 기획 세션이 본 핸드오프 §11 회수 (`PLAN-REPORT-2026MMDD`에 1주 검증 결과 + ngrok 폐기 보고)

### 5-4. 잔여 미결 (본 세션 범위 밖)

- 05-14 working tree 산출물(핸드오프 3건 + Critical fix 1건) 분할 커밋 — 사용자 실증 검증(`session_20260513_919435a7` 자동 복구) 결과 대기
- 🟠 resume·복구 audio 한계 (QA-FIX-3 제안 단계) — PM 우선순위 결정 대기
- 본 fix는 **단독 커밋 권장** (핸드오프 §7 #10) — 인프라 변경이라 다른 fix와 묶지 말 것

---

## 6. 커밋 이력

| 커밋 | 내용 |
|------|------|
| (대기) | ngrok → Cloudflare Quick Tunnel 교체 + Basic Auth (PLAN-DEV-HANDOFF-20260529 + A 보조). `backend/.env` 자격증명 / `main.py` 미들웨어 / `vite.config.ts` 미들웨어 + backend/.env 자동 로드 / `HANDOVER.md` 7-A절 / 메모리 3건 / 본 보고서 |

> 단독 커밋 권장. 다른 핸드오프(05-14·05-15)와 묶지 말 것 — 인프라 변경. 다음 주 실회의 검증 결과 반영 후 커밋해도 무방하나, 코드 검증은 본 세션에서 자동·로컬·외부 접속까지 통과했으므로 지금 커밋해도 안전.
