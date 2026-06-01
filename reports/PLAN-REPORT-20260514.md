# 기획 업무 보고서 — 2026-05-14

> 작성 주체: 기획 세션
> 대상 기간: 2026-05-14 (아홉 번째 기획 세션)
> 이전 보고서: `reports/PLAN-REPORT-20260507.md`
> 상태: **최종**

---

## 1. 오늘 수행한 작업 요약

| 카테고리 | 건수 | 요약 |
|---------|------|------|
| 문서 상태 전수 점검 + 동기화 | 1건 | 05-07 미커밋 산출물(기획·검수 6개) + e262762 반영 표시 정정 → commit `aa83de5` |
| 사용자 보고 데이터 이슈 1·2 진단 | 2건 | showDirectoryPicker 절대 경로 미반환 + 다른 데스크톱 백엔드 CWD 차이가 본질 — 코드 수정으로 풀리지 않음을 진단 |
| 기획 결정 — 저장 경로 폐기 + 브라우저 다운로드 일원화 | 1건 | 설정 항목 제거 + 7단계 체크박스 라벨 갱신 + 백엔드 EXPORT_DIR만 단일 검색 |
| 기획 결정 — UI 회귀 (검수 보고) | 1건 | Q1~Q4 결정 (히스토리 하단 3그룹 + 모바일 flex-wrap + 어절 단위 줄바꿈 + 7단계 모바일 수직 스택) |
| 기획 문서 갱신 | 3건 | decisions.md / technical-design.md / design-system.md (버튼 그룹 위계 절 신규) |
| 개발 핸드오프 작성 | 2건 | PLAN-DEV-HANDOFF-20260514.md (이슈 1·2) + -2.md (UI 회귀) |
| 이슈 3 (백엔드 호스팅 전환) 논의 | 1건 | 5개 옵션 검토 후 보류 결정 — Whisper.wasm 등 PoC 후 재논의. LLM 어댑터 추상화도 동시 보류 |
| 자동 메모리 갱신 | 2건 | project_status 갱신 + project_issue3_pending 신규 |
| 리포트 작성 + 인수인계 | 1건 | 본 리포트 + PLAN-SESSION-RESUME-20260514.md |

---

## 2. 변경된 파일 목록

| 파일 | 변경 유형 | 상세 |
|------|----------|------|
| `HANDOVER.md` | 수정 (3곳) | 8절 정보 박스 갱신 (최신 커밋 e262762→73109e9 + 최근 4건 + Sprint 누적) + 8·10절 전달 사항 정리 + 신규 핸드오프 2건 ⏳ 등록 |
| `decisions.md` | 수정 (4영역) | 7단계 화면 모형(.md 다운로드 블록 + 녹음 다운로드 블록) + 실행 방식 + 전송 실패 대응 + 설정 저장 경로 제거 + 히스토리 하단 버튼 3그룹 명세 + 체크박스 모바일 명세 |
| `technical-design.md` | 수정 (6곳) | Settings JSON export_path 제거 + export-md/audio API blob 응답 + export-audio 행 추가 (sessions/meetings 모두) + Slack md_attached 검색 단순화 + 7단계 흐름도 갱신 |
| `design-system.md` | 수정 (1절 신규) | "버튼 그룹 위계" 절 추가 (gap 차별화 + whitespace-nowrap 어절 단위 줄바꿈 + 모바일 수직 스택 패턴) |
| `reports/PLAN-REPORT-20260507.md` | 수정 | 7절 후행 처리 결과 한 줄 추가 (역사 기록은 보존) |
| `reports/PLAN-SESSION-RESUME-20260507.md` | 수정 | 상태 표 / 전달 사항 / 다음 할 일 정리 (⏳→✅) |
| `reports/QA-REPORT-20260507.md` | 정리됨 (검수 산출물) | 9~10절 (Slack MD + SESSION-RACE 종결 검증 + 시간선 요약) — 본 세션이 커밋 처리 |
| `reports/PLAN-DEV-HANDOFF-20260507.md` | 정리됨 (커밋 처리) | 본 세션이 untracked였던 파일 정식 커밋 |
| `reports/PLAN-DEV-HANDOFF-20260507-2.md` | 정리됨 (커밋 처리) | 동일 |
| `reports/PLAN-DEV-HANDOFF-20260514.md` | 신규 생성 | 저장 경로 폐기 + 브라우저 다운로드 일원화 개발 가이드 |
| `reports/PLAN-DEV-HANDOFF-20260514-2.md` | 신규 생성 | 히스토리 하단 버튼 + 7단계 체크박스 모바일 개발 가이드 |
| `reports/PLAN-REPORT-20260514.md` | 신규 생성 | 본 리포트 |
| `reports/PLAN-SESSION-RESUME-20260514.md` | 신규 생성 | 다음 세션 인수인계 |
| **자동 메모리** | | |
| `memory/project_status.md` | 수정 | 05-14 시점으로 갱신 — 핸드오프 2건 대기 + 이슈 3 보류 |
| `memory/project_issue3_pending.md` | 신규 | 이슈 3 보류 결정 + PoC 의향 + 옵션 비교 정보 보존 |
| `memory/MEMORY.md` | 수정 | 새 항목 등록 |

