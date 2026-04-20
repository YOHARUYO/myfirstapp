# 디자인 시스템

> 마지막 업데이트: 2026-04-17
> 구현 파일: `frontend/src/index.css` (`@theme` 블록)

---

## 디자인 톤

**Vercel/Stripe 스타일** — 극도로 절제된 색상, 모노톤 기조, 타이포그래피와 여백으로 위계를 표현.
다색 요소(중요도 태깅)는 작은 세로 바에만 한정하여 모노톤 유지.

- 라이트 모드 기본 (다크 모드는 향후 확장)
- 그림자 최소, 모달에만 `shadow-lg`
- 모서리 `rounded-lg` (8px) 통일

---

## 색상 토큰

모든 컴포넌트는 hex 하드코딩 대신 아래 시맨틱 토큰을 사용합니다.

### Brand
| 토큰 | 값 | Tailwind 클래스 | 용도 |
|------|-----|----------------|------|
| `--color-primary` | `#059669` | `text-primary`, `bg-primary` | 주요 버튼, 링크, 활성 상태 (그린 계열) |
| `--color-primary-hover` | `#047857` | `hover:bg-primary-hover` | Primary 버튼 hover |

### Text
| 토큰 | 값 | Tailwind 클래스 | 용도 |
|------|-----|----------------|------|
| `--color-text` | `#1A1A1A` | `text-text` | 본문, 제목 |
| `--color-text-secondary` | `#6B7280` | `text-text-secondary` | 부가 정보, 라벨 |
| `--color-text-tertiary` | `#9CA3AF` | `text-text-tertiary` | 비활성, 힌트 |

### Background
| 토큰 | 값 | Tailwind 클래스 | 용도 |
|------|-----|----------------|------|
| `--color-bg` | `#FFFFFF` | `bg-bg` | 전체 배경 |
| `--color-bg-subtle` | `#F8F9FA` | `bg-bg-subtle` | 카드, 블록 배경, hover |

### Border
| 토큰 | 값 | Tailwind 클래스 | 용도 |
|------|-----|----------------|------|
| `--color-border` | `#E5E7EB` | `border-border` | 구분선, 카드 테두리 |
| `--color-border-light` | `#F3F4F6` | `border-border-light` | 연한 구분선 |

### Status
| 토큰 | 값 | Tailwind 클래스 | 용도 |
|------|-----|----------------|------|
| `--color-recording` | `#EF4444` | `text-recording` | 녹음 dot, 중지 버튼 |
| `--color-success` | `#10B981` | `text-success` | 완료 표시 |
| `--color-warning` | `#F59E0B` | `text-warning` | 경고 아이콘 |
| `--color-warning-bg` | `#FFFBEB` | `bg-warning-bg` | 경고 배너 배경 |
| `--color-warning-text` | `#92400E` | `text-warning-text` | 경고 배너 텍스트 |

### Importance (중요도 태깅)
| 토큰 | 값 | Tailwind 클래스 | 용도 |
|------|-----|----------------|------|
| `--color-importance-high` | `#EF4444` | `bg-importance-high` | 상 — 빨강 바 |
| `--color-importance-medium` | `#F59E0B` | `bg-importance-medium` | 중 — 앰버 바 |
| `--color-importance-low` | `#D1D5DB` | `bg-importance-low` | 하 — 연회색 바 |
| (최하) | 투명 | 바 없음 | 최하 |

### Contextual
| 토큰 | 값 | Tailwind 클래스 | 용도 |
|------|-----|----------------|------|
| `--color-template` | `#ECFDF5` | `bg-template` | 템플릿 자동 채움 필드 배경 (연한 그린) |
| `--color-missing` | `#FFFBEB` | `bg-missing` | 미입력 필드 강조 배경 |

---

## 타이포그래피

### 폰트 스택
```
--font-sans: 'Pretendard Variable', 'Pretendard', 'Inter', -apple-system, sans-serif
--font-mono: 'JetBrains Mono', monospace
```

