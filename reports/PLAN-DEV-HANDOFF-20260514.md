# 기획 → 개발 전달 프롬프트 — 2026-05-14

> 이 문서를 개발 세션 시작 시 전달하세요.
> 본 문서는 사용자 보고 데이터 이슈 1·2 근본 수정 (저장 경로 개념 폐기 + 브라우저 다운로드 일원화).
> 같은 날 추가 핸드오프: `reports/PLAN-DEV-HANDOFF-20260514-2.md` (UI 회귀 — 히스토리 하단 버튼 + 7단계 체크박스 모바일 동작). 같은 개발 세션에서 함께 처리 가능.
> 이슈 3(백엔드 호스팅 전환)은 미결 — 본 문서 범위 외.

---

## 개발 세션에 전달할 프롬프트

```
HANDOVER.md 확인하고 이어서 개발 부탁해.
사용자 보고 데이터 관련 이슈 1·2 근본 수정 1건이야:
- 1) .md / 녹음 파일 저장 경로 변경이 실제로 작동 안 함
- 2) 다른 데스크톱에서 최초 회의록 작성 시 파일 저장이 안 됨

기획 문서(decisions.md, technical-design.md)는 이미 갱신 완료, 본 문서는 구현 가이드.
같은 날 핸드오프 `PLAN-DEV-HANDOFF-20260514-2.md`(UI 회귀)도 같은 세션에서 함께 처리해도 돼.

---

## 배경 — 진짜 원인

`frontend/src/pages/Settings.tsx:475` 및 `frontend/src/pages/SendSave.tsx:593-594`:
```javascript
const handle = await (window as any).showDirectoryPicker();
await api.patch('/settings', { export_path: handle.name });
```

`handle.name`은 **폴더 이름만** 반환 (브라우저 보안상 절대 경로 미반환).
→ 사용자가 `C:\Users\rsa4635\Documents\회의록` 선택 → settings.json에 `"export_path": "회의록"`만 저장
→ 백엔드 `history.py:349`의 `Path(req.export_path)`는 **백엔드 프로세스 CWD 기준 상대 경로**로 해석되어
   `backend/회의록/`에 저장됨 → 사용자가 의도한 위치에 절대 안 감 (이슈 1)
→ ngrok 등으로 다른 데스크톱에서 접속해도 백엔드 CWD는 여전히 개발 데스크톱 → 다른 데스크톱에서 보면 파일이 "사라진 듯" 보임 (이슈 2)

브라우저 보안 제약이라 코드 수정으로는 풀 수 없음 → `showDirectoryPicker` 자체 폐기 + 브라우저 다운로드로 일원화.

---

## 기획 결정 (갱신된 데이터 흐름)

**백엔드 측 (사용자에게 안 보임)**:
- .md는 항상 `EXPORT_DIR`(`backend/data/exports/`)에 자동 저장 (Slack 첨부에 사용)
- 녹음 파일은 `Meeting.merged_audio_path`에 보관 (현행 유지)
- `export_path` 개념 완전 제거

**사용자 측 (브라우저 다운로드)**:
- 7단계 ☑ .md 다운로드 체크 → 실행 시 export-md 응답 blob을 브라우저 다운로드 폴더에 저장
- 7단계 ☐ 녹음 파일 다운로드 체크 → 동일 패턴으로 .webm/.mp3 다운로드
- 히스토리 상세의 [.md 다운로드] / [녹음 다운로드]는 이미 blob 다운로드 → 변경 없음
- 다운로드 위치는 브라우저 기본 다운로드 폴더 (브라우저 설정에서 사용자가 변경 가능)

**제거 대상**:
- 설정 화면 "기본 저장 경로" 항목 (UI + API + 모델 필드 모두)
- 7단계 SendSave의 "폴더 선택" 버튼 + exportPath state
- showDirectoryPicker 호출 코드 전부

---

## A. 백엔드 변경

### A-1. `backend/models/settings.py`
- `export_path: str = ""` 필드 제거
- 관련 import / 참조 정리

### A-2. `backend/routers/settings.py`
- `SettingsUpdate` Pydantic 모델에서 `export_path: Optional[str] = None` 제거
- PATCH 처리에서 export_path 분기 제거
- 마이그레이션: settings.json 로드 시 `export_path` 키가 있어도 무시 (기존 키는 그대로 둬도 백엔드가 안 읽으니 무해)

### A-3. `backend/routers/sessions.py`
- `POST /api/sessions/{id}/export-md` 요청 모델에서 `export_path: Optional[str] = None` 제거
- 응답 변경: 기존 `{"success": true, "file_path": "..."}` 형태가 아니라 **`FileResponse`로 .md 본문을 직접 스트림** + `Content-Disposition: attachment; filename="..."` 헤더
- 동작 변경:
  ```
  변경 전: 사용자가 준 export_path에 저장 + JSON 응답
  변경 후: 항상 EXPORT_DIR에 저장 + 같은 파일을 FileResponse로 반환
  ```
- `POST /api/sessions/{id}/export-audio` 동일 패턴 — 요청 모델에서 `export_path` 제거, 응답을 `FileResponse`로 (이미 작동 중인 `GET /api/meetings/{id}/audio`와 동일 패턴)

### A-4. `backend/routers/history.py`
- `POST /api/meetings/{id}/export-md` / `POST /api/meetings/{id}/export-audio`: A-3와 동일 패턴
- `delete_meeting`의 .md 검색 로직 단순화:
  - 기존: settings.json `export_path` 후보 + `EXPORT_DIR` 후보 모두 검색
  - 변경: `EXPORT_DIR`만 검색 (orphan 대응으로 동일 파일명 변형 후보까지)

### A-5. `backend/routers/slack.py`
- .md 첨부 검색 로직 단순화:
  - 기존(`cd8f3d9`): settings.json `export_path` 우선 → `EXPORT_DIR` fallback
  - 변경: `EXPORT_DIR`만 검색
- 응답의 `md_attached` 필드는 유지 (검색 실패 시 false). 토스트 문구는 프론트엔드에서 갱신 예정 (C-2 참조)

### A-6. `backend/data/settings.json`
- 마이그레이션 불필요. 백엔드가 export_path 필드를 안 읽으므로 그대로 둬도 무해. (선호하면 키 삭제 가능)

---

## B. 프론트엔드 — Settings.tsx

### B-1. "기본 저장 경로" 섹션 완전 제거
- 라인 460~490 부근의 "기본 저장 경로" 표시 + [폴더 선택] 버튼 + showDirectoryPicker / prompt 폴백 코드 삭제
- `Settings` 인터페이스에서 `export_path` 필드 제거
- 관련 useEffect / setSettings 로직 정리

---

## C. 프론트엔드 — SendSave.tsx

### C-1. 폴더 선택 UI + exportPath state 제거
- `const [exportPath, setExportPath] = useState('');` 삭제
- `setExportPath(res.data.export_path || 'exports/');` 삭제 (settings fetch 응답에서 가져오던 부분)
- 라인 588 부근 "저장 경로 표시 + 폴더 선택 버튼" UI 영역 제거
- showDirectoryPicker 호출 + prompt 폴백 코드 제거

### C-2. 체크박스 라벨 + 동작 변경
| 위치 | 변경 전 | 변경 후 |
|------|---------|---------|
| 체크박스 라벨 | "📥 .md 저장" | "📥 .md 다운로드" |
| 체크박스 라벨 | "🎵 녹음 파일 저장" | "🎵 녹음 파일 다운로드" |
| 안내 | "선택한 폴더에 저장됩니다" | "브라우저 다운로드 폴더에 저장됩니다" |
| 토스트 (md_attached=false) | ".md 파일을 찾을 수 없어 첨부 없이 전송되었습니다. 저장 경로 설정을 확인해주세요." | ".md 파일이 백엔드에 생성되지 않아 첨부 없이 전송되었습니다. 잠시 후 재전송을 시도해주세요." |

### C-3. doExecute 흐름 — blob 다운로드로 전환
- `POST /api/sessions/{id}/export-md` 호출 시 응답을 `responseType: 'blob'`으로 받고
  - 헤더 `Content-Disposition`에서 filename 파싱
  - `URL.createObjectURL(blob)` + `<a download>` 트리거로 브라우저 다운로드 (히스토리 상세의 .md 다운로드와 동일 패턴)
- `POST /api/sessions/{id}/export-audio` 동일 패턴
- 요청 바디에서 `export_path` 제거
- 실행 순서: .md 다운로드 → 녹음 다운로드 → Slack 전송 → complete (Slack 전송은 백엔드의 EXPORT_DIR .md를 첨부하므로 .md 생성이 선행되어야 함)

---

## 마이그레이션 / 호환성

- 기존 회의록·세션 데이터는 영향 없음 (모두 백엔드 측 보관 + 메타데이터 그대로)
- settings.json의 `export_path` 키는 더 이상 사용되지 않지만 삭제 불필요 (백엔드가 안 읽음)
- 사용자에게 보이는 변화:
  - 설정 화면에서 "기본 저장 경로" 항목 사라짐
  - 7단계 체크박스 라벨 ".md 저장" → ".md 다운로드", "녹음 파일 저장" → "녹음 파일 다운로드"
  - 7단계 "폴더 선택" 버튼 사라짐
  - 실행 후 파일이 브라우저 다운로드 폴더에 저장 (기존엔 어딘가에 저장된 듯 보였으나 실제론 백엔드 폴더에 저장)

---

## 검증 시나리오

1. **신규 회의 작성 → 7단계**
   - ☑ .md 다운로드 + ☑ Slack 전송 체크 → [실행]
   - 브라우저 다운로드 폴더에 `{제목}_{날짜}.md` 저장 확인
   - Slack 채널에 .md 첨부 + 본문 정상 (md_attached: true)
   - 히스토리 목록에 #전송됨 태그 노출

2. **녹음 파일 다운로드 (.webm)**
   - 7단계 ☐ 녹음 파일 다운로드 체크 → 형식 .webm 선택 → [실행]
   - 브라우저 다운로드 폴더에 `{제목}_{날짜}.webm` 저장 확인

3. **녹음 파일 다운로드 (.mp3)**
   - 7단계 형식 .mp3 선택 → [실행]
   - 브라우저 다운로드 폴더에 `{제목}_{날짜}.mp3` 저장 확인 (ffmpeg 변환됨)

4. **다른 데스크톱에서 동일 흐름**
   - ngrok 등으로 개발 데스크톱 백엔드에 접속한 다른 데스크톱에서 신규 회의 작성 → 7단계 실행
   - 다른 데스크톱의 브라우저 다운로드 폴더에 정상 저장 확인 (이슈 2 해결)

5. **설정 화면 회귀**
   - 설정 화면에 "기본 저장 경로" 항목이 더 이상 보이지 않음
   - 다른 설정 항목(Slack 토큰, Claude API 키, Whisper 모델, 마이크 민감도, 인사 문구 등)은 정상 동작

6. **히스토리 상세 회귀**
   - [📥 .md 다운로드] / [🎵 녹음 다운로드] 정상 동작 (이미 blob 다운로드라 변경 없음)
   - 회의록 삭제 → 백엔드 .md 정리 정상 (`EXPORT_DIR`에서만 검색)

7. **Slack 첨부 실패 케이스 (드문 케이스)**
   - 백엔드 EXPORT_DIR에 .md가 어떤 이유로 없으면 → 토스트 ".md 파일이 백엔드에 생성되지 않아…" 표시

---

## 우선순위

🔴 High — 사용자가 직접 보고한 실사용 차단 이슈. 저장 위치를 신뢰할 수 없으니 사용자 입장에서 핵심 기능 결함.

세션 종료 시 reports/DEV-REPORT-20260514.md 작성 부탁해.
```
