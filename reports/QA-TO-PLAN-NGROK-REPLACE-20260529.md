# 검수→기획 전달: ngrok 차단 대응 인프라 변경 제안 — 2026-05-29

> 작성 주체: 검수(QA) 세션
> 수신: 기획 세션
> 트리거: PM 보고 — ngrok bandwidth 제한으로 외부 서비스 이용 불가
> 후속: 기획 세션 검토·결정 → `PLAN-DEV-HANDOFF-20260529.md` 작성 → 개발 반영
> 관련 메모리: `memory/project_ngrok_demo.md` (38일 경과, 본 건 반영 후 갱신 대상)

---

## 1. 발견 이슈

### 1-1. 증상
PM이 현재 ngrok URL(`https://schilling-parka-unclad.ngrok-free.dev`) 외부 접속 불가 보고.

### 1-2. 검수 진단 결과
| 검사 항목 | 결과 |
|---|---|
| 로컬 ngrok agent (`http://localhost:4040/api/tunnels`) | ✅ 정상, 터널 등록 유지 |
| 등록 터널 | `https://schilling-parka-unclad.ngrok-free.dev` → `localhost:5173` |
| 누적 트래픽 (해당 터널) | HTTP 요청 3,332건 / connections 1,751건 |
| 외부 접속 시도 (ngrok edge IP 5개) | ❌ **15초 connection timeout** (모든 IP 동일) |

로컬 에이전트는 살아있으나 ngrok edge가 외부 요청을 받지 않음. ngrok free 플랜의 월 1GB outbound 제한 또는 abuse 차단 추정. 정상 차단 시 안내 페이지가 뜨지만 임계치 초과 시 TCP 자체가 막히는 패턴과 일치.

확정 확인 경로: `https://dashboard.ngrok.com/observability/abuse-reports`

### 1-3. 즉각 영향
- MacBook 외부 환경에서 시연·검증 불가
- 본 프로젝트의 크로스 플랫폼 확인 패턴(Windows 호스팅 + MacBook 접속) 차단
- 로컬(Windows) 사용은 정상 — 운영 차단 아님

---

## 2. 대체 옵션 검토 요약

| 옵션 | 비용 | 즉시성 | 본 앱 호환 | 적합도 |
|---|---|---|---|---|
| **Cloudflare Quick Tunnel** (`*.trycloudflare.com`) | 무료 | 즉시 | ✅ 완전 호환 | ⭐⭐⭐ |
| LAN 직접 접속 (`http://<win-ip>:5173`) | 무료 | 즉시 | △ 외부망 불가 | 보조용 |
| LocalTunnel / serveo / bore | 무료 | 즉시 | △ 안정성 낮음 | 백업용 |
| GitHub Pages | 무료 | 불가 | ❌ 정적 호스팅만 — FastAPI+WS+Whisper+ffmpeg+로컬 JSON 저장 구조와 본질적 부적합 | 제외 |
| Railway/Render 등 PaaS 백엔드 이전 | 변동 | 며칠 | △ Whisper/ffmpeg/JSON 저장소 의존 검토 필요 | 이슈 3 보류 |

### 권장: **Cloudflare Quick Tunnel**
- ngrok 1:1 대체 + **무제한 대역폭** → bandwidth 차단 재발 없음
- 계정·소유 도메인 불필요 (PM 현 상황과 부합)
- 단일 명령으로 즉시 발급 (`cloudflared tunnel --url http://localhost:5173`)
- WebSocket·HTTPS·streaming 정식 지원

---

## 3. 코드 상태 사전 확인 — 코드 변경 거의 0건

cloudflared 전환 시 코드 수정 부담을 가늠하기 위해 4개 지점 점검 완료:

| 확인 지점 | 현재 상태 | 영향 |
|---|---|---|
| `frontend/vite.config.ts:8` | `allowedHosts: true` | 모든 호스트 허용 — cloudflare 도메인 추가 작업 **불필요** |
| `frontend/vite.config.ts:10-13` | `/api` proxy + `ws: true` | 백엔드·WebSocket이 Vite를 거치므로 **터널 1개(5173)만 노출**하면 됨 |
| `frontend/src/hooks/useAudioStream.ts:20` | `new WebSocket(\`${protocol}//${window.location.host}/api/...\`)` | host-relative URL — cloudflare 도메인에서 자동 채택 |
| `backend/main.py:12` | CORS `allow_origins=["http://localhost:5173"]` | same-origin 경로(cloudflare→Vite→backend)라 추가 작업 불필요 |

→ **순수 코드 변경은 0건에 가깝고, 작업 대부분은 (1) cloudflared 설치 (2) 운영 절차 문서화 (3) 보안 강화 1줄**.

---

## 4. 리스크 재검토

### 🟢 낮음 (ngrok 대비 신규 리스크 없음)
- Vite/CORS/WebSocket 자동 호환
- 무제한 대역폭 → 차단 재발 없음
- 자동 HTTPS → 마이크 권한 OK
- 무한 응답 크기는 streaming이라 녹음 다운로드 ~117MB OK (실측 검증 권장)
- Whisper 장시간 처리는 폴링 패턴이라 응답 timeout 무관

