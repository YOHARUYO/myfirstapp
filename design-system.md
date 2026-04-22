# 디자인 시스템

> 마지막 업데이트: 2026-04-17 (v2)
> 이전 버전: `backups/design-system-v1-20260417/design-system.md`
> 구현 파일: `frontend/src/index.css` (`@theme` 블록)

---

## 디자인 톤

**Toss-style Bold Editorial** — 극단적 타이포 위계 + 거대한 여백 + 테두리 없는 배경색 블록으로 "한 화면 한 초점"을 구현.
메인 레퍼런스는 Toss, 서브 레퍼런스는 Apple News.

- 라이트 모드 기본 (다크 모드는 향후 확장)
- 테두리 최소화 — 섹션 경계는 배경색 블록이 담당
- 그림자 거의 없음, 모달에만 `shadow-lg`
- 라운드 2단계: `rounded-lg` (8px, 버튼/인풋), `rounded-xl` (12px, 카드)

---

## 색상 토큰

v1 팔레트를 대부분 유지하되 Primary만 교체. 새 토큰 1개(`bg-hover`)만 추가.

### Brand (변경)
| 토큰 | 값 | Tailwind 클래스 | 용도 |
|------|-----|----------------|------|
| `--color-primary` | `#3182F6` | `text-primary`, `bg-primary` | 주요 버튼, 링크, 활성 상태 (Toss 블루 계열) |
| `--color-primary-hover` | `#1B64DA` | `hover:bg-primary-hover` | Primary 버튼 hover |

### Text (유지)
| 토큰 | 값 | 용도 |
|------|-----|------|
| `--color-text` | `#1A1A1A` | 본문, 제목 |
| `--color-text-secondary` | `#6B7280` | 부가 정보, 라벨 |
| `--color-text-tertiary` | `#9CA3AF` | 비활성, 힌트 |

### Background (1개 추가)
| 토큰 | 값 | 용도 |
|------|-----|------|
| `--color-bg` | `#FFFFFF` | 전체 배경 |
| `--color-bg-subtle` | `#F8F9FA` | 카드, 블록 배경 |
| `--color-bg-hover` | `#F0F2F5` | **(신규)** 카드 hover 상태 — bg-subtle보다 한 단계 진함 |

### Border (유지, 사용 빈도만 감소)
| 토큰 | 값 | 용도 |
|------|-----|------|
| `--color-border` | `#E5E7EB` | 구분선, 입력 필드 포커스 |
| `--color-border-light` | `#F3F4F6` | 연한 구분선 |

### Status (유지)
| 토큰 | 값 | 용도 |
|------|-----|------|
| `--color-recording` | `#EF4444` | 녹음 dot, 중지 버튼 |
| `--color-success` | `#10B981` | 완료 표시 |
| `--color-warning` | `#F59E0B` | 경고 아이콘 |
| `--color-warning-bg` | `#FFFBEB` | 경고 배너 배경 |
| `--color-warning-text` | `#92400E` | 경고 배너 텍스트 |

### Importance (유지)
| 토큰 | 값 | 용도 |
|------|-----|------|
| `--color-importance-high` | `#EF4444` | 상 — 빨강 바 |
| `--color-importance-medium` | `#F59E0B` | 중 — 앰버 바 |
| `--color-importance-low` | `#D1D5DB` | 하 — 연회색 바 |
| (최하) | 투명 | 바 없음 |

### Contextual (v1 template 색 조정)
| 토큰 | 값 | 용도 |
|------|-----|------|
| `--color-template` | `#EFF6FF` | 템플릿 자동 채움 필드 배경 (연한 블루 — Primary와 톤 맞춤) |
| `--color-missing` | `#FFFBEB` | 미입력 필드 강조 배경 |

> **v1 대비 변경 요약**: Primary 그린→블루, bg-hover 토큰 신규 추가, template 배경을 연한 그린→연한 블루로 조정 (Primary 톤 정합성).

---

## 타이포그래피

**v2 핵심 변경 영역.** Display 크기를 대폭 확대하고 Weight 대비를 강화해 "볼드 에디토리얼" 느낌을 구현.

### 폰트 스택 (유지)
```
--font-sans: 'Pretendard Variable', 'Pretendard', 'Inter', -apple-system, sans-serif
--font-mono: 'JetBrains Mono', monospace
```

### 크기·Weight 규칙 (변경 핵심)

