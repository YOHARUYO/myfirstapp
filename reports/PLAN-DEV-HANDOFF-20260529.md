# 기획→개발 핸드오프 — ngrok 차단 대응 인프라 변경 (Cloudflare Quick Tunnel + Basic Auth)

> 작성일: 2026-05-29
> 작성 주체: 기획 세션
> 심각도: 🟡 **Medium-High** — ngrok bandwidth 차단으로 MacBook 외부 시연·검증 불가. 로컬(Windows) 사용은 정상이라 운영 차단은 아니나, 크로스 플랫폼 확인 경로가 막힘
> 관련 문서: `reports/QA-TO-PLAN-NGROK-REPLACE-20260529.md` (검수→기획 전달, 본 핸드오프의 입력), `HANDOVER.md` 7절 알려진 제약
> 선행 의존: 없음 — 단독 진행 가능. `PLAN-DEV-HANDOFF-20260515` resume 재설계와 독립 (병행 가능)

---

## 개발 세션 전달 지시사항 (복붙용)

```
PLAN-DEV-HANDOFF-20260529.md 읽고 반영 부탁해.
ngrok 무료 플랜 bandwidth 차단으로 MacBook 외부 접속이 막혀서 Cloudflare Quick Tunnel로
교체한다. PM은 소유 도메인이 없어 Quick Tunnel(`*.trycloudflare.com` 임시 URL) 사용.

핵심:
- 코드 변경은 사실상 Basic Auth 추가 한 군데. 나머지는 cloudflared 설치 + 운영 문서.
- Basic Auth는 Vite dev server(5173) + 백엔드(8000) 양쪽 모두 적용 (이중 방어).
  cloudflared가 5173만 가리키므로 Vite에 인증 없으면 frontend asset이 무인증 노출됨.
- 자격증명은 단일 1쌍(BASIC_AUTH_USER / BASIC_AUTH_PASSWORD), backend/.env에 저장.
  비밀번호는 16자+ 무작위 생성 후 .env에 기록.
- `/api/health`만 인증 예외(공개) — cloudflared·외부 헬스체크용.
- 메모리 갱신: project_ngrok_demo.md 삭제 + project_cloudflared_demo.md 신규 작성.

검증 필수: cloudflare URL 접속 → Basic Auth 프롬프트 → 통과 후 홈 렌더 + 녹음·전송 정상.
운영 패턴: 회의 30분 전 수동 기동 (터미널 3개: backend / frontend / cloudflared).

세션 종료 시 reports/DEV-REPORT-20260529.md 작성 부탁해.
```

---

## 1. 배경 — 무엇이 왜 문제인가

검수 세션이 2026-05-29 PM 보고("ngrok URL 외부 접속 불가")를 진단한 결과:

- 로컬 ngrok agent(`localhost:4040`)는 정상, 터널 등록 유지
- 등록 터널: `https://schilling-parka-unclad.ngrok-free.dev` → `localhost:5173`
- 누적 트래픽: HTTP 3,332건 / connections 1,751건
- 외부 접속 시도: ngrok edge IP 5개 모두 **15초 connection timeout**

ngrok free 플랜의 월 1GB outbound 한도 초과 또는 abuse 차단으로 추정. TCP 자체가 막히는 패턴이라 정상 안내 페이지(차단 메시지)조차 표시되지 않음.

본 프로젝트의 크로스 플랫폼 확인 패턴(Windows 호스팅 + MacBook 접속)이 차단됨. 회의 시연·실기기 검증 모두 막힘.

## 2. 기획 결정 (확정 — 2026-05-29)

