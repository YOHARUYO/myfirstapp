# 디자인 시스템 — 다크모드

> 작성일: 2026-04-20
> 상위 문서: `design-system.md` (v2 Toss-style Bold Editorial)
> 구현 대상: `frontend/src/index.css`

---

## 1. 기획 결정 사항

### 전환 방식

| 항목 | 결정 | 사유 |
|------|------|------|
| 모드 옵션 | **3가지**: 시스템 설정 / 라이트 / 다크 | 사용자 선택 존중 + OS 연동 |
| 기본값 | **시스템 설정 따름** (`prefers-color-scheme`) | 별도 설정 없이도 자연스럽게 동작 |
| 저장 위치 | `localStorage('theme')` | 서버 불필요, 새로고침 유지 |
| 전환 위치 | **설정 화면** 상단 (향후 헤더 토글도 검토 가능) | MVP에서는 설정 한 곳만 |
| 전환 애니메이션 | 없음 (즉시 전환) | 깜빡임 방지를 위해 CSS 변수 전환만 |

### 적용 범위

**전체 앱에 일괄 적용** — 페이지별 분리 없음.

| 영역 | 적용 내용 |
|------|----------|
| 전체 배경 | `#FFFFFF` → `#1A1B1E` |
| 카드/블록 배경 | `#F8F9FA` → `#27282C` |
| 텍스트 | `#1A1A1A` → `#ECEDF0` |
| 입력 필드 | 배경색 기반 유지 (톤만 반전) |
| 모달 | 배경 `#FFFFFF` → `#27282C`, backdrop 농도 상향 |
| 토스트 | `bg-text text-white` → `bg-[#E0E0E0] text-[#1A1A1A]` (반전) |
| 중요도 바 | 색상 유지 (빨강/앰버/회색은 다크에서도 인지도 동일) |
| 녹음 dot/Status | 색상 유지 (빨강/초록/노랑은 다크 배경에서 오히려 선명) |
| Wizard Stepper | 비활성 dot 색상만 조정 |
| 스크롤바 | OS 기본 (커스텀 X) |

---

## 2. 다크모드 색상 토큰

### 매핑 테이블 (Light → Dark)

| 토큰 | Light 값 | Dark 값 | 비고 |
|------|----------|---------|------|
| **Brand** | | | |
| `--color-primary` | `#3182F6` | `#4A9AFF` | 밝기 약간 상향 (어두운 배경 대비) |
| `--color-primary-hover` | `#1B64DA` | `#3182F6` | hover를 라이트의 기본으로 |
| **Text** | | | |
| `--color-text` | `#1A1A1A` | `#ECEDF0` | 밝은 흰색 (순백 아님, 눈 부심 방지) |
| `--color-text-secondary` | `#6B7280` | `#9CA3AF` | 한 단계 밝게 |
| `--color-text-tertiary` | `#9CA3AF` | `#6B7280` | 라이트의 secondary 수준 |
| **Background** | | | |
| `--color-bg` | `#FFFFFF` | `#1A1B1E` | 순검정 아님 (Toss 다크 레퍼런스) |
| `--color-bg-subtle` | `#F8F9FA` | `#27282C` | 카드/블록 배경 |
| `--color-bg-hover` | `#F0F2F5` | `#32343A` | hover 시 한 단계 밝게 |
| **Border** | | | |
| `--color-border` | `#E5E7EB` | `#3A3C42` | 어두운 구분선 |
| `--color-border-light` | `#F3F4F6` | `#2E3035` | 연한 구분선 |
| **Status** | | | |
| `--color-recording` | `#EF4444` | `#EF4444` | 유지 |
| `--color-success` | `#10B981` | `#34D399` | 약간 밝게 (가독성) |
| `--color-warning` | `#F59E0B` | `#FBBF24` | 약간 밝게 |
| `--color-warning-bg` | `#FFFBEB` | `#3D3520` | 어두운 노란 톤 |
| `--color-warning-text` | `#92400E` | `#FCD34D` | 다크 배경에서 읽히도록 밝게 |
| **Importance** | | | |
| `--color-importance-high` | `#EF4444` | `#EF4444` | 유지 |
| `--color-importance-medium` | `#F59E0B` | `#FBBF24` | 약간 밝게 |
| `--color-importance-low` | `#D1D5DB` | `#4B5563` | 어두운 회색 |
| **Contextual** | | | |
| `--color-template` | `#EFF6FF` | `#1E2A3A` | 어두운 블루 톤 |
| `--color-missing` | `#FFFBEB` | `#3D3520` | 어두운 앰버 톤 |

### 색상 선정 원칙

