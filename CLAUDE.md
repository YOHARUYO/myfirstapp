# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

대면 회의를 자동으로 기록·요약하고 Slack으로 전송하는 개인용 회의록 자동화 앱.

## Project Status

- **Phase:** MVP 개발 착수
- **기획 완료:** decisions.md (UX/기능 기획서)
- **기술 설계 완료:** technical-design.md (데이터 모델, API, 프로젝트 구조, 프롬프트)
- **환경 설정 완료:** backend/.env (API 키, Slack 토큰)

## Tech Stack

- **Backend:** Python 3.11+ / FastAPI / Uvicorn / Whisper / Anthropic SDK / slack-sdk / ffmpeg
- **Frontend:** React 18 + TypeScript / Vite / Tiptap / Zustand / Tailwind CSS
- **Storage:** JSON 파일 기반 (SQLite 미사용)
- **Dev Environment:** Windows 11
- **Production Environment:** M3 MacBook Pro (크로스 플랫폼 호환 필요 — pathlib 사용, 하드코딩 경로 금지)

## Key Documents — 반드시 먼저 읽어야 함

1. **HANDOVER.md** — 인수인계 문서. 프로젝트 히스토리, 논의 맥락, 사용자 특성, 개발 착수 순서. **새 세션 시작 시 가장 먼저 읽을 것.**
2. **decisions.md** — 모든 UX/기능 결정이 담긴 기획서. 화면별 레이아웃, 인터랙션, 상태 전이, 엣지 케이스 포함.
3. **technical-design.md** — 프로젝트 구조, 데이터 모델(JSON 스키마), API 엔드포인트 40+개, WebSocket 프로토콜, Claude 프롬프트, Whisper 병합 로직, 세션 라이프사이클, 디자인 시스템.

## Collaboration Style

- **기획은 완료됨.** 기능/UX에 대한 논의는 decisions.md를 기준으로 하고, 기획서에 없는 새 기능을 임의로 추가하지 말 것.
- **기술 설계를 따를 것.** technical-design.md의 데이터 모델, API 규격, 프로젝트 구조를 준수.
- **구현에 집중.** 코드를 작성하고, 테스트하고, 동작을 확인하는 데 집중.
- **변경이 필요하면 먼저 물어볼 것.** 설계와 다른 방식으로 구현해야 하는 경우, 코드를 쓰기 전에 사유를 설명하고 승인받을 것.
- **한국어로 소통.** 코드 주석·변수명은 영문, 대화·문서는 한국어.

## Development Guidelines

- 크로스 플랫폼 경로 처리: `pathlib.Path` 사용, `os.path.join` 또는 하드코딩 경로 금지
- 환경 변수: `backend/.env`에서 로드 (`python-dotenv`)
- API 키·토큰: 코드에 하드코딩 절대 금지, `.env`에서만 읽기
- 데이터 디렉토리: `backend/data/` (git 제외)
