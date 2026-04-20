# 기획 CLI 전달 지시문: 디자인 시스템 v2 개편

> 이 파일을 기획 CLI 세션에서 열고, 내용을 그대로 수행하도록 지시해주세요.
> 
> **사용 방법:**
> 1. 프로젝트 폴더에서 기획 CLI(Claude Code CLI) 실행
> 2. 첫 메시지: `"HANDOVER.md 읽어줘. 기획 세션이야."`
> 3. 두 번째 메시지: `"design-system-v2-지시문.md 파일 읽고 그대로 수행해줘. 특히 백업 단계를 반드시 먼저 실행해."` (이 파일을 프로젝트 폴더에 복사해두면 됨)

---

## 변경 요청: 디자인 시스템 v2 — "Toss-style Bold Editorial" 방향으로 개편

### 배경·사유

사용자가 현재 디자인 시스템(Vercel 스타일 기반)에 대해 "완성도가 부족하다"고 피드백했음. 여러 레퍼런스를 검토한 결과, 다음 두 가지가 원인으로 파악됨:

1. **정보 밀도가 높고 위계가 약함** — 모노톤 기조에 타이포 위계가 3단계로만 분산되어 "한 화면에 주인공이 없는" 느낌
2. **테두리 위주의 경계 처리** — 카드마다 테두리를 긋다 보니 화면이 조밀하고 정돈되지 않은 인상

레퍼런스 탐색 결과 **Toss (메인 레퍼런스)** + **Apple News (서브 레퍼런스)** 방향으로 개편하기로 결정. 핵심 전략:

- **컬러는 최소 변경** (Primary만 그린 → 블루)
- **레이아웃과 타이포그래피로 볼드함 구현** — Display 크기 확대, Weight 대비 강화, 여백 확대
- **테두리 제거 → 배경색 블록으로 섹션 경계 표현** (Toss/Apple News 공통 문법)

---

### ⚠️ 백업·롤백 정책 (먼저 수행)

**모든 수정 작업 전에 반드시 다음을 수행할 것:**

#### 1. 문서 백업

다음 디렉토리를 새로 생성하고 현재 파일들을 복사할 것:

```
/backups/design-system-v1-20260417/
  ├── design-system.md          ← 현재 design-system.md 복사본
  ├── technical-design.md       ← 현재 technical-design.md 복사본
  └── README.md                 ← 아래 내용으로 작성
```

**`/backups/design-system-v1-20260417/README.md` 내용:**

```markdown
# 디자인 시스템 v1 백업

- 백업 일자: 2026-04-17
- 백업 사유: 디자인 시스템 v2 "Toss-style Bold Editorial" 개편 전 상태 보존
- 복원 방법: 이 디렉토리의 파일들을 프로젝트 루트로 복사하면 v1 상태로 되돌아감
- v1 특징: Vercel 스타일, Primary 그린(#059669), 테두리 위주 경계, Display 24px

## 함께 되돌려야 하는 파일 (개발 세션 책임)
- frontend/src/index.css (v1 색상 토큰 및 타이포 설정)
- 개발 CLI가 별도로 frontend/src/index.css의 v1 버전을 backups/frontend-v1-20260417/에 백업해야 함
```

#### 2. .gitignore 확인

`/backups/` 디렉토리가 git에 포함되는지 확인. 만약 `.gitignore`에 `backups/`가 있으면 **제거**할 것 (백업은 버전 관리에 포함되어야 함).

#### 3. 백업 완료 후에만 본 지시문의 "변경 상세" 진행

---

### 대상 파일

1. **`design-system.md`** — 전면 개정 (아래 "변경 상세 1" 참조)
2. **`technical-design.md`** — 1절 내 "디자인 시스템" 섹션 축약 수정 (아래 "변경 상세 2" 참조)
3. **`HANDOVER.md`** — 10절 "기획→개발 전달 사항"에 개발 CLI용 지시문 추가 (아래 "변경 상세 3" 참조)

---

### 변경 상세 1: `design-system.md` 전면 교체

`design-system.md` 파일 전체를 아래 내용으로 교체할 것:

