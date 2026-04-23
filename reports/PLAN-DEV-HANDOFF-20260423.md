# 기획 → 개발 전달 프롬프트 — 2026-04-23

> 이 문서를 개발 세션 시작 시 전달하세요.

---

## 개발 세션에 전달할 프롬프트

```
HANDOVER.md를 읽고 이어서 개발해줘.
아래 기획 문서 동기화 10건 + 신규 기획 2건을 반영해줘.
QA에서 코드 수정은 이미 완료된 항목들이지만, 일부 코드가 기획과 다를 수 있으니 기획 기준으로 확인·보정해줘.

## A. 기획 문서 동기화 — 코드 확인·보정 (10건)

아래 항목은 QA 검수에서 이미 코드 수정되었으나, 기획 문서와 코드가 정확히 일치하는지 확인 필요.

### A1. 마이크 민감도 범위
- 기획: 0.5x ~ 5.0x (기존 3.0x에서 변경)
- 확인: Recording.tsx + Settings.tsx의 슬라이더 max가 5.0인지
- 5x 이상 경고 표시는 삭제 (최대가 5.0이므로 불필요)

### A2. 주소록 레이아웃 — 칩(태그) 형태
- 기획: 1열 리스트 → flex-wrap 칩 그리드 (참여자+장소 동일)
- 확인: Settings.tsx 주소록 섹션이 칩 형태인지

### A3. 블록 편집 textarea 자동 확장
- 기획: textarea 고정 크기+스크롤 → 자동 확장 (overflow hidden)
- 확인: Recording.tsx + Editing.tsx의 편집 textarea가 내용에 따라 높이 자동 조절되는지
- 구현: textarea의 scrollHeight에 맞춰 height 동적 설정, overflow: hidden

### A4. 합치기 버튼 위치 — absolute 오버레이
- 기획: 블록 내부 인라인 → 블록 우측 상단 absolute 오버레이
- 확인: Editing.tsx의 ↑합치기/↓합치기 버튼이 블록 크기에 영향 주지 않는 absolute 배치인지

### A5. 복구 배너 스타일
- 기획: bg-bg-subtle → bg-warning-bg + border-warning/20 + 📌 아이콘
- 확인: Home.tsx 복구 배너가 경고 스타일인지

### A6. 침묵 타임아웃
- 기획: SILENCE_TIMEOUT_MS = 2500 (2.5초)
- 확인: useWebSpeech.ts의 타임아웃 값

### A7. 설정 저장 경로 → 7단계 반영
- 기획: 7단계 진입 시 settings의 export_path를 기본값으로 로드
- 확인: SendSave.tsx가 마운트 시 설정에서 경로를 읽는지

### A8. Slack 채널 새로고침 버튼
- 기획: 채널 드롭다운 옆 ↻ 새로고침 버튼 + 0건일 때 "/invite" 안내
- 확인: SendSave.tsx에 새로고침 버튼과 빈 상태 안내 문구 존재하는지

### A9. Slack 유저 ID 표시
- 기획: <@U1234> → "사용자(마지막4자리)" (예: "사용자(BL8P)")
- 확인: 백엔드 slack.py 또는 프론트에서 유저 멘션 치환 로직

### A10. API 설정 표시 로직
- 기획: .env 토큰이 있으면 settings.json에 없어도 "설정됨" 표시
- 확인: 백엔드 settings.py에서 .env와 settings.json 병합 로직, 프론트 Settings.tsx의 표시 분기

---

## B. 신규 기획 반영 (2건)

### B1. 회의 템플릿 순서 드래그
설정 화면의 템플릿 목록에 드래그 핸들을 추가하여 순서 변경 가능하도록.

프론트:
- 템플릿 각 항목 좌측에 드래그 핸들 아이콘 (lucide GripVertical, 점 6개)
- 드래그 앤 드롭으로 순서 변경 → 완료 시 서버에 저장
- 라이브러리: @dnd-kit/core + @dnd-kit/sortable (npm install 필요)

백엔드:
- Template 모델에 `order: int` 필드 추가 (기본 0, 생성 순서)
- `PATCH /api/templates/reorder` 엔드포인트 추가:
  - 요청: `{ "order": ["tpl_id_1", "tpl_id_2", ...] }`
  - 동작: 배열 순서대로 각 템플릿의 order 필드 업데이트
  - 응답: `{ "success": true }`
- `GET /api/templates` 응답에서 order 기준 정렬

상세: decisions.md 설정 화면 + technical-design.md 3-4 Template 모델 참조.

### B2. Slack 봇 메시지 수정
전송한 Slack 메시지를 나중에 수정할 수 있는 기능.

프론트:
- 7단계 완료 화면: 전송 결과 옆 [수정] 텍스트 버튼 추가 ([삭제] 옆)
- 히스토리 상세: Slack 전송 이력에 [메시지 수정] 버튼 추가 ([메시지 삭제] 옆)
- [수정] 클릭 → 현재 메시지 본문을 textarea에 로드 → 사용자 수정 → [저장] → PATCH API 호출
- 성공: 토스트 "메시지 수정 완료"
- 실패: 토스트 "수정 실패 — 권한이 없습니다"

백엔드:
- `PATCH /api/slack/message` 엔드포인트 추가:
  - 요청: `{ "channel_id": "C1234", "message_ts": "1713267000.000100", "text": "수정된 본문" }`
  - 동작: Slack `chat.update` API 호출 (봇 메시지는 시간 제한 없이 수정 가능)
  - 응답: `{ "success": true, "message_ts": "1713267000.000100" }`
  - 실패: 403 (권한 없음) 또는 404 (메시지 없음)
- 첨부 파일은 수정 불가 (텍스트 본문만)

상세: decisions.md 7단계 "전송 후 메시지 수정" + technical-design.md 4-8 Slack API 참조.

---

## 참고

- 기획 문서는 모두 반영 완료 상태 (decisions.md, technical-design.md, design-system.md)
- A섹션은 코드가 이미 수정된 것의 확인·보정이므로, 이상 없으면 "확인 완료"로 넘어가도 됨
- B섹션은 신규 구현이므로 코드 작성 필요

세션 종료 시 reports/DEV-REPORT-20260423.md 작성 부탁해 (HANDOVER.md 11절 양식 참조).
```
