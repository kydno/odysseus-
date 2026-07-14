# AGENTS.md

## Cursor Cloud specific instructions

Odysseus is a FastAPI + vanilla-JS self-hosted AI workspace. Prefer the **manual Python venv** path in this environment (see `CONTRIBUTING.md`); Docker Compose is fine for parity testing but is heavier and not required for lint/tests/UI work.

### Day-to-day commands

- **Deps / venv:** `./venv/bin/pip install -r requirements.txt` (venv at repo root; create with `python3 -m venv venv` if missing).
- **First-run (idempotent):** `./venv/bin/python setup.py` — creates `data/`, `.env` from `.env.example`, SQLite schema, and admin in `data/auth.json`. Set `ODYSSEUS_ADMIN_USER` / `ODYSSEUS_ADMIN_PASSWORD` (and `ODYSSEUS_SKIP_ADMIN_PROMPT=1`) to avoid interactive prompts.
- **Dev server:** `./venv/bin/python -m uvicorn app:app --host 127.0.0.1 --port 7000` → http://127.0.0.1:7000
- **Lint / syntax:** `./venv/bin/python -m compileall -q app.py core routes src services scripts tests` and `node --check` over `static/app.js` + `static/js/**/*.js` (same as CI).
- **Tests:** `./venv/bin/python -m pytest -q` (full suite; see `CONTRIBUTING.md` / `tests/README.md` for focused runs).

### Non-obvious caveats

- **Auth is on by default.** Unauthenticated UI hits redirect to `/login`. Session cookie comes from `POST /api/auth/login`. `data/`, `.env`, and `venv/` are gitignored — they are local-only.
- **LLM backends are external.** Without Ollama / an OpenAI-compatible endpoint (or keys in `.env` / Settings), chat/agent/research/compare have nothing to call. Core features (Notes, Auth, Documents DB paths, etc.) still work; model discovery logging “0 endpoints” is expected in a bare cloud VM.
- **Optional services degrade gracefully.** ChromaDB, SearXNG, ntfy, and `@playwright/mcp` Browser MCP are optional. Startup may warn that Browser MCP is unavailable until `npx -y @playwright/mcp@latest --version` has been run once.
- **Do not hardcode writable paths or `http://localhost:7000` in code** — use constants / `internal_api_base()` from `src/constants.py` (`CONTRIBUTING.md`).
- **tmux** is required for Cookbook background model jobs; the system `tmux` binary is fine.