````markdown
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

**v2:**
```
bg-bg-subtle rounded-lg px-4 py-3 text-[15px]
focus:bg-white focus:ring-2 focus:ring-primary focus:outline-none
```

**변경점:** 기본 상태 테두리 제거, 배경색으로 필드 식별. 포커스 시 흰 배경 + 블루 ring.

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
````

---

### 변경 상세 2: `technical-design.md` 내 디자인 시스템 섹션 수정

`technical-design.md` 1절(기술 스택 확정) 안에 있는 **"디자인 시스템"** 서브섹션은 내용이 `design-system.md`와 중복되므로 **축약하여 포인터 역할만** 수행하도록 수정할 것.

**수정 대상:** `technical-design.md` 파일에서 `### 디자인 시스템` 헤더부터 `#### Tailwind CSS 설정` 코드블록 끝까지 (대략 "디자인 톤"부터 "Tailwind CSS 설정"의 `}` 까지).

**수정 후 내용:**

```markdown
### 디자인 시스템

**독립 문서로 분리됨.** 상세 내용은 `design-system.md` 참조.

현재 버전: **v2 "Toss-style Bold Editorial"** (2026-04-17 개편).
이전 버전(v1 Vercel 스타일) 백업: `backups/design-system-v1-20260417/`.

핵심 원칙 요약:
- 레퍼런스: Toss (메인) + Apple News (서브)
- 컬러: 모노톤 기반, Primary `#3182F6` (블루)
- 타이포: Pretendard + Inter + JetBrains Mono, Display 40px/700 중심의 볼드 위계
- 레이아웃: 테두리 대신 배경색 블록, 여백 확대, "한 화면 한 초점" 원칙
- 중요도 태깅: 상/중/하/최하 색 체계 유지 (`#EF4444` / `#F59E0B` / `#D1D5DB` / 투명)

Tailwind CSS 설정과 색상 토큰의 상세 정의는 `design-system.md` 참조.
구현 파일: `frontend/src/index.css` (`@theme` 블록).
```

**주의:** 수정 시 주변 맥락(1절 헤딩 구조, 다른 테이블과의 연결)이 깨지지 않도록 앞뒤 연결부를 확인할 것. `### 디자인 시스템` 헤더 자체는 유지하고 그 아래 내용만 교체.

---

### 변경 상세 3: `HANDOVER.md` 업데이트

#### 3-1. 10절 "기획→개발 전달 사항" 섹션에 다음 내용을 기록:

```markdown
### 기획→개발 전달 사항

#### [2026-04-17] 디자인 시스템 v2 개편

**개요:**
디자인 시스템을 v1 "Vercel 스타일"에서 v2 "Toss-style Bold Editorial"로 개편함.
상세 규격은 `design-system.md` 참조.

**개발 세션이 수행해야 할 작업:**

1. **백업 (필수 선행)**
   - `backups/frontend-v1-20260417/` 디렉토리 생성
   - `frontend/src/index.css` 현재 파일을 해당 디렉토리에 복사
   - 이미 구현된 컴포넌트 중 v1 스타일이 하드코딩된 것이 있다면 주요 파일도 함께 백업
   - 백업 디렉토리에 README.md 작성 (복원 방법 명시)

2. **`frontend/src/index.css` 업데이트**
   - `--color-primary`: `#059669` → `#3182F6`
   - `--color-primary-hover`: `#047857` → `#1B64DA`
   - `--color-bg-hover` 신규 추가: `#F0F2F5`
   - `--color-template`: `#ECFDF5` → `#EFF6FF`
   - 타이포 관련 커스텀 클래스 또는 설정이 있다면 `design-system.md`의 크기 규칙대로 갱신

3. **`frontend/index.html` 폰트 로드 수정**
   - Google Fonts URL의 Inter weight에 `700` 추가
   - 기존: `family=Inter:wght@400;500;600`
   - 변경: `family=Inter:wght@400;500;600;700`

