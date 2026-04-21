# 기획 업무 보고서 — 2026-04-21

> 작성 주체: 기획 세션
> 대상 기간: 2026-04-21 (세 번째 기획 세션)
> 이전 보고서: `reports/PLAN-REPORT-20260420.md`
> 상태: **1차 작성 (오후 업데이트 예정)**

---

## 1. 오늘 수행한 작업 요약

Sprint 4 완료 후 사용자가 실사용 중 발견한 오류 및 개선 사항 5건을 검토하고, 기획 방향 수립 후 설계 문서에 반영했습니다.

| 카테고리 | 건수 | 요약 |
|---------|------|------|
| 현황 파악 | 6건 | 주요 문서 전문 재확인 (CLAUDE.md, HANDOVER.md, decisions.md, technical-design.md, design-system.md, DEV-REPORT-20260420.md) |
| Slack UX 개선 기획 | 2건 | 스레드 메시지 카드 UI, 전송 후 메시지 삭제 기능 |
| 버그 기획 대응 | 2건 | Slack 메시지 수정 미반영(6단계 저장 API 누락), 복구 플로우 충돌 재설계 |
| UI 개선 기획 | 2건 | 녹음 컨트롤 sticky bottom 재배치, 반응형 Stepper 모바일 대응 |
| 문서 반영 | 2건 | decisions.md 3곳 수정, technical-design.md 3곳 수정 |

---

## 2. 변경된 파일 목록

| 파일 | 변경 유형 | 상세 |
|------|----------|------|
| `decisions.md` | 3곳 수정 | 아래 3절 참조 |
| `technical-design.md` | 3곳 수정 | 아래 3절 참조 |
| `reports/PLAN-REPORT-20260421.md` | 신규 생성 | 본 리포트 |

---

## 3. 주요 결정 사항

### 3-1. Slack 메시지에 수정 내용 미반영 (버그 → 설계 보완)

**문제**: 5단계 전사 수정, 6단계 요약 수정 후 7단계에서 Slack 전송 시 수정 내용이 반영되지 않음.

**원인**: 6단계에서 편집된 요약/액션 아이템을 서버에 저장하는 API가 설계에 누락되어 있었음.

**반영 내용 (technical-design.md)**:
- `PATCH /api/sessions/{id}/summary` — 요약 마크다운 저장 (신규)
- `PATCH /api/sessions/{id}/action-items` — 액션 아이템 목록 저장 (신규)
- Slack 전송 시 최신 데이터를 실시간으로 읽어 메시지 조립한다는 원칙 명시

### 3-2. 녹음 컨트롤 접근성 (UI 개선)

**문제**: 전사가 길어지면 녹음 시작/중지 버튼이 화면 위로 밀려나 접근 불가.

**반영 내용 (decisions.md 3단계 레이아웃)**:
| 요소 | 변경 전 | 변경 후 |
|------|---------|---------|
| 컨트롤 바 | 전사 영역 위 (일반 흐름) | **sticky bottom** (항상 하단 고정) |
| 상태바 | 일반 흐름 | **sticky top** (녹음 상태 항상 확인) |
| 회의 정보 요약 | 기본 펼침 | **기본 접힘** (전사 영역 최대화) |

### 3-3. Stepper 모바일 대응 (UI 개선)

**문제**: 7단계 dot + 홈 아이콘이 모바일 화면 가로 폭을 초과.

**반영 내용 (decisions.md Stepper 섹션)**:
| 화면 | 표시 방식 |
|------|----------|
| 데스크탑 (768px+) | 기존 전체 dot + 라벨 |
| 모바일 (<768px) | `[🏠]  ◉ 4/7 편집` (현재 단계 번호/라벨만) |

### 3-4. 복구 플로우 충돌 (버그 → 재설계)

**문제**: 복구 시 2단계에 진입하여 새 세션 생성을 시도 → 기존 미완료 세션과 409 Conflict → 진행 불가.

**반영 내용 (decisions.md + technical-design.md)**:
- **복구 = 기존 세션 재개** (새 세션 생성 안 함, 기존 세션 ID 그대로 사용)
- 세션 status별 진입 단계 매핑: recording→3단계, processing→4단계, editing→5단계 등
- `POST /api/recovery/{id}/restore` 제거 → `GET /api/sessions/{id}`로 데이터 로드 후 라우팅
- 복구 배너를 카드 형태로 재설계 (마지막 상태 표시 + [이어서 진행] / [삭제하고 새로 시작])
- "새 회의 시작"은 기존 세션 삭제 후에만 가능

---

## 4. 전달 사항

### 개발 세션에 전달

**우선순위 높음 (버그):**
1. **6단계 저장 API 구현**: `PATCH /api/sessions/{id}/summary`, `PATCH /api/sessions/{id}/action-items` — technical-design.md 4-5절 참조
2. **복구 플로우 수정**: 기존 세션 재개 방식으로 전환, restore API 제거, status별 라우팅 — technical-design.md 4-10절 + decisions.md 복구 UX 참조
3. **복구 배너 UI 변경**: 카드 형태 + [이어서 진행]/[삭제하고 새로 시작] — decisions.md 복구 배너 참조

**우선순위 중간 (UX 개선):**
4. **3단계 레이아웃 재배치**: 컨트롤 바 sticky bottom, 상태바 sticky top, 회의 정보 기본 접힘 — decisions.md 3단계 레이아웃 참조
5. **반응형 Stepper**: 768px 미만에서 축약형 표시 — decisions.md 반응형 Stepper 참조

**이전 세션 전달 (미착수 확인 필요):**
6. **다크모드 구현**: design-system-dark.md 전문 참조 (PLAN-REPORT-20260420에서 전달됨)

---

## 5. 다음 세션에서 확인할 것

- 개발 세션 복구 플로우 수정 결과 확인
- 6단계 저장 → 7단계 Slack 전송 시 수정 내용 반영 확인
- 3단계 sticky bottom 컨트롤 바 시각 확인
- 모바일 Stepper 축약형 시각 확인
- **(오후 업데이트 시 추가 예정)**
