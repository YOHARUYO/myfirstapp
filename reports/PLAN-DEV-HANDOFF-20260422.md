# 기획 → 개발 전달 프롬프트 — 2026-04-22

> 이 문서를 개발 세션 시작 시 첫 메시지로 전달하세요.

---

## 개발 세션에 전달할 프롬프트

아래 내용을 개발 세션에 복사-붙여넣기하면 됩니다:

---

```
HANDOVER.md를 읽고 이어서 개발해줘. 아래 기획 변경 사항 반영 + 버그 수정을 요청해.

## 기획 변경 반영 (6건)

### 1. AI 태깅/요약 진행 표시
- 5단계 "AI 재태깅" 버튼: 클릭 → 로딩 스피너 + "태깅 중…"으로 전환, 완료 시 원복 + 토스트 "N개 블록 태깅 완료"
- 5→6 전환: 전체 화면 로딩 오버레이 — 스피너 + "AI 요약 생성 중…"
- 상세: decisions.md 5단계 "중요도 태깅" + 6단계 "요약 생성 타이밍" 참조

### 2. 키보드 명령어 변경 (3단계 녹음 + 5단계 편집 공통)
- **Shift+Enter**: 블록 분할 → **블록 내 줄바꿈(개행 삽입)**으로 변경
- **Ctrl+Enter (Mac: Cmd+Enter)**: **블록 분할** (신규)
- **Backspace 첫 블록 가드**: 첫 번째 블록에서 Backspace 시 병합 요청을 보내지 않도록 프론트에서 가드 추가
- 치트라인 업데이트: `Enter=확정 · Shift+Enter=줄바꿈 · Ctrl+Enter=분할 · Esc=취소`
- 상세: decisions.md "전사 편집 방식" + "앱 전체 편집 패턴 통일" 테이블 참조

### 3. 섹션 제목-콘텐츠 위계 강화
- Display 아래에 Small(13px, text-text-secondary) 서브텍스트 한 줄 추가
- 콘텐츠 영역을 bg-bg-subtle rounded-xl p-6으로 감싸기
- 적용 대상: 5단계(편집), 6단계(요약), 7단계(전송), 히스토리
- 상세: design-system.md "제목 → 콘텐츠 위계 강화 패턴" 참조

### 4. Slack 인사 문구 — 여러 줄 + 이모티콘
- 설정 화면의 인사 문구 입력을 <input> → <textarea>로 변경 (최소 3줄, 자동 확장)
- 줄바꿈, OS 이모티콘, :emoji_name: 문법 허용
- Slack 전송 시 줄바꿈을 \n으로 그대로 전달
- 상세: decisions.md 설정 화면 "메시지" 섹션 참조

### 5. 히스토리 회의록 삭제
- 히스토리 상세 하단에 [🗑 삭제] 버튼 추가
- 확인 모달 → DELETE /api/meetings/{id} → meeting JSON + 오디오 + export md 모두 삭제
- Slack 전송 이력 있으면 모달에 "Slack 메시지는 별도 삭제" 안내
- 백엔드: DELETE /api/meetings/{id} 엔드포인트 구현
- 상세: decisions.md 히스토리 "회의록 삭제" + technical-design.md 4-7 히스토리 참조

### 6. 7단계 Slack 미리보기 실시간 반영
- 7단계 진입 시 서버에서 최신 summary_markdown + action_items를 fetch하여 미리보기 생성 (캐시 사용 금지)
- 6→7 전환, 또는 6←→7 왕복 시 항상 최신 데이터로 미리보기 재생성
- 상세: decisions.md 7단계 "Slack 미리보기" 참조

---

## 버그 수정 (7건)

### B1. Slack 유저 ID가 코드로 표시 (#2)
- 증상: Slack 메시지에서 <@U079L6BBL8P> 형태의 유저 ID가 그대로 노출
- 원인: 서버에서 Slack mrkdwn의 유저 멘션을 display_name으로 치환하지 않음
- 수정: Slack 메시지 텍스트 내 <@UXXXXXX> 패턴을 users.info API로 display_name 매핑 후 치환. 스레드 카드 UI의 text_preview 가공 로직(technical-design.md 4-8절)과 동일 원리 적용

### B2. 재편집 블록 병합 404 (#3)
- 증상: 히스토리→재편집에서 병합 클릭 시 POST /api/sessions/mtg_xxx/blocks/blk_xxx/merge 404
- 원인: 재편집 모드(editMode: "meeting")에서 Session용 API를 호출하고 있음
- 수정: 프론트에서 editMode === "meeting"일 때 API 경로를 /api/meetings/{id}/blocks/... 로 분기. 백엔드에 Meeting 블록 편집 API 4종 추가 (split, merge, patch text, patch importance) — technical-design.md 4-7절 히스토리 참조

### B3. API 설정 미설정 표시 (#6)
- 증상: Slack, Claude API가 .env에 설정되어 있는데 설정 화면에서 "미설정"으로 표시
- 원인 추정: 서버 응답의 마스킹된 키(●●●●)를 프론트에서 빈 값으로 판단하거나, connected 플래그 확인 누락
- 수정: 설정 API 응답에 connected: true/false 플래그를 확인하고, 프론트에서 키 존재 여부를 마스킹 문자열 길이(>0)로 판단하도록 수정

### B4. 복구 시 입력 정보 미유지 (#9)
- 증상: 이어서 진행 시 기존 메타데이터(제목, 참여자 등)가 없는 빈 상태로 진입
- 원인: 어제 재설계한 "기존 세션 재개" 방식이 아직 미구현. 현재 코드가 새 세션 생성을 시도
- 수정: decisions.md 복구 UX + technical-design.md 4-10절 참조. 복구 시 GET /api/sessions/{id}로 기존 세션 데이터 로드 후 status별 해당 단계로 라우팅. 새 세션 생성하지 않음

### B5. 3단계 수정이 5단계에 미반영 (#11)
- 증상: 녹음 화면에서 블록 텍스트를 수정했는데 편집 화면에서 원래 텍스트가 표시됨
- 원인 추정: (a) 3단계 편집 확정 시 서버 PATCH 호출 누락, 또는 (b) 5단계 진입 시 서버 블록을 다시 fetch하지 않음
- 수정: (a) 3단계 Recording.tsx에서 편집 확정 시 PATCH /api/sessions/{id}/blocks/{block_id} 호출 확인, (b) 5단계 Editing.tsx 진입 시 GET /api/sessions/{id}로 최신 블록 로드 확인

### B6. 첫 블록 Backspace 병합 에러 (#12)
- 증상: 첫 번째 블록의 맨 앞에서 Backspace → POST .../blocks/blk_001/merge 400 + "병합에 실패했습니다"
- 원인: 첫 번째 블록에는 위 블록이 없어서 서버가 400 반환
- 수정: 프론트에서 첫 번째 블록이면 병합 요청을 보내지 않도록 가드 추가 (decisions.md "편집 중 키 할당" 테이블의 "첫 번째 블록에서는 무시" 참조). 마지막 블록 Delete도 동일 가드

### B7. Slack 메시지에 수정 내용 미반영 (#1, #13)
- 증상: 6단계에서 요약을 수정해도 7단계 Slack 전송 메시지에 반영되지 않음
- 원인: 6단계에서 수정된 요약이 서버에 저장되지 않음 (저장 API 누락)
- 수정: PATCH /api/sessions/{id}/summary, PATCH /api/sessions/{id}/action-items 구현 (technical-design.md 4-5절). 6단계에서 편집 확정/다음 단계 시 서버에 저장. 7단계 미리보기 + Slack 전송 모두 최신 데이터 사용

---

## 이전 세션 미착수 항목 (확인 필요)

아래 항목은 이전 기획 세션(04-21)에서 전달했으나 구현 여부 미확인:

1. 3단계 레이아웃 재배치 (컨트롤 바 sticky bottom, 상태바 sticky top) — decisions.md 3단계 레이아웃
2. 반응형 Stepper (768px 미만 축약형) — decisions.md 반응형 Stepper
3. 다크모드 — design-system-dark.md (이미 CSS 반영된 듯, 동작 확인)
4. Slack 스레드 카드 UI — decisions.md 스레드 선택
5. Slack 메시지 삭제 — decisions.md 전송 후 삭제 + technical-design.md DELETE /api/slack/message

위 항목 중 미구현이 있으면 이번에 함께 처리해줘.

세션 종료 시 reports/DEV-REPORT-20260422.md 작성 부탁해 (HANDOVER.md 11절 양식 참조).
```

---

## 참조: 변경된 기획 문서 목록

| 파일 | 변경 내용 |
|------|----------|
| `decisions.md` | AI 진행 표시, 키보드 명령어 변경, 인사 문구 textarea, 회의록 삭제, Slack 미리보기 실시간 |
| `technical-design.md` | Meeting 블록 편집 API 4종, DELETE /api/meetings/{id} |
| `design-system.md` | 제목→콘텐츠 위계 강화 패턴 |