| 항목 | 결정 | 사유 |
|------|------|------|
| 터널 도구 | **Cloudflare Quick Tunnel** (`cloudflared tunnel --url`) | ngrok 1:1 대체 + 무제한 대역폭(차단 재발 없음) + 계정·소유 도메인 불필요 + WS/HTTPS 정식 지원 |
| 인증 방식 | **HTTP Basic Auth** (Vite + 백엔드 양쪽) | Quick Tunnel은 Cloudflare Access 미지원(유료). 앱 내부 인증 필수. cloudflared가 5173 가리키므로 Vite도 인증 필요 |
| 자격증명 관리 | `backend/.env`에 **단일 1쌍** (`BASIC_AUTH_USER`, `BASIC_AUTH_PASSWORD`) | 기존 `.env` 패턴과 일치. 시연자 1인(PM)이라 단일 자격 충분 |
| 비밀번호 강도 | **16자+ 무작위 생성** | URL 자체가 임시지만 노출 시 brute force 대비 |
| 헬스체크 공개 | **`/api/health`만 인증 예외** | cloudflared/외부 헬스체크 필요. 반환값은 `{"status": "ok"}` 뿐이라 정보 노출 0 |
| cloudflared 운영 | **회의 30분 전 수동 기동** (터미널 3개: backend / frontend / cloudflared) | 외부 공격면 최소화 + 기존 ngrok 운영 패턴 유지. Windows 절전 모드 차단 안내 필수 |
| 운영 매뉴얼 위치 | **`HANDOVER.md` 7절 알려진 제약 인접에 신규 절 추가** | 설치 1회 + 회의 절차 3단계로 짧음. 새 세션 자동 로드 문서에 두어 누락 방지 |
| 메모리 갱신 | `memory/project_ngrok_demo.md` 삭제 + `memory/project_cloudflared_demo.md` **신규 작성** | 슬러그 이름이 실제 도구와 일치해야 향후 의미 명확. 메모리는 누적 아닌 현 상태가 진실 |
| ngrok 정리 | **1주 보존 후 폐기** | cloudflared 안정성 1주 운영 검증 전까지 폴백. 무료 플랜이라 보존 비용 0 |
| 회의 데이터 보존 | **`backend/data/` 전부 보존** | ngrok과 회의 데이터는 별개. 명시적으로 유지 (개발 세션은 절대 건드리지 말 것) |

### 보안 검증 (PM 확인 완료)
- cloudflared 자동 HTTPS/TLS → Basic Auth 자격증명은 헤더가 TLS로 암호화 전송. 평문 노출 없음
- `/api/health`는 민감 정보 0. 외부 봇이 발견해도 다른 경로는 401로 차단
- 16자+ 무작위 비밀번호 → brute force 실효성 없음
- 결론: 본 구성은 임시 외부 노출 환경에 적합한 최소 안전 구성

## 3. 현재 코드 상태 (수정 대상)

| 파일/지점 | 현재 | 변경 |
|-----------|------|------|
| `backend/main.py:10-16` | CORS `allow_origins=["http://localhost:5173"]` | **무변경** — Vite proxy 경유라 same-origin |
| `backend/main.py:30-32` | `/api/health` 라우트 (이미 존재) | **무변경** — 인증 예외 처리에 활용 |
| `backend/main.py` | Basic Auth 미들웨어 없음 | **추가** — `/api/health` 외 모든 경로 인증 (자세히 4.2) |
| `backend/.env` | API/토큰 변수만 존재 | **추가** — `BASIC_AUTH_USER`, `BASIC_AUTH_PASSWORD` |
| `frontend/vite.config.ts:8` | `allowedHosts: true` | **무변경** — cloudflare 도메인 자동 허용 |
| `frontend/vite.config.ts:10-13` | `/api` proxy + `ws: true` | **무변경** — proxy 그대로 사용 |
| `frontend/vite.config.ts` | Basic Auth 미들웨어 없음 | **추가** — `configureServer` hook으로 직접 미들웨어 (자세히 4.3) |
| `frontend/src/hooks/useAudioStream.ts:20` | host-relative `${window.location.host}/api/...` | **무변경** — cloudflare 도메인 자동 채택 |

→ **순수 코드 변경은 백엔드 미들웨어 1곳 + Vite 설정 1곳, 총 2곳**. 나머지는 환경 변수·설치·문서.

## 4. 수정 명세

### 4.1 `backend/.env` 환경 변수 추가

```
# 기존 변수 위에 유지하고 아래만 추가
BASIC_AUTH_USER=meeting
BASIC_AUTH_PASSWORD=<16자 이상 무작위 — 개발 세션이 생성, 또는 PM이 직접 입력>
```

- 비밀번호 무작위 생성 예: `python -c "import secrets; print(secrets.token_urlsafe(16))"`
- `BASIC_AUTH_USER`는 단순 식별자라 `meeting` 같은 고정값 OK
- 둘 다 누락 시 백엔드 기동 실패 (4.2 참조) — 의도된 동작
- `.env.example`는 현재 저장소에 없음. 본 핸드오프에서 신규 생성은 불필요(개발 세션 판단에 따라 빈 자리표시자 .env.example 추가 권장)

