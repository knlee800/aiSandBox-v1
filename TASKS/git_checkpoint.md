# Git & Checkpoint Tasks

## Task: Initialize Repo in Containers
- Run git init on container create
- Priority: High
- Acceptance: Repo initialized

## Task: Implement Git Commit API
- POST /api/git/commit
- Priority: High
- Acceptance: Commits created with message

## Task: Git History API
- GET /api/git/history/:sessionId
- Priority: Medium
- Acceptance: History returned

## Task: Git Rollback API
- POST /api/git/rollback
- Priority: High
- Acceptance: Container state resets to commit