- **Pretendard**: 한글·영문 1순위 (CDN: jsdelivr, variable subset)
- **Inter**: Pretendard 미지원 문자 fallback (Google Fonts)
- **JetBrains Mono**: 타임스탬프, 코드 (Google Fonts)

### 로드 방식 (index.html)
```html
<link rel="stylesheet" as="style" crossorigin
  href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap"
  rel="stylesheet" />
```

### 크기 규칙
| 용도 | 크기 | weight | 클래스 |
|------|------|--------|--------|
| 본문 | 15px (body 기본) | 400 | — |
| 페이지 제목 | 24px | 600 | `text-2xl font-semibold` |
| 섹션 제목 | 18px | 600 | `text-lg font-semibold` |
| 라벨/보조 | 13-14px | 400-500 | `text-sm`, `text-xs` |
| 타임스탬프 | 12px | 400 | `text-xs font-mono` |

---

## 아이콘

### 라이브러리
- **lucide-react** (npm: `lucide-react`)
- Stroke 기반 SVG, 일관된 선 두께

### 사용 규칙
- 이모지 사용 금지 — 모든 아이콘은 lucide-react SVG 컴포넌트
- 기본 크기:
  - 인라인 텍스트 옆: `size={14}` ~ `size={16}`
  - 버튼 내부: `size={18}`
  - 히어로/강조: `size={28}` 이상
- 색상은 부모의 `text-*` 클래스로 상속

### 주요 아이콘 매핑
| 용도 | 아이콘 | import |
|------|--------|--------|
| 마이크/녹음 | `Mic` | `lucide-react` |
| 설정 | `Settings` | `lucide-react` |
| 뒤로가기 | `ArrowLeft` | `lucide-react` |
| 시간 | `Clock` | `lucide-react` |
| 화살표(목록) | `ChevronRight` | `lucide-react` |
| 경고 | `AlertCircle` | `lucide-react` |
| 체크(완료) | `Check` | `lucide-react` |
| 검색 | `Search` | `lucide-react` |
| 편집 | `Pencil` | `lucide-react` |
| 삭제 | `Trash2` | `lucide-react` |
| 업로드 | `Upload` | `lucide-react` |
| 전송 | `Send` | `lucide-react` |
| 저장 | `Download` | `lucide-react` |

---

## 컴포넌트 스타일 가이드

### 버튼
| 유형 | 스타일 |
|------|--------|
| Primary | `bg-primary text-white rounded-lg hover:bg-primary-hover` |
| Secondary | `border border-border text-text rounded-lg hover:bg-bg-subtle` |
| Danger | `bg-recording text-white rounded-lg` |
| Ghost | `text-text-secondary hover:text-text` (테두리/배경 없음) |

### 카드/리스트 항목
```
border border-border rounded-lg p-3.5
hover:bg-bg-subtle cursor-pointer transition-colors
```

### 입력 필드
```
border border-border rounded-lg px-3 py-2
focus:border-primary focus:outline-none
```

### 빈 상태 (Empty State)
```
py-8 text-center border border-dashed border-border rounded-lg
텍스트: text-sm text-text-tertiary
```

### 토스트
```
하단 중앙, bg-text text-white rounded-lg px-4 py-2.5
3초 후 fade-out
```

### 모달
```
bg-bg rounded-lg shadow-lg p-6
backdrop: bg-black/30
```

---

## 간격 규칙

- 페이지 좌우 패딩: `px-6`
- 최대 폭: 홈 `max-w-xl`, 콘텐츠 `max-w-3xl`
- 섹션 간 간격: `mt-12` ~ `mt-14`
- 카드 내부: `p-3.5` ~ `p-4`
- 리스트 항목 간: `space-y-1.5` ~ `space-y-2`

---

## Hex 하드코딩 금지 원칙

`text-[#6B7280]`, `bg-[#F8F9FA]` 같은 Tailwind arbitrary value 사용 금지.
반드시 위의 시맨틱 토큰을 통해 색상을 참조할 것.

예외: 투명도 조합이 필요한 경우 `text-primary/10` 같은 opacity modifier는 허용.