### 4.2 백엔드 Basic Auth 미들웨어 (`backend/main.py`)

```python
import os
import secrets
from fastapi import FastAPI, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware

import config  # noqa: F401

from routers import sessions, audio, processing, ai, slack, history, templates, contacts, recovery, settings

BASIC_AUTH_USER = os.environ["BASIC_AUTH_USER"]
BASIC_AUTH_PASSWORD = os.environ["BASIC_AUTH_PASSWORD"]
PUBLIC_PATHS = {"/api/health"}  # 인증 예외 — cloudflared 헬스체크용

app = FastAPI(title="Meeting Recorder API", version="0.1.0")

@app.middleware("http")
async def basic_auth_middleware(request: Request, call_next):
    if request.url.path in PUBLIC_PATHS:
        return await call_next(request)
    auth = request.headers.get("authorization", "")
    if auth.startswith("Basic "):
        import base64
        try:
            decoded = base64.b64decode(auth[6:]).decode("utf-8")
            user, _, password = decoded.partition(":")
            if (secrets.compare_digest(user, BASIC_AUTH_USER)
                    and secrets.compare_digest(password, BASIC_AUTH_PASSWORD)):
                return await call_next(request)
        except Exception:
            pass
    return Response(
        status_code=status.HTTP_401_UNAUTHORIZED,
        headers={"WWW-Authenticate": 'Basic realm="meeting-recorder"'},
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 기존 router 등록 그대로
app.include_router(processing.router)
# ... (이하 동일)

@app.get("/api/health")
def health_check():
    return {"status": "ok"}
```

- `secrets.compare_digest`로 timing attack 방지 (단순 `==` 금지)
- `os.environ["..."]` 직접 접근 → 변수 누락 시 KeyError로 기동 실패 = 안전 (실수로 무인증 노출 차단)
- WebSocket 핸드셰이크는 첫 HTTP 요청이므로 같은 미들웨어가 통과. 브라우저는 같은 origin이면 Basic Auth 자격증명을 자동 첨부

### 4.3 Vite dev server Basic Auth 미들웨어 (`frontend/vite.config.ts`)

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const BASIC_AUTH_USER = process.env.BASIC_AUTH_USER || ''
const BASIC_AUTH_PASSWORD = process.env.BASIC_AUTH_PASSWORD || ''

if (!BASIC_AUTH_USER || !BASIC_AUTH_PASSWORD) {
  throw new Error('BASIC_AUTH_USER / BASIC_AUTH_PASSWORD 환경 변수가 필요합니다 (backend/.env와 동일 값)')
}

const EXPECTED = 'Basic ' + Buffer.from(`${BASIC_AUTH_USER}:${BASIC_AUTH_PASSWORD}`).toString('base64')

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'basic-auth',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          // /api/health는 공개 (cloudflared 헬스체크용 — 프록시 통과)
          if (req.url === '/api/health') return next()
          const auth = req.headers.authorization || ''
          if (auth === EXPECTED) return next()
          res.statusCode = 401
          res.setHeader('WWW-Authenticate', 'Basic realm="meeting-recorder"')
          res.end('Unauthorized')
        })
      },
    },
  ],
  server: {
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        ws: true,
      },
    },
  },
})
```

- Vite는 환경변수를 `process.env`에서 직접 읽음(서버 사이드 설정). `VITE_` prefix 불필요
- 환경변수는 frontend 실행 전에 export 필요 (4.6 운영 절차 참조)
- 단순 문자열 비교(`auth === EXPECTED`)는 timing attack 위험이 거의 없음(dev 환경) — 단 본 노출은 임시라 충분
- frontend 미들웨어는 backend Basic Auth와 **동일 자격증명** 사용 — 브라우저 자격증명 캐싱이 양쪽에 모두 통과

### 4.4 cloudflared 설치 + 동작 확인 (개발 1회성)

```powershell
# Windows
winget install --id Cloudflare.cloudflared
# 또는 https://github.com/cloudflare/cloudflared/releases 에서 msi 직접 설치