| 용도 | v1 (기존) | v2 (변경) | Tailwind 클래스 예시 |
|------|-----------|-----------|--------------------|
| **Display** (페이지 제목) | 24px, 600 | **40px, 700** | `text-[40px] font-bold leading-tight` |
| **Title** (섹션 제목 H2) | 18px, 600 | **28px, 700** | `text-[28px] font-bold` |
| **Subtitle** (서브섹션 H3) | — | **20px, 600** | `text-xl font-semibold` |
| **Body** | 15px, 400 | 15px, 400 (유지) | (body 기본) |
| **Small** | 13-14px, 400-500 | 13px, 500 (유지) | `text-xs font-medium` |
| **Mono** (타임스탬프) | 12px | 12px (유지) | `text-xs font-mono` |

**핵심 원칙:**
- Display와 Body의 비율을 **1.6배(24:15) → 2.66배(40:15)** 로 확대
- Weight를 `600 → 700`으로 상향 — Pretendard Bold의 진가 활용
- **중간 위계 Subtitle(20px/600) 신규 추가** — H2(28/700)와 Body(15/400) 간격이 벌어진 만큼 중간 층 필요

### 적용 가이드

- **페이지 제목**: 무조건 Display(40/700). 한 페이지당 1개
- **섹션 구분**: Title(28/700) — 예: "회의 개요", "주요 논의"
- **서브섹션**: Subtitle(20/600) — 예: "### 1. 주제명"
- **본문**: Body(15/400)
- **라벨/메타**: Small(13/500)

### 제목 → 콘텐츠 위계 강화 패턴

페이지 제목(Display)과 콘텐츠 사이의 시각적 경계를 명확히 하기 위한 패턴.

**서브텍스트 + 콘텐츠 배경색 블록 조합**:
```
  요약                          ← Display (40px, Bold, 배경 없음)
  AI가 생성한 요약입니다         ← Small (13px, text-text-secondary)

  ┌─ bg-bg-subtle rounded-xl p-6 ─┐
  │ 회의 개요                       │  ← Title (28px) — 배경 블록 안
  │ - 내용...                       │  ← Body (15px)
  │                                 │
  │ 주요 논의                       │  ← Title
  │ ...                             │
  └─────────────────────────────────┘
```

**규칙**:
- **Display 아래 서브텍스트**: Small(13px) + `text-text-secondary`로 페이지 맥락 한 줄 설명. 간격은 `mt-2`
- **콘텐츠 영역 배경 블록**: `bg-bg-subtle rounded-xl p-6`으로 감싸기. Display와의 간격은 `mt-8`
- 제목(배경 없음, 투명) vs 콘텐츠(배경 있음)의 대비로 위계가 자연스럽게 드러남
- v2 디자인 시스템의 "테두리 대신 배경색 블록" 원칙과 일치

**서브텍스트 예시**:
| 페이지 | Display | 서브텍스트 |
|--------|---------|----------|
| 3단계 | {회의 제목} | (서브텍스트 없음 — 상태바가 역할 대체) |
| 5단계 | 편집 | 전사 내용을 확인하고 수정하세요 |
| 6단계 | 요약 | AI가 생성한 요약을 확인하고 수정하세요 |
| 7단계 | 전송 & 저장 | 회의록을 Slack으로 전송하고 저장하세요 |
| 히스토리 | 히스토리 | 지난 회의록을 검색하고 확인하세요 |
| 설정 | 설정 | (서브텍스트 없음 — 섹션 라벨이 충분) |

### 로드 방식 (index.html, 유지)
```html
<link rel="stylesheet" as="style" crossorigin
  href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
  rel="stylesheet" />
```

> **주의**: Inter의 weight 옵션에 `700`을 추가해야 함 (기존 `400;500;600`에서 확장).

---

## 아이콘 (경미한 변경)

### 라이브러리 (유지)
- **lucide-react** — Stroke 기반 SVG

### 사용 규칙
- 이모지 사용 금지 — 모든 아이콘은 lucide-react SVG 컴포넌트
- 기본 크기 (v2 상향):
  - 인라인 텍스트 옆: `size={16}` (v1 14-16에서 16으로 통일)
  - 버튼 내부: **`size={20}`** (v1 18 → 20)
  - 히어로/강조: **`size={32}` 이상** (v1 28 → 32)
- 색상은 부모의 `text-*` 클래스로 상속
- `strokeWidth`는 기본값(2) 유지 — 과한 두께는 지양

### 주요 아이콘 매핑 (유지)
v1과 동일. Mic / Settings / ArrowLeft / Clock / ChevronRight / AlertCircle / Check / Search / Pencil / Trash2 / Upload / Send / Download 등 lucide-react에서 import.

---

## 레이아웃 & 간격 규칙 (v2 핵심 변경)