---

## 3. 주요 결정/변경 사항

### 3.1 저장 경로 폐기 + 브라우저 다운로드 일원화 (이슈 1·2 근본 수정)

**진단**:
- `showDirectoryPicker`는 브라우저 보안상 절대 경로 미반환 → `handle.name`만 저장 → 폴더 이름만 settings.json에 들어감
- 백엔드 `Path(req.export_path)`는 CWD 기준 상대 경로로 해석 → 의도한 위치 아님
- 다른 데스크톱에서 ngrok 접속 시 백엔드 CWD는 여전히 개발 데스크톱 → 파일이 "사라진 듯" 인지 (이슈 2)

**결정**:
- `export_path` 개념 완전 폐기
- 백엔드: 항상 `EXPORT_DIR`에 자체 .md 보관 (Slack 첨부용)
- 사용자: 모든 다운로드를 브라우저 다운로드 폴더로 일원화 (Content-Disposition + blob)
- 설정 화면 "기본 저장 경로" 항목 제거
- 7단계 체크박스 라벨 ".md 저장" → ".md 다운로드", "녹음 파일 저장" → "녹음 파일 다운로드"

### 3.2 UI 회귀 보정 — 히스토리 하단 버튼 + 7단계 체크박스 모바일 (Q1~Q4)

| 질문 | 결정 |
|------|------|
| Q1 버튼 계층 | (a) 주(재편집·재전송) / 보조(다운로드 2개) / 위험(삭제) 3그룹 |
| Q2 모바일 반응형 | (a) flex-wrap + 그룹 단위 줄바꿈 + **어절 단위(`whitespace-nowrap`)** |
| Q3 시각적 위계 | (a)+(b) gap 차별화(외 24px·내 8px) + 삭제는 text-recording 유지 |
| Q4 7단계 체크박스 모바일 | 항목별 수직 스택 (`flex-col sm:flex-row`), 녹음 체크 시 .webm/.mp3 세그먼트가 모바일에선 아래로 |

### 3.3 이슈 3 (백엔드 호스팅 전환) — 보류

5개 옵션(A. ngrok 영구 URL / B. MacBook 24/7 / C. Fly.io 본격 이전 / D. 보류+PoC / 추가: Tailscale) 검토 후 **D 보류** 선택. Whisper.wasm 등 PoC 후 정보가 모이면 재논의.

연관 보류: LLM 어댑터 추상화 (Anthropic API → 로컬 LLM 전환 가능 구조) — 로컬 LLM 도입 시점에 함께 정리.

상세 의향 + 검토 정보: 자동 메모리 `project_issue3_pending.md` 보존.

---

## 4. 전달 사항

### 개발 세션에 전달

- **`reports/PLAN-DEV-HANDOFF-20260514.md`** — 저장 경로 폐기 + 브라우저 다운로드 일원화 (🔴 High). 사용자 보고 실사용 차단 이슈.
- **`reports/PLAN-DEV-HANDOFF-20260514-2.md`** — 히스토리 하단 버튼 + 7단계 체크박스 모바일 (🟡 Medium). 같은 세션에서 함께 처리 가능. `SendSave.tsx`는 두 핸드오프 모두 손대므로 변경 충돌 주의.

### 검수 세션에 전달

- 두 핸드오프 개발 반영 완료 후 검증 요청
- 모바일(~375px) 회귀 검수 필수 (히스토리 하단 + 7단계 체크박스)
- 60~120분 실회의 시연 진행 시 `e262762` 신규 기능(녹음 파일 내보내기) 실사용 검증도 동반

---

## 5. 다음 세션에서 확인할 것

- [ ] 두 핸드오프 개발 반영 + 모바일 회귀 검수 완료 확인
- [ ] 60~120분 실회의 시연 결과 (락 기반 atomic write 응답 지연 체감 여부 + 신규 기능 실사용)
- [ ] 이슈 3 PoC 진행 의향 확인 (Whisper.wasm small/tiny 정확도 등)
- [ ] PoC 후 백엔드 호스팅 방향 재논의 시 클라우드 옵션 비교 표 (자동 메모리 `project_issue3_pending.md`) 참조
- [ ] LLM 어댑터 추상화는 로컬 LLM 도입 결정 시점까지 보류 유지