# 동작 확인
cloudflared tunnel --url http://localhost:5173
# 출력 예: https://xxx-yyy-zzz.trycloudflare.com → MacBook 브라우저로 접속
```

- 매 실행 시 URL이 바뀜 (`*.trycloudflare.com`) — 의도된 동작
- `cloudflared` 실행 중에만 외부 노출. Ctrl+C로 즉시 종료

### 4.5 WebSocket 핸드셰이크 검증 (중요)

- 브라우저는 WebSocket 핸드셰이크 시 같은 origin이면 캐싱된 Basic Auth 자격증명을 자동 첨부
- Vite proxy는 ws 요청을 backend로 전달하며 헤더 보존 (`ws: true` 옵션)
- 따라서 cloudflare → Vite(인증) → Vite proxy → backend(인증) 흐름에서 WS도 동작
- **검증 시나리오 5에 명시** — 녹음 시 WebSocket chunk 전송이 정상이어야 함

### 4.6 운영 절차 (HANDOVER.md 신규 절에 등록)

회의 30분 전 수동 기동 순서:

```powershell
# 터미널 1 — 환경 변수 로드 후 백엔드
$env:BASIC_AUTH_USER = "meeting"
$env:BASIC_AUTH_PASSWORD = "<값>"  # backend/.env에서 복사
cd backend
uvicorn main:app --reload --port 8000

# 터미널 2 — 환경 변수 로드 후 프론트엔드
$env:BASIC_AUTH_USER = "meeting"
$env:BASIC_AUTH_PASSWORD = "<값>"
cd frontend
npm run dev

# 터미널 3 — cloudflared
cloudflared tunnel --url http://localhost:5173
# 출력된 URL을 MacBook에 공유
```

- 회의 종료 후: 터미널 3 Ctrl+C → 외부 노출 즉시 차단
- Windows 절전 차단 권장: `powercfg -change standby-timeout-ac 0` (1회만 설정)
- backend/frontend의 환경변수 로드는 `dotenv-cli` 또는 PowerShell 스크립트로 자동화 가능하나 본 핸드오프 범위 밖. 개발 세션 판단에 따라 보조 스크립트 추가 가능 (PM 결정상 본체는 순수 수동 패턴 유지)

## 5. 검증 시나리오

### 5.1 회귀 — 로컬 사용 무변경 (최우선)
1. 백엔드 + 프론트만 기동 후 `localhost:5173` 접속 → Basic Auth 프롬프트 → 자격증명 입력 후 홈 정상 렌더
2. 기존 회의 5분 녹음 → 7단계 .webm 다운로드 정상
3. Slack 전송 / MD 첨부 / 히스토리 / 설정 화면 전부 정상

### 5.2 cloudflared 외부 접속 (핵심)
4. cloudflared 기동 → 발급 URL을 MacBook 브라우저로 접속 → Basic Auth 프롬프트 → 통과 → 홈 정상
5. MacBook에서 **5분 녹음 → WebSocket chunk 누락 0건** → 디스크 raw concat 1:1 매칭 (4.5 WS 핸드셰이크 검증)
6. MacBook에서 녹음 다운로드 50MB+ 정상 재생 (cloudflare streaming 한계 확인)
7. MacBook에서 Slack 전송 + MD 첨부 정상

### 5.3 인증 동작 (함정 검증)
8. Basic Auth 누락 시 401, `WWW-Authenticate: Basic` 헤더 반환 → 브라우저 자동 프롬프트
9. 잘못된 자격증명 → 401
10. `/api/health`는 자격증명 없이 200 (cloudflared 헬스체크 통과)
11. backend 직접 호출(`http://localhost:8000/api/sessions`) → 401 (백엔드 자체 인증 동작 확인)

### 5.4 종료 후
12. cloudflared 종료(Ctrl+C) → 외부 URL 접속 불가 확인
13. 로컬은 여전히 정상 접속 가능

## 6. 영향 범위

| 영역 | 변화 | 위험 |
|------|------|------|
| 로컬 사용 | Basic Auth 프롬프트 1회 추가 (브라우저가 캐싱) | ⚠ 회귀 5.1 필수 — 매우 낮음 |
| 외부(cloudflared) 사용 | ngrok → cloudflare URL + Basic Auth | ✅ 본 fix 핵심 |
| 회의 데이터 (`backend/data/`) | 전부 보존, 절대 건드리지 말 것 | ⚠ 개발 세션 주의 — 본 fix는 인프라/인증만 |
| WebSocket 핸드셰이크 | Vite + 백엔드 양쪽 인증 통과 필요 | ⚠ 5.2 #5 필수 검증 |
| CORS | same-origin(Vite proxy)이라 무변경 | ✅ |
| 환경 변수 누락 시 | 기동 실패 (KeyError / throw) | ✅ 의도된 안전장치 |

