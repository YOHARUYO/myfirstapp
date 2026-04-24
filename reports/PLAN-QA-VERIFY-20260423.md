# 기획 → 검수 확인 요청 — 2026-04-23

> 작성 주체: 기획 세션
> 목적: 기획 기준 전체 점검에서 발견된 6건의 불일치/미확인 항목을 코드 레벨에서 확인 요청
> 참조: decisions.md, technical-design.md

---

## 배경

기획 세션에서 decisions.md + technical-design.md 전체를 기준으로 백엔드/프론트엔드 구현 상태를 점검했습니다.
전체적으로 95% 이상 기획대로 구현되어 있으나, 아래 6건은 코드를 직접 열어 확인이 필요합니다.

**확인 방법**: 각 항목의 "확인 위치"에 명시된 파일을 열고, "확인 포인트"를 체크해주세요.
결과는 항목별로 ✅ 정상 / ❌ 누락 / ⚠️ 부분 구현으로 판정하고, 누락·부분 구현인 경우 현재 코드 상태를 간단히 기술해주세요.

---

## 확인 항목 (6건)

### 1. [백엔드] `POST /api/meetings/{id}/resend-slack` API 누락 여부

**기획 근거**: technical-design.md 4-7절
```
| POST | /api/meetings/{id}/resend-slack | Slack 재전송 (다른 채널/스레드 선택 가능) |
```

**확인 위치**: `backend/routers/history.py` 또는 `backend/routers/slack.py`

**확인 포인트**:
- [ ] `POST /api/meetings/{id}/resend-slack` 엔드포인트가 존재하는가?
- [ ] 존재하지 않는다면, 기존 `POST /api/slack/send`가 `meeting_id`도 받아서 처리하는가? (대체 구현 여부)
- [ ] 프론트에서 재전송 시 어떤 API를 호출하는지 확인 (HistoryDetail.tsx → 재전송 버튼 onClick)

**판정 기준**: 히스토리에서 완료된 회의를 다른 채널/스레드로 재전송할 수 있으면 ✅, 불가능하면 ❌

---

### 2. [프론트] 히스토리 상세 — 재편집(✎) 버튼 존재 여부

**기획 근거**: decisions.md 히스토리 화면 상세 설계
```
[ ✎ 재편집 ]  [ 📨 재전송 ]  [ 📥 .md 다운로드 ]  [ 🗑 삭제 ]
```

**확인 위치**: `frontend/src/pages/HistoryDetail.tsx`

**확인 포인트**:
- [ ] "재편집" 버튼이 UI에 렌더링되는가?
- [ ] 클릭 시 editMode를 "meeting"으로 설정하고 5단계(Editing)로 이동하는가?
- [ ] 5단계에서 Meeting 블록 편집 API (`/api/meetings/{id}/blocks/...`)를 사용하는가?

**판정 기준**: 재편집 버튼 → 5단계 진입 → Meeting API 사용 플로우가 동작하면 ✅

---

### 3. [프론트] 히스토리 상세 — 재전송(📨) 버튼 존재 여부

**기획 근거**: decisions.md 히스토리 화면 상세 설계 (위 #2와 동일 섹션)

**확인 위치**: `frontend/src/pages/HistoryDetail.tsx`

**확인 포인트**:
- [ ] "재전송" 버튼이 UI에 렌더링되는가?
- [ ] 클릭 시 7단계(SendSave)로 이동하고, 기존 요약·액션 아이템을 로드하는가?
- [ ] #1의 API(resend-slack)와 연결되는가?

**판정 기준**: 재전송 버튼 존재 + 7단계 진입 + Slack 전송 가능하면 ✅

---

### 4. [프론트] 5→6 전환 시 "요약 생성/건너뛰기" 선택 모달

**기획 근거**: decisions.md 6단계 상세 설계
```
AI 요약을 생성할까요?

[ 요약 생성 ]    [ 건너뛰고 전송으로 ]

건너뛰기: 요약 없이 전사 원본만 저장·전송합니다.
```

**확인 위치**: `frontend/src/pages/Editing.tsx` (다음 단계 버튼 핸들러)

**확인 포인트**:
- [ ] 5단계에서 "다음 단계" 클릭 시 모달이 표시되는가?
- [ ] 모달에 "요약 생성"과 "건너뛰고 전송으로" 두 옵션이 있는가?
- [ ] "건너뛰고 전송으로" 선택 시 6단계를 건너뛰고 7단계(SendSave)로 직행하는가?
- [ ] 7단계에서 summary_markdown이 null인 경우를 처리하는가? (SendSave.tsx)

**주의**: `editedAfterSummary` 플래그는 6→5→6 재진입 시 "재요약" 모달용이므로, 이것과 별개로 **최초 5→6 전환 시 선택 모달**이 있어야 함.

**판정 기준**: 두 옵션 모달 존재 + 건너뛰기 시 5→7 직행 가능하면 ✅

---

### 5. [프론트] 3단계 마이크 민감도 슬라이더 배치 위치

**기획 근거**: decisions.md 3단계 상세 설계
```
마이크 민감도 슬라이더: 회의 정보 패널 안, 언어 설정 아래에 배치
패널이 접힌 상태에서는 보이지 않아 녹음 화면 정돈 유지
```

**확인 위치**: `frontend/src/pages/Recording.tsx`

**확인 포인트**:
- [ ] 마이크 민감도 슬라이더가 존재하는가?
- [ ] 슬라이더가 회의 정보 접기 패널 **안**에 있는가? (패널 접으면 슬라이더도 숨겨지는가?)
- [ ] 범위가 0.5x ~ 5.0x인가? (기존 3.0x에서 변경됨)
- [ ] 실시간 GainNode 조절이 동작하는가?

**판정 기준**: 패널 내부 배치 + 접힘 시 숨김 + 5.0x 범위면 ✅

---

### 6. [백엔드] Session `action_items` 타입 일관성

**기획 근거**: technical-design.md 3-2절 Session 모델 + 3-3절 Meeting 모델
- ActionItem 스키마: fu_id, assignee, task, deadline, source_topic

**확인 위치**: `backend/models/session.py`, `backend/models/meeting.py`, `backend/models/base.py`

**확인 포인트**:
- [ ] Session 모델의 `action_items` 필드 타입이 `List[ActionItem]`인가, `List[dict]`인가?
- [ ] Meeting 모델의 `action_items` 필드 타입이 `List[ActionItem]`인가?
- [ ] 두 모델이 동일한 ActionItem 타입을 사용하는가?
- [ ] 불일치 시 실제 동작에 영향이 있는가? (직렬화/역직렬화 오류 가능성)

**판정 기준**: 두 모델 모두 `List[ActionItem]`이면 ✅, `List[dict]`이지만 동작에 문제없으면 ⚠️

---

## 리포트 양식

확인 결과를 아래 형태로 정리해주세요:

```markdown
| # | 항목 | 판정 | 현재 상태 |
|---|------|------|----------|
| 1 | resend-slack API | ✅/❌/⚠️ | (현재 코드 상태 설명) |
| 2 | 재편집 버튼 | ✅/❌/⚠️ | ... |
| 3 | 재전송 버튼 | ✅/❌/⚠️ | ... |
| 4 | 요약 스킵 모달 | ✅/❌/⚠️ | ... |
| 5 | 민감도 슬라이더 위치 | ✅/❌/⚠️ | ... |
| 6 | action_items 타입 | ✅/❌/⚠️ | ... |
```

❌ 판정 항목은 수정이 필요하므로, 어떤 변경이 필요한지도 간단히 기술해주세요.
```
