# 기획 → 개발 전달 프롬프트 — 2026-05-14 (2)

> 이 문서를 개발 세션 시작 시 전달하세요.
> 본 문서는 검수 세션 발견 UI 회귀 + 잠재 위험 (히스토리 하단 버튼 + 7단계 체크박스 모바일).
> 같은 날 핸드오프 `PLAN-DEV-HANDOFF-20260514.md`(데이터 흐름 — 저장 경로 폐기)와 같은 개발 세션에서 함께 처리 가능. `SendSave.tsx`는 두 핸드오프 모두 손대므로 변경 충돌 주의.

---

## 개발 세션에 전달할 프롬프트

```
PLAN-DEV-HANDOFF-20260514-2.md 읽고 반영 부탁해.
검수 세션 발견 UI 회귀 + 잠재 위험 2건이야:
1) 히스토리 회의록 상세 하단 버튼 모바일 레이아웃 깨짐 (사용자 직접 보고, e262762로 4→5개 증가하면서 발생)
2) 7단계 체크박스 영역 모바일 잠재 깨짐 (e262762로 녹음 파일 체크박스 + .webm/.mp3 세그먼트 추가)

PLAN-DEV-HANDOFF-20260514.md(저장 경로 폐기)와 함께 묶어 한 세션에서 처리해도 돼.
SendSave.tsx는 두 핸드오프 모두 손대니까 변경 충돌만 조심하면 됨.

기획 문서(decisions.md, design-system.md) 갱신 완료, 본 문서는 구현 가이드.

---

## 1. 히스토리 상세 하단 버튼 — 계층 + 모바일 반응형

### 현상
- `HistoryDetail.tsx:317` `<div className="mt-12 flex gap-3">` — flex-wrap 미설정
- 버튼 5개 일렬: `[재편집][재전송][.md 다운로드][🎵 녹음 다운로드][🗑 삭제]`
- 페이지 max-w-3xl (768px) 기준 데스크탑 빠듯, **모바일 ~375px에서 오버플로우로 레이아웃 깨짐**
- 임계점: e262762에서 4→5개 증가

### 기획 결정 (3그룹 계층 + 그룹 단위 줄바꿈)

**시각 명세**:
```
[ ✎ 재편집 ][ 📨 재전송 ]    [ 📥 .md 다운로드 ][ 🎵 녹음 다운로드 ]    [ 🗑 삭제 ]
  └── 주 액션 ──┘            └─────── 보조 (다운로드) ───────┘    └ 위험 ┘
```

**구조**:
- 외곽 컨테이너: `flex flex-wrap items-center` (그룹 단위 줄바꿈)
- 그룹 간 gap: `gap-6` (24px)
- 그룹 내 gap: `gap-2` (8px)
- 각 그룹은 별도의 inner `<div className="flex items-center gap-2">`로 감싸기

**색상·위계**:
- 주 액션(재편집·재전송) + 보조(.md·녹음 다운로드): Secondary 톤 (`bg-bg-subtle text-text rounded-lg px-5 py-3 font-medium hover:bg-bg-hover`) — design-system.md 버튼 표 참조
- 위험(삭제): 현재 `text-recording` 색상 유지, 변경 없음

**줄바꿈 정책 (Q2 PM 강조)**:
- **버튼 라벨은 어절 단위 줄바꿈** — "녹음 다운로드"가 글자 중간에서 잘리지 않도록
- 라벨 텍스트에 `whitespace-nowrap` 필수
- 컨테이너의 `flex-wrap`이 좁은 폭에서 버튼 단위로만 줄바꿈
- 모바일 ~375px에서 그룹 1 / 그룹 2 / 그룹 3이 자연스럽게 다음 줄로 내려가야 함

### 코드 변경 (HistoryDetail.tsx:317)

기존:
```tsx
<div className="mt-12 flex gap-3">
  <button>...재편집...</button>
  <button>...재전송...</button>
  <button>...md 다운로드...</button>
  <button>...녹음 다운로드...</button>
  <button>...삭제...</button>
</div>
```

변경:
```tsx
<div className="mt-12 flex flex-wrap items-center gap-x-6 gap-y-3">
  {/* 주 액션 */}
  <div className="flex items-center gap-2">
    <button className="whitespace-nowrap ...">✎ 재편집</button>
    <button className="whitespace-nowrap ...">📨 재전송</button>
  </div>
  {/* 보조 (다운로드) */}
  <div className="flex items-center gap-2">
    <button className="whitespace-nowrap ...">📥 .md 다운로드</button>
    <button className="whitespace-nowrap ...">🎵 녹음 다운로드</button>
  </div>
  {/* 위험 */}
  <div className="flex items-center">
    <button className="whitespace-nowrap text-recording ...">🗑 삭제</button>
  </div>
