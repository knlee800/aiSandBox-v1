# Import & Export Tasks

## Task: Project Import API
- POST /api/project/import
- Accept .zip / .tar
- Priority: High
- Acceptance: Files extracted + git mapped

## Task: Project Export API
- GET /api/project/export/:sessionId
- Priority: Medium
- Acceptance: Zip returned

## Task: Malware Scan on Import
- Scan uploaded archives
- Priority: Medium
- Acceptance: Reject unsafe content