4. **구현 완료된 컴포넌트 재스타일링** (Sprint 1-2 산출물)
   - `HomePage`, `MeetingSetup`, `Recording` 등 구현된 페이지/컴포넌트에 새 디자인 시스템 적용
   - 주요 변경:
     - Display 크기를 40px/700로
     - 카드의 테두리를 배경색(`bg-bg-subtle`)으로 전환, 라운드 xl, 패딩 p-5
     - 입력 필드를 배경색 기반으로 전환
     - 페이지 상단 여백 `pt-20`, 섹션 간 `mt-20`
     - 홈 화면 최대 폭 `max-w-md`
   - `design-system.md`의 "v1 → v2 변경 요약 (체크리스트)" 를 항목별로 따라가며 확인

5. **시각 확인 후 피드백 보고**
   - dev server를 띄운 상태에서 사용자가 직접 확인할 수 있도록 준비
   - 구현 후 "개발→기획 전달 사항"에 적용 결과 또는 이슈 보고

**롤백 방법:**
- `backups/frontend-v1-20260417/` 의 파일들을 원래 경로로 복사하면 v1 상태로 복원
- `backups/design-system-v1-20260417/` 의 문서도 함께 복원 필요

**주의:**
- 중요도 태깅 색상 체계(`#EF4444` / `#F59E0B` / `#D1D5DB` / 투명)는 **변경하지 말 것** — 사용자가 명시적으로 유지 요청
- 기존 Status 색상(recording/success/warning)도 유지
- 기능·인터랙션 로직은 변경 없음 — 순수 스타일 변경
```

#### 3-2. 2절 "현재 상태" 표 업데이트

`HANDOVER.md` 2절의 "디자인 시스템" 행을 다음과 같이 수정:

```markdown
| 디자인 시스템 | ✅ v2 개편 완료 (기획) / ⏳ 개발 반영 대기 | `design-system.md` (v2 Toss-style Bold Editorial) / v1 백업: `backups/design-system-v1-20260417/` |
```

#### 3-3. 7절 "알려진 제약 및 주의사항" 끝에 다음 행 추가:

```markdown
| 디자인 시스템 버전 | 현재 v2. v1 상태로 돌아가야 할 경우 `backups/design-system-v1-20260417/` + `backups/frontend-v1-20260417/` 복원 |
```

---

### 주의사항

1. **순서를 지킬 것**: 반드시 **백업 → 문서 수정** 순서로 진행. 백업 없이 수정 시작 금지.
2. **건드리면 안 되는 것**:
   - 중요도 태깅 색상 (상/중/하/최하 `#EF4444` / `#F59E0B` / `#D1D5DB` / 투명) — 유지
   - Status 색상 (recording/success/warning) — 유지
   - 폰트 스택 Pretendard + Inter + JetBrains Mono — 유지
   - `decisions.md` (기능·UX 기획서) — 이번 변경과 무관
3. **`design-system.md` 상단의 "이전 버전" 링크 경로**가 실제 백업 디렉토리 경로와 일치하는지 확인.
4. **Tailwind 버전 확인**: 프로젝트가 Tailwind v4를 쓰므로 `@theme` 블록 방식이 v1·v2 모두 동일. v4 기반으로 작성됨을 전제.
5. 수정 완료 후 기획 CLI는 변경된 파일 목록과 백업 경로를 사용자에게 보고할 것.

---

### 완료 조건

기획 CLI는 다음을 모두 충족하면 작업 완료:

- [ ] `backups/design-system-v1-20260417/` 디렉토리 생성 및 `design-system.md`, `technical-design.md` 복사, README.md 작성
- [ ] `.gitignore`에서 `backups/` 제외 규칙이 있으면 제거 (확인만)
- [ ] `design-system.md` 전면 교체 (위 "변경 상세 1" 내용)
- [ ] `technical-design.md` 내 디자인 시스템 섹션 축약 (위 "변경 상세 2" 내용)
- [ ] `HANDOVER.md` 10절, 2절, 7절 업데이트 (위 "변경 상세 3" 내용)
- [ ] 작업 완료 보고: 변경된 파일 리스트와 백업 경로를 사용자에게 요약 보고