</div>
```
- `gap-x-6 gap-y-3`: 그룹 간 가로 24px, 줄바꿈 시 세로 12px
- 각 버튼 라벨 `<button>` 자체에 `whitespace-nowrap` 적용 (라벨이 어절 단위로 유지)

---

## 2. 7단계 체크박스 영역 — 모바일 수직 스택

### 현상 (잠재 위험)
- `SendSave.tsx`의 체크박스 라인: `☑ Slack 전송   ☑ .md 다운로드   ☐ 녹음 파일 다운로드   ✓ JSON 히스토리(자동)`
- 4개 항목 + 녹음 체크 시 옆에 `.webm/.mp3` 세그먼트 인라인 노출
- 모바일 폭에서 강제 한 줄 유지 시 깨짐 (히스토리 하단 버튼과 같은 본질)

### 기획 결정 (모바일 수직 스택)

**구조**:
- 데스크탑(≥768px): 한 줄 일렬 (현행), 녹음 체크 시 `.webm/.mp3` 세그먼트가 체크박스 **옆**에 노출
- 모바일(<768px): 항목별 **수직 스택**, 녹음 체크 시 세그먼트가 체크박스 **아래**로 자연스럽게 내려옴

**Tailwind 패턴**:
- 외곽 컨테이너: `flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-y-3 sm:gap-x-6`
- 각 체크박스 라벨: `whitespace-nowrap` (어절 단위 유지)
- 녹음 체크박스 + 세그먼트는 하나의 inner 컨테이너로 감싸기:
  ```tsx
  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
    <label className="whitespace-nowrap">☐ 녹음 파일 다운로드</label>
    {audioChecked && <SegmentControl />}  {/* .webm | .mp3 */}
  </div>
  ```
- 모바일에서는 체크박스 아래로 세그먼트가 자연스럽게 내려감

### 코드 변경 (SendSave.tsx)

> ⚠️ `SendSave.tsx`는 본 핸드오프(-2)와 `PLAN-DEV-HANDOFF-20260514.md`(-1) 둘 다 손댐. -1의 라벨 변경(".md 저장" → ".md 다운로드", "녹음 파일 저장" → "녹음 파일 다운로드")이 먼저 반영된 상태에서 본 핸드오프의 레이아웃 변경 진행.

- 체크박스 영역 외곽 컨테이너 클래스: `flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-y-3 sm:gap-x-6`
- 각 체크박스 라벨 텍스트에 `whitespace-nowrap` 추가
- 녹음 체크박스 + `.webm/.mp3` 세그먼트는 inner `flex flex-col sm:flex-row sm:items-center gap-2` 로 감싸기
- 데스크탑 ≥768px에서 시각적 동일성 검증 (회귀 방지)

---

## 검증 시나리오

### 데스크탑 (≥768px)

1. **히스토리 상세 하단**
   - 5개 버튼이 3그룹 단위로 한 줄에 표시 (그룹 간 간격 명확)
   - 라이트/다크 모드 둘 다 시각 일관성

2. **7단계 체크박스**
   - 4개 체크박스 한 줄, 녹음 파일 체크 시 옆에 `.webm/.mp3` 세그먼트 인라인 노출 (현행과 동일 시각)

### 모바일 (~375px)

3. **히스토리 상세 하단**
   - 그룹 단위로 줄바꿈 (예: 그룹 1 / 그룹 2 / 그룹 3 각 한 줄, 또는 그룹 1+2 한 줄 + 그룹 3 한 줄)
   - **버튼 라벨이 글자 중간에서 잘리지 않음** (예: "녹음 다운로드"가 한 덩어리로 유지)
   - 오버플로우 없음

4. **7단계 체크박스**
   - 4개 체크박스가 수직 스택 (각 한 줄씩)
   - 녹음 파일 체크 시 `.webm/.mp3` 세그먼트가 체크박스 **아래**로 내려옴
   - 라벨 어절 단위 유지

### 회귀

5. **PLAN-DEV-HANDOFF-20260514.md (-1)과의 호환**
   - SendSave.tsx 라벨 변경(".md 다운로드"/"녹음 파일 다운로드")이 본 변경과 충돌 없이 적용됨
   - exportPath 제거 + 폴더 선택 UI 제거(-1)와 함께 적용 후 모바일 레이아웃 정상

6. **버튼 동작 회귀**
   - 5개 버튼 모두 클릭 시 기존 동작 그대로 (재편집·재전송·다운로드 2개·삭제)
   - .md / 녹음 다운로드는 -1 적용 후 blob 다운로드 동작

---

## 우선순위

🟡 Medium — 사용자 직접 인지 가능한 UI 회귀이며, 운영 차단은 없으나 모바일/외부 시연 시 즉시 보이는 영역. 다른 신규 기획보다 우선 결정.

세션 종료 시 reports/DEV-REPORT-20260514.md(기존 또는 신규)에 결과 기록 부탁해.
```
