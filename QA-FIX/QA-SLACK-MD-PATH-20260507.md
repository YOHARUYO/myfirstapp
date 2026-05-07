# Slack MD 첨부 경로 불일치 수정

> 작성일: 2026-05-07
> 작성자: 검수(QA) 세션
> 대상: 개발 세션
> 범위: Slack MD 첨부 시 사용자 설정 `export_path` 미참조 (1건) + 부수 발견 1건

---

## 개발 세션 전달 지시사항 (복붙용)

```
QA-FIX/QA-SLACK-MD-PATH-20260507.md 읽고 반영해줘. Slack 전송 시 .md 첨부가 누락되는 버그(사용자 export_path 설정 무시)야.
A는 필수, B는 선택, 부수 발견(history.py delete_meeting)도 같은 패턴이라 함께 수정 권장. 반영 후 DEV-REPORT에 결과 기록 부탁.
```

---

## 배경

사용자가 설정 화면에서 기본 저장 경로(`export_path`)를 변경한 경우, .md 파일은 해당 경로에 저장되지만 Slack 첨부 시에는 `EXPORT_DIR`(=`backend/data/exports/`)에서만 파일을 찾기 때문에 **첨부가 누락**됨. 사용자에게는 에러 없이 메시지만 전송되어 누락을 인지하기 어려움.

---

## 현상

1. 사용자 설정: `settings.json` 의 `export_path = 'results'`
2. 7단계 전송 시 .md 생성 → `backend/results/{title}_{date}.md` 에 저장됨 (sessions.py:329-333 / history.py:297-301 정상 동작)
3. Slack 전송 시 attach_md=true → `slack.py:285` 가 `EXPORT_DIR / filename` (=`backend/data/exports/{title}_{date}.md`) 만 검색
4. 파일 없음 → `if export_path.exists()` 분기로 **조용히 건너뜀** (에러도 토스트도 없음)
5. 사용자: Slack 메시지는 수신, .md 첨부 없음 → 원인 불명

---

## 원인

### slack.py:280-293 (Slack MD 업로드 분기)

```python
if req.attach_md:
    title_safe = re.sub(r'[<>:"/\\|?*]', '_', session.metadata.title or 'meeting')
    date_str = (session.metadata.date or '').replace('-', '')
    filename = f"{title_safe}_{date_str}.md"
    export_path = EXPORT_DIR / filename          # ← settings.json 무시

    if export_path.exists():                     # ← 없으면 silently skip
        client.files_upload_v2(
            channel=req.channel_id,
            file=str(export_path),
            filename=filename,
            thread_ts=message_ts,
        )
```

비교: `sessions.py:329-333` / `history.py:297-301` 의 export-md 핸들러는 `req.export_path` (프론트가 보낸 사용자 설정값)를 우선 사용 → 저장 경로와 검색 경로가 어긋남.

---

## A: slack.py — settings.json의 export_path 우선 검색

### 수정 방침

검색 우선순위: **settings.json `export_path` → `EXPORT_DIR` fallback**.
두 경로 모두 없으면 현재처럼 silently skip하지 말고 토스트로 안내할 수 있도록 응답에 플래그를 포함 (UI 변경은 별건이므로 1차에서는 응답 필드만 추가).

### 수정 코드 (slack.py:281-293)

```python
# 기존
if req.attach_md:
    title_safe = re.sub(r'[<>:"/\\|?*]', '_', session.metadata.title or 'meeting')
    date_str = (session.metadata.date or '').replace('-', '')
    filename = f"{title_safe}_{date_str}.md"
    export_path = EXPORT_DIR / filename

    if export_path.exists():
        client.files_upload_v2(
            channel=req.channel_id,
            file=str(export_path),
            filename=filename,
            thread_ts=message_ts,
        )

# 수정
md_attached = False
if req.attach_md:
    title_safe = re.sub(r'[<>:"/\\|?*]', '_', session.metadata.title or 'meeting')
    date_str = (session.metadata.date or '').replace('-', '')
    filename = f"{title_safe}_{date_str}.md"

    # 검색 후보: settings.json의 export_path → EXPORT_DIR
    candidates: list[Path] = []
    settings_path = DATA_DIR / "settings.json"
    if settings_path.exists():
        try:
            s = _json.loads(settings_path.read_text(encoding="utf-8"))
            user_export = s.get("export_path", "") or ""
            if user_export:
                candidates.append(Path(user_export) / filename)
        except Exception:
            pass
    candidates.append(EXPORT_DIR / filename)

    md_file = next((p for p in candidates if p.exists()), None)
    if md_file is not None:
        client.files_upload_v2(
            channel=req.channel_id,
            file=str(md_file),
            filename=filename,
            thread_ts=message_ts,
        )
        md_attached = True
```

그리고 응답에 `md_attached` 포함:

