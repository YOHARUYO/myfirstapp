# PLAN-DEV-HANDOFF — 슬랙 포맷 v2 (핵심 요약 LLM 생성 + F/U 안건 그룹핑 + 주제별 분할 + mrkdwn 변환)

> 작성일: 2026-07-08
> 작성 주체: 기획 세션
> 발주 유형: 기획 변경 (PM 실사용 피드백 기반, 260702 전략팀 오전 회의 슬랙 전송분 대조)
> 선행 의존: **QA-FIX/QA-CLAUDE-MODEL-RETIRE-20260616.md 반영·commit 이후 착수** (같은 `services/llm/claude.py`를 만짐 — 순서 역전 금지)
> 관련 문서: `decisions.md` "Slack 메시지 템플릿" 절 (본 결정 반영 갱신 완료) / `reports/PLAN-DEV-HANDOFF-20260602.md` (Phase 1B — 본 v2의 직전 버전)

---

## 0. 개발 세션 전달 지시사항 (복붙용)

```
reports/PLAN-DEV-HANDOFF-20260708.md 읽고 반영 부탁해.
PM이 260702 실회의 슬랙 전송분을 검토하고 포맷 v2를 확정했어. 범위는 5+2건:

1. 핵심 요약을 LLM이 직접 생성 — 프롬프트에 "## 핵심 요약" 섹션 추가, 1번 메시지는
   이 섹션을 사용 (현행 "각 주제 첫 bullet 기계 추출" 폐기)
2. 1번 메시지 F/U를 안건별 그룹핑 — *N. 안건명* bold 라벨 + 같은 인물 task는 " / "로
   한 줄 병합, 기한은 각 task 뒤 (~7/6) 형식
3. "📎 전체 회의록 첨부" 문구를 1번 메시지에서 제거하고 .md 업로드의
   initial_comment로 이동
4. 2번 메시지를 주제별 분할 전송 — 주제 1개당 thread 회신 1개 (길이·수정 불가 문제 해소).
   slack_sent.messages 스키마 확장 + 수정 모달 주제 목록형
5. 슬랙 전송 텍스트에 md→mrkdwn 변환 적용 (**→*, 헤딩→bold 줄). .md 파일은 원본 유지
+ 프롬프트 보강 2건: "(담당자 미명시)" 접두어 금지 / 전사에 없는 날짜 추정·계산 금지

선행 조건: QA-FIX-CLAUDE-MODEL-RETIRE(20260616)가 먼저 반영·commit되어 있어야 해
(같은 claude.py를 만짐). 미반영 상태면 그것부터.

검증은 핸드오프 §5. 완료 후 단독 commit:
"슬랙 포맷 v2 — 핵심 요약 LLM 생성 + F/U 안건 그룹핑 + 주제별 분할 + mrkdwn 변환 (PLAN-DEV-HANDOFF-20260708)"
세션 종료 시 reports/DEV-REPORT-20260708.md 작성 부탁해 (당일 2회차면 -2 접미사).
```

---

## 1. 배경 — PM 실사용 피드백 (260702 전략팀 오전 회의)

PM이 Phase 1B 적용 후 실전송분(사진 4장: 원본 2장 + PM 수동 편집본 2장)을 대조 검토하고 5건을 지적:

| # | 지적 | 원인 (코드 확인 완료) |
|---|------|---------------------|
| 1 | 1번 메시지 핵심 요약이 핀트를 벗어남 | `_build_main_message`가 summary_markdown의 각 `###` 섹션 **첫 번째 bullet**을 기계 추출 — 첫 bullet ≠ 핵심 |
| 2 | 한 안건에 여러 사람이 F/U하는 경우 안건별 묶음이 없어 불편 | action_items가 평탄 리스트 + 인물 인접 정렬만 — 추출 단계에서 주제 정보 유실 |
| 3 | "전체 회의록 첨부" 안내가 1번 메시지에 있는데 파일은 3번째로 옴 | `_build_main_message`에 문구 고정 + `files_upload_v2`는 코멘트 없이 업로드 |
| 4 | 2번 메시지가 너무 길어 수정이 안 될 때가 있음 | 섹션 전체를 단일 메시지 전송 — Slack 길이 한계(~4,000자) 초과 시 수정 불가 |
| 5 | 슬랙 Bold 문법 미준수 (`**`, `##` 원문 노출) | summary_markdown(표준 md)을 변환 없이 그대로 전송 — Slack은 mrkdwn(`*굵게*`, 헤딩 없음) |