1. **순검정(`#000000`) 사용 금지** — 다크 배경은 `#1A1B1E` (Toss/카카오뱅크 다크 레퍼런스)
2. **순백(`#FFFFFF`) 텍스트 금지** — `#ECEDF0`으로 눈 부심 완화
3. **Status/Importance 색상은 최대한 유지** — 의미 전달이 색상에 의존하므로 톤만 미세 조정
4. **Primary는 밝기만 올림** — 색조(hue) 변경 없음, 어두운 배경 대비 확보
5. **레이어 위계 = 밝기 위계** — bg(가장 어두움) < bg-subtle(카드) < bg-hover(활성) 순으로 밝아짐

---

## 3. 구현 방식

### CSS 구조 (Tailwind CSS v4 + CSS 변수)

```css
/* index.css — 다크모드 추가 구조 */

@theme {
  /* Light mode 기본값 (기존 유지) */
  --color-primary: #3182F6;
  --color-text: #1A1A1A;
  --color-bg: #FFFFFF;
  /* ... 기존 그대로 ... */
}

/* Dark mode overrides */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --color-primary: #4A9AFF;
    --color-primary-hover: #3182F6;
    --color-text: #ECEDF0;
    --color-text-secondary: #9CA3AF;
    --color-text-tertiary: #6B7280;
    --color-bg: #1A1B1E;
    --color-bg-subtle: #27282C;
    --color-bg-hover: #32343A;
    --color-border: #3A3C42;
    --color-border-light: #2E3035;
    --color-success: #34D399;
    --color-warning: #FBBF24;
    --color-warning-bg: #3D3520;
    --color-warning-text: #FCD34D;
    --color-importance-medium: #FBBF24;
    --color-importance-low: #4B5563;
    --color-template: #1E2A3A;
    --color-missing: #3D3520;
  }
}

/* 사용자가 명시적으로 다크 선택 시 */
:root[data-theme="dark"] {
  --color-primary: #4A9AFF;
  --color-primary-hover: #3182F6;
  --color-text: #ECEDF0;
  --color-text-secondary: #9CA3AF;
  --color-text-tertiary: #6B7280;
  --color-bg: #1A1B1E;
  --color-bg-subtle: #27282C;
  --color-bg-hover: #32343A;
  --color-border: #3A3C42;
  --color-border-light: #2E3035;
  --color-success: #34D399;
  --color-warning: #FBBF24;
  --color-warning-bg: #3D3520;
  --color-warning-text: #FCD34D;
  --color-importance-medium: #FBBF24;
  --color-importance-low: #4B5563;
  --color-template: #1E2A3A;
  --color-missing: #3D3520;
}
```

### 전환 로직 (JavaScript)

```typescript
// utils/theme.ts
type Theme = 'system' | 'light' | 'dark';

export function getTheme(): Theme {
  return (localStorage.getItem('theme') as Theme) || 'system';
}

export function setTheme(theme: Theme) {
  localStorage.setItem('theme', theme);
  applyTheme(theme);
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', theme);
  }
}

// 앱 초기화 시 호출 (main.tsx 또는 index.html <script>)
export function initTheme() {
  applyTheme(getTheme());
}
```

### FOUC(Flash of Unstyled Content) 방지

```html
<!-- index.html <head> 안에 인라인 스크립트 -->
<script>
  (function() {
    const theme = localStorage.getItem('theme');
    if (theme && theme !== 'system') {
      document.documentElement.setAttribute('data-theme', theme);
    }
  })();
</script>
```

---

## 4. 설정 화면 UI

### 설정 화면에 추가될 섹션

```
──── 외관 ────
  테마: [ 시스템 설정 | 라이트 | 다크 ]    ← 세그먼트 컨트롤 (3옵션)
```

- **위치**: 설정 화면 최상단 (가장 먼저 보이는 곳)
- **컨트롤**: 3-way 세그먼트 (MeetingSetup의 입력 소스 선택과 동일 패턴)
- **즉시 반영**: 선택 즉시 테마 전환 (저장 버튼 불필요)
- **아이콘**: Sun(라이트) / Moon(다크) / Monitor(시스템) — lucide-react

---

## 5. 화면별 다크모드 적용 포인트

### 전체 공통

| 요소 | 라이트 | 다크 | 비고 |
|------|--------|------|------|
| 페이지 배경 | `bg-bg` (white) | `bg-bg` (자동 전환) | CSS 변수로 자동 |
| 카드 | `bg-bg-subtle` | `bg-bg-subtle` (자동) | 토큰 사용 시 변경 불필요 |
| 입력 필드 | `bg-bg-subtle` focus:`bg-white` | focus:`bg-bg` | **focus 시 bg-white → bg-bg로 변경 필요** |
| 모달 backdrop | `bg-black/30` | `bg-black/50` | 농도 상향 (배경과 구분) |
| 텍스트 | `text-text` 계열 | 자동 전환 | 토큰 사용 시 변경 불필요 |
| 구분선 | `border-border` | 자동 전환 | 토큰 사용 시 변경 불필요 |