### 🟡 중간 (ngrok 운영과 동일 수준)
| 항목 | 평가 |
|---|---|
| **임시 URL 매 실행마다 변경** | 재시작 시 `*.trycloudflare.com` URL 변경. 회의 30분 전 세팅 패턴에서는 OK. 회의 중 cloudflared 끊김 시 URL 재공유 필요 |
| **외부 무방비 노출** | URL 노출 시 외부 접근 가능. **PM 결정: Basic Auth 포함으로 최소 보호** |
| **장시간 WS idle 끊김** | Cloudflare가 idle WS 끊을 가능성. 단 atomic write + disconnect final save(05-14 fix) + 자동 복구가 있어 데이터 손실 리스크 매우 낮음. 재연결 자동화 보강 여부는 별도 검토 |

### 🔴 높음
없음.

---

## 5. PM 확정 사항 (2026-05-29 결정)
- ✅ **Cloudflare Quick Tunnel** 채택 (소유 도메인 없음 → Named Tunnel/Cloudflare Access 보류)
- ✅ **Basic Auth 포함** (외부 노출 최소 보호)
- ✅ 검수가 직접 개발하지 않고 **기획 세션 경유** → PLAN-DEV-HANDOFF → 개발 반영 순서

---

## 6. 기획 세션 결정 요청 사항

PLAN-DEV-HANDOFF 작성 전에 아래 5건 의사결정을 PM과 합의 부탁드립니다.

1. **Basic Auth 자격증명 관리**
   - `.env`로 관리 (`BASIC_AUTH_USER`, `BASIC_AUTH_PASSWORD`)
   - 단일 자격 vs 복수 자격 (MacBook 단독 시연이면 1쌍)
   - 헬스체크(`/api/health`) 공개 여부
2. **cloudflared 활성화 범위**
   - 항상 켜둘지 vs 회의 30분 전 수동 기동만
   - Windows 절전 모드 차단 안내 필요 여부
3. **운영 매뉴얼 위치**
   - `HANDOVER.md`에 신규 절 추가 vs 별도 `docs/CLOUDFLARED-OPS.md`
4. **메모리 갱신 정책**
   - `memory/project_ngrok_demo.md`를 cloudflare로 전면 교체
   - 또는 새 이름(`project_cloudflared_demo.md`) + 구 메모 삭제
5. **기존 ngrok 정리 정책**
   - ngrok 계정·터널 보존(폴백용) vs 폐기

---

## 7. 권장 명세 윤곽 (PLAN-DEV-HANDOFF 작성 시 참고)

### A. 환경 세팅 (개발 1회성)
- `cloudflared` 설치: `winget install --id Cloudflare.cloudflared` (또는 공식 msi)
- 동작 확인: `cloudflared tunnel --url http://localhost:5173` → 발급 URL을 MacBook 브라우저로 접속

### B. 백엔드 Basic Auth 추가
- `backend/.env`에 `BASIC_AUTH_USER`, `BASIC_AUTH_PASSWORD` 추가 (값은 PM 협의)
- `backend/main.py`에 FastAPI `HTTPBasic` 의존성 또는 미들웨어로 적용
  - 인증 실패 시 401, `WWW-Authenticate: Basic` 반환 → 브라우저 자동 프롬프트
  - **공개 경로 정책**: `/api/health`만 공개 권장 (기획 결정 필요)
- 프론트엔드는 무수정 — 브라우저가 자동 자격증명 캐싱
- `.env.example` 갱신 (커밋 가능 변수만)

### C. 운영 절차 문서화
1. 회의 30분 전: 백엔드(8000) → 프론트(5173) → cloudflared → URL 공유
2. 회의 후: cloudflared 종료(Ctrl+C) — 외부 노출 차단
3. Windows 절전 모드 차단 권장(`powercfg -change standby-timeout-ac 0`)

### D. 검증 시나리오 (검수가 확인)
1. cloudflare URL 접속 → Basic Auth 프롬프트 → 통과 후 홈 정상 렌더
2. 5분 녹음 → WebSocket chunk 누락 0건 → 디스크 raw concat 1:1 매칭
3. 녹음 다운로드 50MB+ 정상 (cloudflare streaming 한계 확인)
4. Slack 전송·MD 첨부 정상
5. Basic Auth 누락 시 401, `/api/health`는 200
6. cloudflared 종료 후 외부 접속 불가 확인

### E. 메모리/문서 업데이트 (기획 결정 반영)
- `memory/project_ngrok_demo.md` 전면 갱신 또는 신규 메모로 전환
- `HANDOVER.md` 운영 절차 절 추가, `7. 알려진 제약` 표 갱신

---

## 8. 잔여 미해결 영향 (참고)
본 인프라 변경은 아래 잔여 항목과 독립적 — 우선순위 변화 없음:
- 🔴 ⏳ `PLAN-DEV-HANDOFF-20260515` resume·복구 audio 재설계 (개발 반영 대기, 13일 경과)
- 🟡 5건 (Part D 2 / 환경 의존 2 / 미리보기 1)

단, MacBook 시연 환경이 살아나면 환경 의존 이슈 2건(🟡)의 실기기 검증이 가능해짐 → 부수 효과.

---

## 9. 검수 종료 시점 상태
- 본 문서 작성으로 검수→기획 전달 완료
- 추가 검수 액션은 PLAN-DEV-HANDOFF 작성 + 개발 반영 후 재개
- 검수→개발 전달 신규 0건 (PLAN-DEV-HANDOFF-20260515 외)