```python
# 기존
return {
    "success": True,
    "channel_name": f"#{channel_name}",
    "message_ts": message_ts,
    "thread_ts": req.thread_ts,
}

# 수정
return {
    "success": True,
    "channel_name": f"#{channel_name}",
    "message_ts": message_ts,
    "thread_ts": req.thread_ts,
    "md_attached": md_attached if req.attach_md else None,
}
```

### 주의사항

- `_json` 은 함수 내부에서 import 필요 (`_get_slack_client` 처럼). 또는 파일 상단 `import json as _json` 추가 후 일관되게 사용.
- `Path(user_export)` 가 상대경로일 경우 `BACKEND_DIR` 기준이 되도록 처리하면 더 안전. 현재 sessions.py / history.py 도 `Path(req.export_path)` 로 그대로 사용하므로 동작 일관성 유지를 위해 동일하게 처리(별도 보강 불필요).
- `_json.loads` 실패는 silent로 두되, 사용자가 마스킹된 토큰 케이스처럼 invalid 값 들어와도 fallback이 동작하므로 안전.

---

## B: 프론트엔드 — md_attached=False 시 토스트 (선택)

### 현상

위 A 수정만으로 누락 인지가 가능해지지만, 사용자가 알아채려면 UI 메시지가 필요.

### 수정 (SendSave.tsx 의 Slack 전송 응답 처리부)

```tsx
// 응답 처리 부분
const res = await api.post('/slack/send', { ... });
if (res.data?.md_attached === false) {
  setToast({
    message: '.md 파일을 찾을 수 없어 첨부 없이 전송되었습니다. 저장 경로 설정을 확인해주세요.',
    visible: true,
  });
}
```

> 정확한 라인 위치는 `frontend/src/pages/SendSave.tsx` 의 Slack 전송 핸들러 안. `attach_md=true` 분기에서만 토스트 띄우면 됨. `md_attached === null` (attach_md=false)는 무시.

---

## 부수 발견 (별도 처리 권장, 본 수정에서 제외)

### history.py:425-431 — delete_meeting의 .md 삭제도 EXPORT_DIR만 검색

```python
# Delete exported .md if exists
if m.metadata.title:
    title_safe = re.sub(r'[<>:"/\\|?*]', '_', m.metadata.title)
    date_str = (m.metadata.date or '').replace('-', '')
    export_path = EXPORT_DIR / f"{title_safe}_{date_str}.md"   # ← 동일 문제
    if export_path.exists():
        export_path.unlink()
```

회의 삭제 시 사용자가 `export_path` 를 설정해두었으면 .md 파일이 사용자 폴더에 남는 **orphan file** 발생. 본 수정과 동일한 검색 로직(settings.json 우선) 적용 필요.

> 본 프롬프트의 A와 동일 패턴이므로 **함께 수정** 권장. 별도 프롬프트로 분리할지는 개발 세션 판단.

---

## 검증 방법

### 1. 사전 준비
1. `backend/data/settings.json` 의 `export_path` 를 `results` 또는 절대 경로로 설정
2. 회의 1건 진행 → 7단계에서 .md 생성 + Slack 전송 (attach_md 체크)

### 2. 정상 케이스 (수정 전에는 실패)
- `backend/results/{title}_{date}.md` 파일이 생성됨 (수정 전과 동일)
- Slack 메시지 수신 시 .md 파일이 **스레드에 첨부**됨 ← 핵심
- 응답: `md_attached: true`

### 3. 폴백 케이스
- `settings.json` 의 `export_path = ""` 으로 비우기
- 회의 1건 → .md 는 `backend/data/exports/` 에 저장됨
- Slack 첨부도 동일 폴더에서 검색 → 정상 첨부

### 4. 누락 케이스 (UI 토스트 확인)
- 일부러 .md 파일 삭제 후 Slack 재전송
- 메시지는 전송되지만 .md 첨부 없음
- 토스트: ".md 파일을 찾을 수 없어..." 표시 (B 수정 시)

### 5. 부수 항목 검증 (함께 수정한 경우)
- `export_path` 설정한 상태로 회의 삭제 → 해당 경로의 .md 도 삭제됨

---

## 영향 범위

| 파일 | 변경 |
|------|------|
| `backend/routers/slack.py` | A — Slack MD 검색 경로 후보 추가 + 응답 필드 |
| `frontend/src/pages/SendSave.tsx` | B — md_attached=false 시 토스트 (선택) |
| `backend/routers/history.py` | 부수 — delete_meeting의 .md 검색 (권장) |

기능·UX 로직 변경 없음. 검색 경로 후보가 늘어나는 방어 코드.

---

## 우선순위

🔴 **High** — 사용자가 실제 보고한 누락 버그. 메시지 전송과 첨부가 어긋나는 상태로 운영 중.