부수 발견 2건 (프롬프트): LLM이 `- (담당자 미명시) ...` 접두어를 출력 (규칙 위반) / 기한 날짜를 스스로 계산해 오류 (7/7 → 실제 7/6).

---

## 2. 확정 결정 (PM 승인 완료)

| # | 항목 | 결정 |
|---|------|------|
| 1 | 핵심 요약 | **LLM 직접 생성** — summary_markdown에 `## 핵심 요약` 섹션 (2~4 bullet, 결정사항·방향 전환·기한 중심). 1번 메시지가 이 섹션 사용. 6단계에서 편집 가능해지고 .md에도 포함 |
| 2 | F/U 그룹핑 | **변형 A** — `*N. 안건명*` bold 라벨 + 같은 인물 task ` / ` 한 줄 병합 + 기한 각 task 뒤 `(~7/6)` |
| 3 | 첨부 안내 | 1번에서 제거 → `files_upload_v2(initial_comment="📎 전체 회의록 첨부합니다")` |
| 4 | 2번 길이 | **항상 주제별 분할** — 주제당 thread 회신 1개. 스키마·수정 모달 확장 |
| 5 | mrkdwn | 슬랙 전송 시점에만 md→mrkdwn 변환. .md 파일은 표준 마크다운 원본 유지 |
| 6 | 프롬프트 보강 | "(담당자 미명시)" 등 접두어 금지 / 전사에 없는 날짜 추정·계산 금지 |
| 7 | bullet 기호 | 1번 메시지 `•` 유지 (기존과 통일) |

### 1번 메시지 F/U 목표 형태 (PM 확정 예시)

```
✅ F/U 필요 사항
*1. OpenAI 협업 해커톤*
• [영진님] 장소 후보·비용 조사 (~7/6) / 유사 사례 수집·장단점 분석
• [소희님] 홍보·마케팅 방향 초안 정리
*2. 내부 개발 방향*
• 개발자 측 커뮤니케이션 주의
```

- 기한 형식은 `(~7/6)` — **각 task 조각의 맨 뒤**. 한 줄에 병합된 task가 여러 개면 각자 자기 기한을 가짐 (`task1 (~7/6) / task2 (~7/8)`)
- 담당자 미명시 task는 태그 없이 `• task` 단독 bullet (병합 안 함)
- 그룹 내 인물 인접 정렬은 기존 로직 유지 (같은 인물 병합의 전제)

---

## 3. 수정 명세 (backend)

### 3.1 프롬프트 — `services/llm/claude.py`

`SUMMARY_SYSTEM_PROMPT` 갱신:

1. `## 핵심 요약` 섹션 생성 규칙 추가:
   - 위치: 응답 맨 앞 (## 주요 논의 사항 & F/U 필요 요소보다 먼저)
   - 2~4개 bullet. **결정된 사항 > 방향 전환 > 기한이 있는 핵심 과제** 우선순위로 선별
   - 논의 경과 나열 금지 — "무엇이 정해졌고 무엇이 바뀌었는가"만
2. 담당자 미명시 F/U 규칙 강화: `"(담당자 미명시)" 같은 접두어·표식을 절대 출력하지 말고 할 일만 쓸 것`
3. 날짜 규칙 추가: `기한은 전사에 명시적으로 언급된 날짜만 사용. "다음 주 월요일" 같은 상대 표현을 특정 날짜로 계산·추정하지 말 것 (상대 표현 그대로 두거나 회의 날짜 기준이 전사에 있을 때만 변환)`
4. F/U 기한 표기 형식을 `(~7/6)` 괄호 형태로 변경: `- [{담당자이름}님] 할 일 (~{기한})` → 유지하되 user_prompt 예시도 `(~6/2)` 괄호 형태로 갱신

`user_prompt` 응답 형식 예시에 `## 핵심 요약` 섹션 추가 + 기한 괄호 형태 반영.

### 3.2 액션 아이템 topic 보존 — `services/summary_assembler.py` + `models/`

- `extract_action_items`를 **`###` 주제 섹션 단위 파싱**으로 변경 — 각 항목이 자신이 속한 주제명을 알도록
- `ActionItem` 모델(backend + frontend 타입)에 `topic: Optional[str]` 필드 추가 (기존 데이터는 None — 호환)
- 기한 파싱 정규식을 `(~7/6)` 괄호 형태 우선 + 기존 `~기한` fallback (legacy 재요약 호환)
- 6단계 액션 아이템 CRUD UI 인터랙션은 무변경 (topic은 보존만, 편집 UI 노출은 본 범위 외)

### 3.3 1번 메시지 — `routers/slack.py` `_build_main_message`

- 핵심 요약: summary_markdown의 `## 핵심 요약` 섹션 bullet을 그대로 사용. **섹션이 없으면(구 회의 재전송·legacy) 현행 기계 추출 fallback 유지**
- F/U: §2 목표 형태대로 재구현 — `ActionItem.topic` 기준 그룹핑(주제 출현 순서), 그룹 내 같은 assignee task ` / ` 병합, 기한 `(~7/6)` 각 task 뒤. topic이 전부 None(legacy)이면 현행 평탄+인접 정렬 fallback
- `📎 전체 회의록 첨부` 줄 제거

### 3.4 2번 → N개 주제별 회신 — `routers/slack.py`

- `_build_topics_message` → `_build_topic_messages`: `[(topic_title, body), ...]` 리스트 반환 (주제 `###` 단위 분할. 섹션 헤더 `## 주요 논의...`는 첫 메시지 상단 또는 각 메시지 생략 — 각 메시지는 `*N. 주제명*`으로 시작하므로 섹션 헤더 자체는 생략 권장)
- `기타 메모` 섹션이 있으면 마지막 회신 1개로 추가
- 전송 라우터: 각 body를 mrkdwn 변환 후 `thread_ts=main_ts`로 순차 전송
- `slack_sent.messages` 스키마 확장:
  ```json
  "messages": {
    "main": {"ts": "...", "text": "...", "sent_at": "..."},
    "topics": [
      {"ts": "...", "title": "1. OpenAI 협업 해커톤", "text": "...", "sent_at": "..."},
      ...
    ]
  }
  ```
  - **호환**: 기존 저장본의 `messages.topics`가 dict(단일)인 경우도 읽기에서 인식 (수정 모달·삭제 흐름). 새 전송은 항상 배열
- `update_slack_message`의 `message_key`: `"main"` | `"topic_{i}"` (배열 인덱스) 인식으로 확장

### 3.5 md→mrkdwn 변환 — `routers/slack.py` 신규 헬퍼

`_md_to_mrkdwn(text: str) -> str`:

- `**텍스트**` → `*텍스트*`
- 행 시작 `## 제목` / `### 제목` → `*제목*` (bold 줄)
- `- ` bullet / `---` 구분선 / `[xxx님]` / 이모지 → 그대로 유지
- 적용 대상: 2번 주제별 회신 body 전체 + (1번 메시지는 빌더가 직접 mrkdwn으로 생성하므로 핵심 요약 bullet 텍스트에만 방어적 적용)
- **`EXPORT_DIR`의 .md 파일과 summary_markdown 저장본은 절대 변환하지 않음** — 변환은 슬랙 표현 계층에서만

### 3.6 파일 첨부 코멘트 — `routers/slack.py`

`files_upload_v2(..., initial_comment="📎 전체 회의록 첨부합니다")` 추가.

---

## 4. 수정 명세 (frontend)

| 파일 | 변경 |
|------|------|
| `types/index.ts` | `SlackSentInfo.messages.topics`를 배열형으로 확장 (legacy 단일 dict 유니온 허용), `ActionItem.topic` 추가 |
| `pages/SendSave.tsx` | 미리보기: 1번(핵심 요약 = `## 핵심 요약` 섹션, F/U = 변형 A 그룹핑) + 주제별 회신 목록 미리보기. `buildPreviewText`/`buildTopicsPreviewText`를 backend 빌더와 동일 로직으로 갱신 (mrkdwn 변환 포함) |
| `pages/HistoryDetail.tsx` | 메시지 수정 모달을 **주제 목록형**으로: main textarea + topic별 textarea 목록(제목 라벨). 각 항목 저장 시 `message_key`(main / topic_{i}) 전달. legacy(topics 단일/부재) 데이터는 기존 안내 유지 |
| `api/slack.ts` | `updateSlackMessage` message_key 타입 확장, 전송 응답 타입 갱신 |

---

## 5. 검증 시나리오

### 5.1 신규 회의 1건 실전송 (핵심)

1. 신규 회의 생성 → 6단계 요약에 `## 핵심 요약` 섹션이 맨 앞에 생성됨 (2~4 bullet, 결정·방향 중심)
2. 7단계 미리보기 = 실제 전송 결과와 일치 (1번 + 주제별 회신 목록)
3. 전송 결과: 1번 메인 + 주제 수만큼 thread 회신 + (기타 메모 있으면 +1) + .md 첨부(코멘트 포함) — 순서 보장
4. 1번 메시지: 핵심 요약이 `## 핵심 요약` 섹션과 일치 / F/U가 변형 A 형태 (`*N. 안건명*` + ` / ` 병합 + `(~7/6)`) / "전체 회의록 첨부" 문구 없음
5. 각 회신 메시지에 `**`·`##` 원문 노출 0 — bold 정상 렌더
6. .md 다운로드 파일은 표준 마크다운 원본 그대로 (`**`, `###` 유지) + `## 핵심 요약` 섹션 포함

### 5.2 수정·삭제 흐름

7. 히스토리 상세 → 메시지 수정 모달: main + 주제별 textarea 목록, 각각 prefill·저장 정상, 저장 후 meeting JSON의 해당 항목 text 동기화
8. 긴 회의(주제 4개+) 전송 후 각 회신 메시지가 슬랙에서 개별 수정 가능 (길이 한계 미달 확인)
9. 메시지 삭제: main ts 기준 삭제 흐름이 신 스키마(topics 배열)에서 정상

### 5.3 회귀·호환

10. **구 회의(핵심 요약 섹션·topic 없음) 재전송**: 기계 추출 fallback + 평탄 F/U fallback으로 에러 없이 전송
11. 요약 생략(5→7 직행) 회의: 핵심 요약 섹션 생략 + 회신 0개, 현행과 동일
12. legacy `messages.topics`(단일 dict) 저장본을 가진 기존 회의의 히스토리 상세·수정·삭제 무회귀
13. Phase 1A 영역(`services/llm/factory.py`, `base.py`, Settings provider UI) 무변경 / QA-FIX retire 산출물(placeholder·default·한국어 안내) 무회귀
14. 기한 파싱: 신형 `(~7/6)` + 구형 `~6/2` 모두 액션 아이템 추출 정상

---

## 6. 영역 분리 / 비변경 항목

| 영역 | 영향 |
|------|------|
| `services/llm/claude.py` | ⚠ 프롬프트 텍스트만 (모델 호출·config 로직 무변경). **QA-FIX retire commit 이후 착수** |
| `services/llm/factory.py`, `base.py` | ✅ 무변경 (Phase 1A 영역) |
| `services/claude_service.py` | ✅ 무변경 |
| audio 계열 (`audio_service` 등) | ✅ 무관 |
| 회의 데이터 `backend/data/` | ✅ 무이전 (신규 필드는 Optional, 기존 데이터 fallback) |
| 6단계 액션 아이템 편집 UI | ✅ 인터랙션 무변경 (topic 보존만) |
| 설정·템플릿·히스토리 검색 | ✅ 무관 |

---

## 7. 참고 — 기획 문서 반영 상태

- `decisions.md`: "요약 템플릿 구조" + "Slack 메시지 템플릿" + "전송 후 메시지 수정" 절을 본 결정으로 갱신 완료 (2026-07-08)
- 검수 세션 발주 시 본 문서 §5를 검증 기준으로 사용
