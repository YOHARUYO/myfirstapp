# 기획 → 개발 전달 프롬프트 — 2026-05-07

> 이 문서를 개발 세션 시작 시 전달하세요.

---

## 개발 세션에 전달할 프롬프트

```
HANDOVER.md 확인하고 이어서 개발 부탁해.
신규 기능 1건 (녹음 파일 내보내기) 추가해줘.
기획 문서(decisions.md, technical-design.md)는 이미 갱신 완료, 본 문서는 구현 가이드.

## 신규 기능: 녹음 파일 내보내기

### 결정 사항
- 위치: 7단계 체크박스 + 히스토리 상세 다운로드 버튼 (둘 다)
- 형식: 사용자 선택 (.webm | .mp3)
- 7단계 체크박스 기본값: 미체크
- 7단계 형식 선택: 체크박스 옆 인라인 세그먼트 (기본 .webm)
- 7단계 저장 위치: .md와 동일 폴더 (별도 폴더 선택 UI 없음)
- 히스토리 다운로드 UX: 모달 → 형식 라디오 → 다운로드
- mp3 변환: 다운로드/저장 시 ffmpeg 온디맨드 (캐시 안 함)

### A. 백엔드 — 신규 다운로드 API
- 엔드포인트: `GET /api/meetings/{id}/audio?format=webm|mp3`
- 파일 위치: `Meeting.merged_audio_path` 사용, 없으면 404
- format=webm: StreamingResponse로 원본 스트림 (Content-Type: audio/webm)
- format=mp3: ffmpeg 온디맨드 변환 후 스트림 (Content-Type: audio/mpeg)
- 파일명: `Content-Disposition: attachment; filename="{title_safe}_{date_str}.{ext}"` — 기존 `.md` 파일명 규칙(slack.py / sessions.py / history.py에서 사용 중)을 그대로 재사용
- 라우터 배치는 기존 패턴 판단(history.py 확장 또는 분리)

### B. 백엔드 — 7단계 녹음 파일 export
- 기존 `POST /api/sessions/{id}/export-md` / `POST /api/meetings/{id}/export-md` 패턴 그대로 따라 신규 작성
- 신규: `POST /api/sessions/{id}/export-audio` (7단계 첫 저장), `POST /api/meetings/{id}/export-audio` (히스토리 재전송 흐름에서 재사용)
- 요청: `{ "export_path": "...", "format": "webm" | "mp3" }`
- 동작: 지정 폴더에 `{title_safe}_{date_str}.{ext}`로 저장
- 응답: `{ "success": true, "file_path": "..." }`
- mp3는 동일하게 ffmpeg 온디맨드 변환 후 저장

### C. 프론트엔드 — 7단계 (SendSave.tsx)
- 체크박스 추가: "녹음 파일 저장" (기본 미체크) — 기존 "Slack 전송"/".md 저장" 체크박스 옆에 배치
- 체크 시 옆에 세그먼트 컨트롤 (.webm | .mp3, 기본 .webm) — 2단계의 입력 모드 세그먼트 패턴 재사용
- 저장 경로는 .md export 경로(`exportPath` 상태) 재사용 — 별도 폴더 선택 UI 없음
- 실행 순서: .md → 녹음 → Slack → complete

### D. 프론트엔드 — 히스토리 상세 (HistoryDetail.tsx)
- 버튼 추가: "🎵 녹음 다운로드" — `[📥 .md 다운로드]` 옆 위치
- 클릭 → 기존 Modal 컴포넌트 사용 → 형식 라디오 (.webm | .mp3, 기본 .webm) + [다운로드]/[취소]
- [다운로드] → `GET /api/meetings/{id}/audio?format=...` 호출 → blob 응답 → a 태그 + download 속성으로 브라우저 다운로드 트리거 (.md 다운로드와 동일 패턴)

### 검증
1. 7단계에서 "녹음 파일 저장" 체크 + .webm 선택 → 실행 시 .md 저장 폴더에 .webm 파일 함께 저장
2. 같은 흐름 .mp3 선택 → ffmpeg 변환된 .mp3 저장
3. 히스토리 상세 [녹음 다운로드] 클릭 → 모달 → .webm 다운로드 정상
4. 같은 회의록에서 .mp3 선택 다운로드 → 변환된 mp3 다운로드
5. 회의록 삭제 시 원본 오디오 함께 삭제(기존 `merged_audio_path` 정리 로직)에 영향 없는지 확인

### 우선순위
🟡 Medium — 사용자 요청 신규 기능. 기존 동작에 영향 없음.

세션 종료 시 reports/DEV-REPORT-20260507.md 작성 부탁해.
```
