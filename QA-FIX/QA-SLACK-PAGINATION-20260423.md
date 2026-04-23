# Slack 채널 목록 페이지네이션 — 수정 1건

> 작성일: 2026-04-23
> 작성자: 검수(QA) 세션
> 대상: 개발 세션
> 원인: 봇이 채널에 is_member=true로 참여 중이나 conversations_list 첫 페이지에 누락

---

## 🔴 Slack 채널 목록이 첫 페이지만 조회

**파일:** `backend/routers/slack.py:104-117`

**현재:**
```python
result = client.conversations_list(types="public_channel,private_channel", limit=200)
channels = [
    {"id": ch["id"], "name": ch["name"]}
    for ch in result.get("channels", [])
    if ch.get("is_member")
]
```

첫 페이지(200개)만 가져옴. `response_metadata.next_cursor`가 있어도 무시.

**수정:**
```python
@router.get("/channels")
def list_channels():
    """List channels the bot has joined (all pages)."""
    client = _get_slack_client()
    try:
        channels = []
        cursor = None
        while True:
            kwargs = {"types": "public_channel,private_channel", "limit": 200}
            if cursor:
                kwargs["cursor"] = cursor
            result = client.conversations_list(**kwargs)
            for ch in result.get("channels", []):
                if ch.get("is_member"):
                    channels.append({"id": ch["id"], "name": ch["name"]})
            cursor = result.get("response_metadata", {}).get("next_cursor")
            if not cursor:
                break
        return {"channels": channels}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Slack API 오류: {str(e)}")
```

---

## 수정 완료 후

```
QA-FIX/QA-SLACK-PAGINATION-20260423.md 수정 완료했어. 확인해줘.
```