### 간격 스케일

| 항목 | v1 | v2 |
|------|-----|-----|
| 페이지 상단 패딩 | 기본 | **80px** (`pt-20`) |
| 페이지 좌우 패딩 (모바일) | `px-6` | `px-6` (유지) |
| 페이지 좌우 패딩 (데스크탑) | `px-6` | `md:px-10` (확장) |
| 최대 폭 (홈) | `max-w-xl` (576px) | **`max-w-md` (448px)** — 타이트하게 |
| 최대 폭 (콘텐츠) | `max-w-3xl` (768px) | `max-w-3xl` (유지) |
| 섹션 간 간격 (주요) | `mt-12~14` (~48-56px) | **`mt-20` (80px)** |
| 섹션 간 간격 (서브) | — | `mt-12` (48px) |
| 카드 내부 패딩 | `p-3.5~4` | **`p-5`** (20px) — 여유 있게 |
| 리스트 항목 간 | `space-y-1.5~2` | `space-y-2` (유지) |

### "한 화면 한 초점" 원칙
- 각 페이지는 시각적 주인공이 1개 존재해야 함
- 주인공 = 가장 큰 타이포 (보통 Display) 또는 강조된 CTA 버튼
- 나머지 요소는 여백과 작은 타이포로 물러나 있음

---

## 컴포넌트 스타일 가이드 (v2 변경)

### 버튼

| 유형 | v1 스타일 | v2 스타일 |
|------|-----------|-----------|
| Primary | `bg-primary text-white rounded-lg hover:bg-primary-hover` | **`bg-primary text-white rounded-lg px-5 py-3 text-[15px] font-semibold hover:bg-primary-hover`** — 살짝 크고 굵게 |
| Secondary | `border border-border text-text rounded-lg hover:bg-bg-subtle` | **`bg-bg-subtle text-text rounded-lg px-5 py-3 text-[15px] font-medium hover:bg-bg-hover`** — 테두리 대신 배경색 |
| Danger | `bg-recording text-white rounded-lg` | `bg-recording text-white rounded-lg px-5 py-3 font-semibold` |
| Ghost | `text-text-secondary hover:text-text` | 유지 |

### 카드/리스트 항목 (v2 핵심 변경)

**v1:**
```
border border-border rounded-lg p-3.5
hover:bg-bg-subtle cursor-pointer transition-colors
```

**v2:**
```
bg-bg-subtle rounded-xl p-5
hover:bg-bg-hover cursor-pointer transition-colors
```

**변경점:** 테두리 제거, 배경색으로 경계 표현, 라운드 `lg → xl`, 패딩 확장.

### 입력 필드 (v2 변경)

**v1:**
```
border border-border rounded-lg px-3 py-2
focus:border-primary focus:outline-none
```

**v2 — 페이지 직접 배치 (부모 배경이 bg-bg일 때):**
```
bg-bg-subtle rounded-lg px-4 py-3 text-[15px]
focus:bg-bg focus:ring-2 focus:ring-primary focus:outline-none
```

**v2 — 배경 블록 안 배치 (부모 배경이 bg-bg-subtle일 때):**
```
bg-bg rounded-lg px-4 py-3 text-[15px] ring-1 ring-border-light
focus:ring-2 focus:ring-primary focus:outline-none
```

**변경점:** 기본 상태 테두리 제거, 배경색으로 필드 식별. 포커스 시 블루 ring.