## 7. 권장 작업 순서

1. **4.1 `backend/.env` 자격증명 추가** (비밀번호 무작위 생성) — 1분
2. **4.2 백엔드 미들웨어 추가** → 5.3 #8·#9·#10·#11 (인증 동작 우선 확인) — 10분
3. **4.3 Vite 미들웨어 추가** → 5.1 #1 (로컬 회귀) — 10분
4. **4.4 cloudflared 설치** → `cloudflared tunnel --url http://localhost:5173` 단순 발급 확인
5. **5.2 #4~7 MacBook 외부 시나리오** (가장 중요한 검증, PM 협조 필요할 수 있음)
6. **5.4 종료 동작** 확인
7. **`HANDOVER.md` 7절 인접에 운영 절차 신규 절 추가** (4.6 내용 활용)
8. **메모리 갱신**:
   - `memory/project_ngrok_demo.md` 삭제
   - `memory/project_cloudflared_demo.md` 신규 작성 — `name: cloudflared-demo`, `type: project`, 운영 절차 + Basic Auth 위치 + Windows 절전 안내
   - `memory/MEMORY.md` 인덱스 갱신
9. **`reports/DEV-REPORT-20260529.md` 작성** — 코드 변경 2곳 + 로컬 회귀 + 외부 검증 + 메모리 갱신 명시
10. **커밋은 본 fix 단독 권장** — 인프라 변경이라 다른 fix(QA-AUDIO / PLAN-DEV-HANDOFF-20260515)와 묶지 말 것

## 8. 우선순위

🟡 **Medium-High** — 운영 차단(로컬은 정상)은 아니지만 시연·검증 경로가 막혀 있어 빠른 복구가 필요. PLAN-DEV-HANDOFF-20260515(resume audio)와 병행 가능(독립적). 본 fix를 먼저 처리하면 PM의 MacBook 30분 실회의 검증 환경이 살아나 잔여 검증 작업의 속도가 빨라짐.

## 9. 비변경 항목 (명시)

- `backend/data/` 전체 — **절대 건드리지 말 것**. 회의 데이터(sessions / meetings / templates / contacts) PM 명시 보존
- 라우터 코드(`backend/routers/*`) — 미들웨어로 처리, 라우터 시그니처 무변경
- CORS 설정 — Vite proxy 경유 same-origin이라 무변경
- `useAudioStream.ts` 등 frontend hook — host-relative URL이라 무변경
- `allowedHosts: true` — cloudflare 도메인 자동 허용

## 10. 메모리 갱신 (개발 세션 작업 항목)

### 삭제
- `memory/project_ngrok_demo.md` — 도구 자체가 바뀌므로 전면 폐기

### 신규
- `memory/project_cloudflared_demo.md` — 다음 내용:
  - **name**: `cloudflared-demo`
  - **type**: `project`
  - **description**: MacBook 외부 시연용 Cloudflare Quick Tunnel 세팅
  - 본문: 운영 절차(4.6) + Basic Auth `.env` 위치 + Windows 절전 차단 권장 + 회의 30분 전 수동 기동 패턴 + URL 매 실행마다 변경

### MEMORY.md 인덱스 한 줄 교체
- `- [ngrok 데모 세팅](project_ngrok_demo.md) — ...` 줄을
- `- [cloudflared 데모 세팅](project_cloudflared_demo.md) — Quick Tunnel + Basic Auth, 회의 30분 전 수동 기동 (터미널 3개)` 로

## 11. 후속 작업 (1주 후)

- cloudflared 안정성 1주 운영 검증 후:
  - ngrok 계정·터널 폐기 (PM 직접 진행)
  - 본 핸드오프 11절을 기획 세션이 회수 (PLAN-REPORT-2026MMDD에 1주 검증 결과 + ngrok 폐기 보고)
- cloudflared가 회의 중 끊김 → 자동 재기동 스크립트 필요 여부 별도 검토 (현 명세 범위 밖)