### 주의가 필요한 곳 (하드코딩 가능 지점)

| 위치 | 확인 사항 |
|------|----------|
| 입력 필드 focus | `focus:bg-white` → `focus:bg-bg`로 교체 필요 |
| 토스트 | `bg-text text-white` — 다크에서는 반전 필요 (밝은 배경 + 어두운 텍스트) |
| Wizard Stepper dot | 비활성 dot이 `bg-gray-300` 등 하드코딩이면 토큰으로 교체 |
| 모달 본문 배경 | `bg-bg` 사용 확인 (bg-white 하드코딩이면 교체) |
| 중요도 팝오버 배경 | 흰색 하드코딩 확인 |
| 녹음 상태바 | 배경색 확인 |

### 영향 없는 곳 (자동 전환)

기존 코드가 시맨틱 토큰(`bg-bg`, `text-text`, `bg-bg-subtle` 등)을 사용하는 경우 CSS 변수 오버라이드만으로 자동 전환. **추가 코드 변경 없음.**

---

## 6. 토스트 다크모드 처리

토스트는 라이트/다크에서 반전 패턴을 사용:

| 모드 | 배경 | 텍스트 |
|------|------|--------|
| 라이트 | 어두운 배경 (`bg-text`) | 흰색 (`text-white`) |
| 다크 | 밝은 배경 (`bg-[#E8E9EB]`) | 어두운 (`text-[#1A1A1A]`) |

**구현 방법**: 토스트 전용 토큰 추가

```css
--color-toast-bg: #1A1A1A;       /* Light: 어두운 배경 */
--color-toast-text: #FFFFFF;      /* Light: 흰 텍스트 */

/* Dark override */
--color-toast-bg: #E8E9EB;       /* Dark: 밝은 배경 */
--color-toast-text: #1A1A1A;     /* Dark: 어두운 텍스트 */
```

---

## 7. 개발 세션 전달 사항 (구현 가이드)

### 작업 순서 (권장)

1. **index.css에 다크모드 CSS 변수 오버라이드 추가** (이 문서 3절 참조)
2. **index.html에 FOUC 방지 인라인 스크립트 추가**
3. **utils/theme.ts 생성** + main.tsx에서 initTheme() 호출
4. **하드코딩 색상 교체** (5절 "주의가 필요한 곳" 확인)
   - `bg-white` → `bg-bg`
   - `focus:bg-white` → `focus:bg-bg`
   - 토스트 색상 → 토큰 교체
   - 모달 backdrop 농도 조건부 처리
5. **설정 화면에 테마 세그먼트 컨트롤 추가**
6. **브라우저에서 시각 확인** (라이트/다크 각각)

### 주의사항

- **중요도 태깅 색상 체계 변경 금지** — high(`#EF4444`)는 다크에서도 유지
- 녹음 dot / Status 색상 유지
- 토큰만 교체하면 되는 곳은 건드리지 말 것 (자동 전환)
- `design-system.md`의 "Hex 하드코딩 금지 원칙" 준수 확인 계기로 활용

---

## 8. 향후 확장

| 항목 | 현재 | 향후 |
|------|------|------|
| 전환 위치 | 설정 화면만 | 헤더/홈 화면에 빠른 토글 아이콘 |
| 전환 애니메이션 | 없음 | `transition: background 0.2s` 검토 |
| 이미지/아이콘 | lucide SVG (자동 상속) | 래스터 이미지 있으면 다크 대응 필요 |
| 다크모드 전용 일러스트 | — | 빈 상태 일러스트 추가 시 검토 |

---

## 9. 체크리스트 (개발 완료 확인용)

- [ ] `index.css`에 다크모드 CSS 변수 오버라이드 추가
- [ ] `index.html`에 FOUC 방지 스크립트 추가
- [ ] `utils/theme.ts` 생성 + `main.tsx`에서 초기화
- [ ] 설정 화면에 테마 세그먼트 컨트롤 추가 (Sun/Moon/Monitor 아이콘)
- [ ] `bg-white` 하드코딩 → `bg-bg` 교체 (입력 필드 focus 등)
- [ ] 토스트 전용 토큰 추가 + 적용
- [ ] 모달 backdrop 다크 농도 확인 (`bg-black/30` → 다크에서 `/50`)
- [ ] Wizard Stepper dot 토큰 확인
- [ ] 중요도 팝오버 배경 토큰 확인
- [ ] 라이트 모드 동작 확인 (기존과 동일)
- [ ] 다크 모드 동작 확인 (전 페이지)
- [ ] 시스템 설정 따름 동작 확인
- [ ] `localStorage` 저장/복원 확인
