# Frontend v1 Backup (2026-04-17)

Design System v1 (Vercel-style) 적용 상태의 프론트엔드 파일 백업.

## 포함 파일
- `index.css` — Tailwind v4 + v1 시맨틱 색상 토큰
- `index.html` — 폰트 CDN (Inter weight 400;500;600)
- `Home.tsx` — 1단계 홈 화면 (v1 스타일)
- `MeetingSetup.tsx` — 2단계 회의 정보 입력 (v1 스타일)
- `Recording.tsx` — 3단계 녹음 & 실시간 전사 (v1 스타일)

## 복원 방법
1. 각 파일을 원래 경로로 복사:
   - `index.css` → `frontend/src/index.css`
   - `index.html` → `frontend/index.html`
   - `Home.tsx` → `frontend/src/pages/Home.tsx`
   - `MeetingSetup.tsx` → `frontend/src/pages/MeetingSetup.tsx`
   - `Recording.tsx` → `frontend/src/pages/Recording.tsx`
2. `backups/design-system-v1-20260417/design-system.md` → `design-system.md` 로도 복원 필요