**입력 필드 배경색 원칙**: 입력 필드는 **항상 부모 배경보다 한 단계 대비되는 색**을 사용하여 필드임을 인지할 수 있어야 함.
| 부모 배경 | 입력 필드 배경 | 추가 처리 |
|----------|---------------|----------|
| `bg-bg` (white) | `bg-bg-subtle` (연회색) | 없음 (기본) |
| `bg-bg-subtle` (연회색) | **`bg-bg` (white)** | `ring-1 ring-border-light` 미세 테두리 추가 |
| 다크: `bg-bg` (#1A1B1E) | `bg-bg-subtle` (#27282C) | 없음 |
| 다크: `bg-bg-subtle` (#27282C) | **`bg-bg` (#1A1B1E)** 또는 `bg-bg-hover` (#32343A) | `ring-1 ring-border-light` |

### 빈 상태 (Empty State, 유지)
```
py-8 text-center border border-dashed border-border rounded-lg
텍스트: text-sm text-text-tertiary
```

### 토스트 (유지)
```
하단 중앙, bg-text text-white rounded-lg px-4 py-2.5
3초 후 fade-out
```

### 모달 (유지)
```
bg-bg rounded-xl shadow-lg p-6
backdrop: bg-black/30
```
**변경점:** `rounded-lg → rounded-xl` (12px).

---

## 화면별 적용 가이드 (머릿속 그림)

개발자가 이 디자인 시스템을 컴포넌트에 적용할 때 참고할 예시.

### 1단계 홈 화면
```
  (pt-20 — 80px 상단 여백)
  
  회의 기록              ← Display (40px, Bold)
  
  (mt-8 — 32px)
  
  [ 새 회의 시작 ]        ← Primary 버튼, 크고 굵게
  
  (mt-20 — 80px)
  
  최근 회의              ← Title (28px, Bold)
  
  (mt-6 — 24px)
  
  ┌─────────────────┐    ← bg-bg-subtle, rounded-xl, 테두리 없음
  │ 04/15 주간 미팅  │
  │ 32분            │
  └─────────────────┘
```

### 3단계 녹음 화면
```
  (pt-20)
  
  정기 회의              ← Display (40px, Bold) — 회의 제목이 주인공
  ● 녹음 중 · 00:12:34    ← Small (13px, Medium)
  
  (mt-12 — 48px)
  
  [전사 블록들 쌓임]
  블록 간 space-y-3 (12px), 블록 자체는 투명 배경
```

### 6단계 요약 화면
```
  (pt-20)
  
  요약                    ← Display (40px, Bold)
  
  (mt-20)
  
  회의 개요              ← Title (28px, Bold, 기존 H2)
  - 내용...               ← Body
  
  (mt-20)
  
  주요 논의              ← Title (28px, Bold)
  
  (mt-12)
  
  1. 주제명              ← Subtitle (20px, Semibold, 기존 H3)
  **주요 논의**
  - 불릿...
```

---

## 간격 규칙 요약 (Tailwind 클래스 기준)

- 페이지 최상단: `pt-20` (80px)
- 페이지 좌우: `px-6 md:px-10`
- 최대 폭: 홈 `max-w-md`, 콘텐츠 `max-w-3xl`
- 섹션 간 (주요): `mt-20` (80px)
- 섹션 간 (서브): `mt-12` (48px)
- 카드 내부: `p-5` (20px)
- 리스트 항목 간: `space-y-2` (8px)
- 블록 간 (전사): `space-y-3` (12px)

---

## Hex 하드코딩 금지 원칙 (유지)

`text-[#6B7280]`, `bg-[#F8F9FA]` 같은 Tailwind arbitrary value 사용 금지.
반드시 시맨틱 토큰을 통해 색상을 참조할 것.

예외: 투명도 조합이 필요한 경우 `text-primary/10` 같은 opacity modifier는 허용.
예외 2: 타이포 크기 `text-[40px]`, `text-[28px]` 등은 허용 (Tailwind 기본 스케일에 40/28이 없으므로).

---

## v1 → v2 변경 요약 (체크리스트)

프론트엔드 구현 시 다음 항목을 확인:

- [ ] Primary 색 토큰: `#059669` → `#3182F6`
- [ ] Primary hover 토큰: `#047857` → `#1B64DA`
- [ ] `--color-bg-hover` 신규 추가: `#F0F2F5`
- [ ] `--color-template` 조정: `#ECFDF5` → `#EFF6FF`
- [ ] Inter 폰트 weight에 `700` 추가
- [ ] Display 사용처: 24px/600 → 40px/700
- [ ] Title(H2) 사용처: 18px/600 → 28px/700
- [ ] Subtitle(H3) 신규 도입: 20px/600
- [ ] 카드: `border border-border` → `bg-bg-subtle` (테두리 제거)
- [ ] 카드 라운드: `rounded-lg` → `rounded-xl`
- [ ] 카드 패딩: `p-3.5` → `p-5`
- [ ] 카드 hover: `hover:bg-bg-subtle` → `hover:bg-bg-hover`
- [ ] 입력 필드: 테두리 기반 → 배경색 기반 + focus ring
- [ ] 페이지 상단 패딩: 기본 → `pt-20`
- [ ] 홈 최대 폭: `max-w-xl` → `max-w-md`
- [ ] 섹션 간 간격: `mt-12~14` → `mt-20`
- [ ] 버튼 내부 아이콘: `size={18}` → `size={20}`
- [ ] 히어로 아이콘: `size={28}+` → `size={32}+`
- [ ] Primary 버튼: 크기·weight 상향 (`px-5 py-3 text-[15px] font-semibold`)
- [ ] 모달 라운드: `rounded-lg` → `rounded-xl`
