# 기획 → 개발 전달 프롬프트 — 2026-05-07 (2)

> 이 문서를 개발 세션 시작 시 전달하세요.
> 본 문서는 사용자 직접 보고 UI 수정 2건. 신규 기능(녹음 파일 내보내기)은 `reports/PLAN-DEV-HANDOFF-20260507.md` 참조.
> 같은 개발 세션에서 두 핸드오프를 함께 처리해도 됩니다.

---

## 개발 세션에 전달할 프롬프트

```
PLAN-DEV-HANDOFF-20260507-2.md 읽고 반영 부탁해.
사용자 직접 보고 UI 수정 2건이야:
1) 히스토리 목록 "#전송됨" 태그가 최초 회의록 작성 시 누락
2) 녹음 중 블록 편집 모드에서 textarea ring이 가로로 약간 잘림

PLAN-DEV-HANDOFF-20260507.md(녹음 파일 내보내기)와 함께 묶어 한 세션에서 처리해도 돼.

---

## 1. 히스토리 목록 "#전송됨" 태그 누락 (최초 회의록만)

### 현상
- 최초 회의록 작성 시 7단계에서 Slack 전송 정상 완료
- 그러나 히스토리 목록(`History.tsx:148`)의 "#전송됨" 태그가 표시되지 않음
- 회의록 상세에 들어가도 Slack 전송 이력이 없는 것처럼 보임
- 재전송 흐름(히스토리 → 재전송)에서는 정상 표시됨

### 원인 (백엔드 + 프론트엔드 복합)
1. `SendSave.tsx:142-191` doExecute 흐름:
   ```
   .md export  →  Slack 전송  →  complete (Meeting JSON 최초 생성)
   ```
   Slack 전송 시점에 Meeting JSON이 아직 존재하지 않음.
2. `slack.py:312-330`은 Meeting JSON에 `slack_sent`를 저장하려 하지만:
   - Meeting 파일이 없어 silently skip
   - 추가로 경로 자체가 잘못됨: `MEETINGS_DIR / f"{req.session_id}.json"` ← 실제 meeting 파일명 규칙은 `mtg_<id>.json` (`sessions.py:169`에서 `meeting_id = session_id.replace("session_", "mtg_")`)
3. 결과: 최초 작성 시 `slack_sent` 영구 손실 → 히스토리 #전송됨 누락. 재전송은 Meeting이 이미 존재하므로 정상 동작.

### 원하는 동작
최초 작성 시에도 Slack 전송이 성공하면 Meeting JSON에 `slack_sent` 정보가 포함되어 저장되고, 히스토리 목록에 "#전송됨" 태그가 노출되어야 함.

### 해결 방향 (기획 지정: 옵션 c — Slack 응답을 complete에 전달)
- **프론트엔드 (`SendSave.tsx`)**:
  - Slack 전송 응답(`message_ts`, `channel_name`, `thread_ts`)을 state로 보관
  - `complete` 호출 시 요청 바디에 해당 정보를 함께 전달
- **백엔드 (`sessions.py:complete_session`)**:
  - `POST /api/sessions/{session_id}/complete` 요청 바디에 `slack_sent` (Optional) 필드 추가
  - 전달되면 Meeting 생성 시 `meeting.slack_sent`에 포함하여 저장
  - 스키마는 기존 `SlackSentInfo` (`backend/models/meeting.py:10-17`) 재사용
- **백엔드 (`slack.py`)**:
  - 현재의 Meeting JSON 직접 갱신 코드(312-330)는 정리:
    - 신규 작성 흐름 → 갱신할 Meeting이 없으므로 무동작이 되도록 (`meeting_path.exists()` 분기는 그대로 유지하면 자연 처리됨)
    - 재전송(meeting 모드) 흐름 → 파일명 경로 버그 동시 보정 필요. `req.session_id`가 `mtg_*`로 들어오는 케이스를 정확히 분기 (또는 둘 다 시도)
  - 응답 바디(`md_attached`, `message_ts` 등)는 기존 그대로 유지

### 검증
1. **신규 회의** → 7단계 Slack 전송 체크 → [실행] → 완료 화면에서 정상 전송 확인 → 히스토리 목록에 **#전송됨 태그 노출**
2. 같은 회의록의 히스토리 상세에서 Slack 전송 정보(채널/시각/[메시지 삭제]/[메시지 수정]) 정상 노출
3. 회귀 테스트: **재전송 흐름**(히스토리 → 재전송 → 다른 채널 선택)에서도 `slack_sent` 정상 갱신
4. Slack 전송 실패 시: complete가 `slack_sent` 없이 호출 → Meeting에 slack_sent 미포함 (정상)

---

## 2. 녹음 중 블록 편집 textarea 가로 잘림

### 현상
- 3단계(녹음) 진행 중 전사 블록을 더블클릭하여 편집 모드 진입
- 편집 textarea의 focus ring(`ring-2 ring-primary`)이 우측에서 약간 잘려 보임
- 사용 가능하지만 시각적으로 거슬림

### 원인
`Recording.tsx:761` 편집 textarea 클래스:
```jsx
className="flex-1 ... ring-2 ring-primary rounded-lg px-3 py-1 ..."
```
- `ring-2`는 box-shadow 기반 outline (요소 바깥쪽에 2px 그려짐)
- 부모 flex 컨테이너의 우측 여백이 부족하여 ring이 컨테이너 우측 경계와 충돌해 잘림

### 해결 방향 (기획 지정: 옵션 a — 부모 컨테이너에 우측 padding 추가)
- 편집 textarea를 감싸는 블록 행 wrapper(또는 적절한 상위 컨테이너)에 우측 padding 추가
- 권장: `pr-1` (4px) 또는 `pr-0.5` (2px) — ring 두께만큼 확보
- ring 자체나 textarea 디자인은 변경하지 않음 (현재 디자인 유지)
- 다른 영역(읽기 모드 `<p>`, importance 슬라이더)에는 영향 없도록 가능한 한 좁은 범위에 적용

### 검증
- 녹음 중 블록 더블클릭 → ring이 잘림 없이 정상 표시
- **라이트 / 다크 모드** 둘 다 확인
- 편집 후 Esc/Enter로 취소·확정 → 읽기 모드 복귀 시 레이아웃 변형 없음
- **5단계 편집 화면**(`Editing.tsx`)에도 같은 textarea 패턴이 있다면 동일하게 처리 (편집 UX 일관성)

---

### 우선순위
🟢 Low ~ 🟡 Medium — UI 보정 + 데이터 정확성. 사용자 직접 인지 가능, 기능 차단은 없음.

세션 종료 시 reports/DEV-REPORT-20260507.md(기존 또는 신규)에 결과 기록 부탁해.
```
