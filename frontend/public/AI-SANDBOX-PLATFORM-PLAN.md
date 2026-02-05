# Complete Software Development Plan: AI Sandbox Platform

**Updated with Security, Scalability, and Pragmatic Deployment Strategy**

---

## Executive Summary

**Product**: Cloud-based AI coding sandbox where users chat with Claude to build applications

**Target Market**:
- Phase 1: In-house users (5-10 people)
- Phase 2: Beta testers (invite-only)
- Phase 3: Commercial customers (B2C developers, educators)

**Revenue Model**: Usage-based billing on AI tokens + subscription tiers

**Infrastructure Strategy**:
- Develop on QNAP TS-253D (owned hardware)
- Scale to cloud VPS when demand exceeds capacity
- Architecture designed for easy migration

**Timeline**: 14 weeks to commercial-ready

---

## Core Architecture (Foundation for Scale)

### Service Architecture Pattern

```
┌─────────────────────────────────────────────────┐
│              Frontend (Next.js)                  │
│   Chat + Monaco Editor + Timeline + Preview     │
└──────────────────┬──────────────────────────────┘
                   │ WebSocket + REST
┌──────────────────▼──────────────────────────────┐
│            API Gateway (NestJS)                  │
│      Auth + Rate Limiting + Request Router      │
└──┬────────────┬─────────────┬────────────────┬──┘
   │            │             │                │
┌──▼─────────┐ ┌▼──────────┐ ┌▼─────────────┐ ┌▼────────────┐
│ Container  │ │    AI     │ │   Billing    │ │   Queue     │
│  Manager   │ │  Service  │ │   Service    │ │   Service   │
│  + Git     │ │           │ │              │ │             │
└──┬─────────┘ └┬──────────┘ └┬─────────────┘ └┬────────────┘
   │            │             │                │
┌──▼────────────▼─────────────▼────────────────▼──┐
│        PostgreSQL + Redis Cluster                │
└──────────────────┬───────────────────────────────┘
                   │
┌──────────────────▼───────────────────────────────┐
│   gVisor Sandboxes (Docker with runsc runtime)   │
│        Isolated user workspaces + Git            │
└──────────────────────────────────────────────────┘
```

**Key Design Principles:**
- **Stateless services**: All state in database, easy horizontal scaling
- **Microservices**: Each service independently deployable
- **Container-per-session**: Proper isolation from day 1
- **Event-driven**: Queue for async operations (cleanup, billing)
- **API-first**: All features accessible via REST API

### Hybrid Architecture: QNAP + Mac for iOS Builds (Optional)

**For iOS app development, add a Mac as iOS Build Agent:**

```
┌─────────────────────────────────────────────────┐
│              Frontend (Next.js)                  │
│   Chat + Monaco Editor + Timeline + Preview     │
└──────────────────┬──────────────────────────────┘
                   │ WebSocket + REST
┌──────────────────▼──────────────────────────────┐
│            API Gateway (NestJS)                  │
│          Routes iOS builds to Mac               │
└──┬────────────┬─────────────┬────────────────┬──┘
   │            │             │                │
┌──▼─────────┐ ┌▼──────────┐ ┌▼─────────────┐ ┌▼────────────┐
│ Container  │ │    AI     │ │   Billing    │ │   Queue     │
│  Manager   │ │  Service  │ │   Service    │ │   Service   │
│  (QNAP)    │ │           │ │              │ │             │
└──┬─────────┘ └┬──────────┘ └┬─────────────┘ └┬────────────┘
   │            │             │                │
   │ ┌──────────┴─────────────▼────────────────▼──┐
   │ │        PostgreSQL + Redis Cluster           │
   │ └─────────────────────────────────────────────┘
   │
   ├─→ Linux Containers (Web + Android)
   │
   └─→ Mac Build Agent (iOS only) ← LAN connection
       └─ Xcode + iOS Simulator
```

**How it works:**
- QNAP handles: Web apps, Android apps, backend services
- Mac handles: iOS builds and simulator preview (when needed)
- Cost: $0 (use owned Mac hardware)
- Alternative: Cloud Mac instances ($650/month)

---

## Complete Database Schema

### Core Tables

```sql
-- Users and Authentication
users:
  - id (uuid, primary key)
  - email (unique, indexed)
  - password_hash
  - role (enum: admin, user, beta)
  - plan_type (enum: free, pro, enterprise)
  - stripe_customer_id (nullable)
  - created_at
  - last_login_at
  - is_active (boolean)

-- Sessions (one per active sandbox)
sessions:
  - id (uuid, primary key)
  - user_id (fk → users.id)
  - project_id (fk → projects.id, nullable) -- linked project if restored from one
  - container_id (unique)
  - status (enum: pending, active, stopped, expired, error)
  - git_initialized (boolean)
  - resource_limits (jsonb) -- cpu, memory, disk
  - created_at
  - expires_at
  - last_activity_at
  - metadata (jsonb) -- browser info, IP, etc.

-- Conversations (full chat history)
conversations:
  - id (uuid, primary key)
  - session_id (fk → sessions.id, unique)
  - user_id (fk → users.id, indexed)
  - messages (jsonb) -- array of {role, content, timestamp, message_number, tools_used}
  - current_message_number (integer)
  - created_at
  - updated_at

-- Checkpoints (version control snapshots)
checkpoints:
  - id (uuid, primary key)
  - session_id (fk → sessions.id, indexed)
  - user_id (fk → users.id, indexed)
  - message_number (integer)
  - git_commit_hash (text)
  - checkpoint_type (enum: auto, manual, milestone)
  - description (text)
  - files_changed (integer)
  - created_at
  - is_deleted (boolean)

-- Token Usage (critical for billing)
token_usage:
  - id (bigserial, primary key)
  - session_id (fk → sessions.id, indexed)
  - user_id (fk → users.id, indexed)
  - message_number (integer)
  - model (text) -- claude-sonnet-4.5, gpt-4, etc.
  - ai_provider (text) -- 'claude', 'chatgpt', 'gemini' (for multi-AI tracking)
  - ai_conversation_id (uuid, fk → ai_conversations.id, nullable) -- link to multi-AI discussion
  - input_tokens (integer)
  - output_tokens (integer)
  - cost_usd (numeric(10,4))
  - timestamp (timestamptz, indexed)
  - request_id (text) -- for debugging

-- Projects (saved workspaces)
projects:
  - id (uuid, primary key)
  - user_id (fk → users.id, indexed)
  - name (text)
  - slug (text, unique) -- URL-friendly name (e.g., "my-todo-app")
  - description (text)
  - checkpoint_id (fk → checkpoints.id) -- starting point
  - storage_path (text) -- S3/local path to files
  - git_enabled (boolean) -- include git history in downloads?
  - archive_size_mb (numeric) -- size of saved project
  - is_public (boolean)
  - fork_count (integer)
  - download_count (integer)
  - last_downloaded_at (timestamptz)
  - created_at
  - last_modified

-- Download History (track all downloads)
downloads:
  - id (uuid, primary key)
  - user_id (fk → users.id, indexed)
  - project_id (fk → projects.id, nullable)
  - session_id (fk → sessions.id, nullable)
  - include_git_history (boolean)
  - format (enum: zip, tar.gz)
  - size_mb (numeric)
  - downloaded_at (timestamptz, indexed)

-- Upload History (track project imports)
uploads:
  - id (uuid, primary key)
  - user_id (fk → users.id, indexed)
  - project_id (fk → projects.id, nullable) -- created project
  - original_filename (text)
  - file_size_mb (numeric)
  - upload_type (enum: zip, tar.gz, git_repo)
  - status (enum: pending, processing, completed, failed)
  - error_message (text, nullable)
  - files_extracted (integer)
  - uploaded_at (timestamptz, indexed)
  - processed_at (timestamptz, nullable)

-- iOS Builds (track Mac build agent jobs)
ios_builds:
  - id (uuid, primary key)
  - session_id (fk → sessions.id, indexed)
  - user_id (fk → users.id, indexed)
  - build_type (enum: simulator, device, archive)
  - status (enum: queued, building, completed, failed)
  - mac_agent_id (text) -- which Mac processed this
  - xcode_version (text)
  - build_output (text)
  - simulator_stream_url (text, nullable)
  - artifact_url (text, nullable) -- IPA download URL
  - build_time_seconds (integer)
  - error_message (text, nullable)
  - created_at (timestamptz)
  - started_at (timestamptz, nullable)
  - completed_at (timestamptz, nullable)

-- Resource Usage (for cost accounting)
resource_usage:
  - id (bigserial, primary key)
  - session_id (fk → sessions.id)
  - user_id (fk → users.id, indexed)
  - cpu_seconds (numeric)
  - memory_mb_hours (numeric)
  - disk_gb_hours (numeric)
  - network_bytes_out (bigint)
  - recorded_at (timestamptz, indexed)

-- Usage Quotas (plan limits)
usage_quotas:
  - id (uuid, primary key)
  - user_id (fk → users.id, unique)
  - tokens_used_month (bigint)
  - tokens_limit_month (bigint)
  - concurrent_sessions_used (integer)
  - concurrent_sessions_limit (integer)
  - storage_gb_used (numeric)
  - storage_gb_limit (numeric)
  - reset_at (timestamptz) -- monthly reset
  - updated_at

-- Billing (Stripe integration)
subscriptions:
  - id (uuid, primary key)
  - user_id (fk → users.id)
  - stripe_subscription_id (text)
  - plan_type (enum: free, pro, enterprise)
  - status (enum: active, cancelled, past_due)
  - current_period_start (timestamptz)
  - current_period_end (timestamptz)
  - cancel_at (nullable timestamptz)

invoices:
  - id (uuid, primary key)
  - user_id (fk → users.id, indexed)
  - stripe_invoice_id (text)
  - amount_usd (numeric(10,2))
  - status (enum: draft, paid, failed)
  - period_start (timestamptz)
  - period_end (timestamptz)
  - token_usage_count (bigint)
  - overage_charges_usd (numeric(10,2))
  - created_at

-- API Keys (for programmatic access)
api_keys:
  - id (uuid, primary key)
  - user_id (fk → users.id, indexed)
  - key_hash (text, unique)
  - key_prefix (text) -- sk_live_abc... for display
  - name (text)
  - rate_limit_per_hour (integer)
  - last_used_at (timestamptz)
  - created_at
  - expires_at (nullable)
  - is_active (boolean)

-- Audit Log
audit_logs:
  - id (bigserial, primary key)
  - user_id (fk → users.id, indexed)
  - action (text) -- session_created, checkpoint_restored, etc.
  - resource_type (text)
  - resource_id (text)
  - metadata (jsonb)
  - ip_address (inet)
  - created_at (timestamptz, indexed)

-- AI-to-AI Conversations (Multi-AI collaboration)
ai_conversations:
  - id (uuid, primary key)
  - session_id (fk → sessions.id, indexed)
  - user_id (fk → users.id, indexed)
  - conversation_id (fk → conversations.id) -- link to main conversation
  - mode (enum: sequential, parallel, discussion)
  - status (enum: active, paused, completed, failed, stopped_by_guard_rail)
  - participating_ais (text[]) -- ['claude', 'chatgpt', 'gemini']
  - max_rounds (integer)
  - current_round (integer)
  - token_budget (bigint)
  - total_tokens (bigint)
  - total_cost (numeric(10,4))
  - messages (jsonb) -- array of {ai, role, content, tokens, timestamp}
  - guard_rails_triggered (jsonb) -- which guard rails stopped it
  - user_interventions (integer) -- how many times user had to intervene
  - error_message (text, nullable)
  - created_at (timestamptz)
  - completed_at (timestamptz, nullable)
```

### Critical Indexes

```sql
-- Performance indexes
CREATE INDEX idx_sessions_user_status ON sessions(user_id, status) WHERE status = 'active';
CREATE INDEX idx_token_usage_user_date ON token_usage(user_id, timestamp DESC);
CREATE INDEX idx_token_usage_session ON token_usage(session_id);
CREATE INDEX idx_token_usage_ai_conversation ON token_usage(ai_conversation_id) WHERE ai_conversation_id IS NOT NULL;
CREATE INDEX idx_checkpoints_session_msg ON checkpoints(session_id, message_number DESC);
CREATE INDEX idx_conversations_session ON conversations(session_id);
CREATE INDEX idx_resource_usage_user_date ON resource_usage(user_id, recorded_at DESC);
CREATE INDEX idx_audit_logs_user_date ON audit_logs(user_id, created_at DESC);

-- Billing indexes
CREATE INDEX idx_invoices_user_period ON invoices(user_id, period_start DESC);
CREATE INDEX idx_subscriptions_user_status ON subscriptions(user_id, status);

-- Project indexes
CREATE INDEX idx_projects_user ON projects(user_id, created_at DESC);
CREATE INDEX idx_projects_slug ON projects(slug);
CREATE INDEX idx_projects_public ON projects(is_public) WHERE is_public = true;
CREATE INDEX idx_downloads_user_date ON downloads(user_id, downloaded_at DESC);
CREATE INDEX idx_uploads_user_date ON uploads(user_id, uploaded_at DESC);
CREATE INDEX idx_uploads_status ON uploads(status, uploaded_at DESC) WHERE status IN ('pending', 'processing');
CREATE INDEX idx_sessions_project ON sessions(project_id) WHERE project_id IS NOT NULL;

-- iOS Build indexes
CREATE INDEX idx_ios_builds_session ON ios_builds(session_id, created_at DESC);
CREATE INDEX idx_ios_builds_user ON ios_builds(user_id, created_at DESC);
CREATE INDEX idx_ios_builds_status ON ios_builds(status, created_at DESC) WHERE status IN ('queued', 'building');

-- Multi-AI Conversation indexes
CREATE INDEX idx_ai_conversations_session ON ai_conversations(session_id, created_at DESC);
CREATE INDEX idx_ai_conversations_user ON ai_conversations(user_id, created_at DESC);
CREATE INDEX idx_ai_conversations_status ON ai_conversations(status) WHERE status IN ('active', 'paused');
```

---

## URL Structure & Session Management

### Overview

The platform uses a **hybrid URL strategy** that balances user experience (stable URLs) with technical requirements (session isolation and security).

### URL Architecture

**Three-tier URL system:**

```
1. Project Permalink (Stable, bookmarkable)
   /project/{project-slug}
   Example: /project/my-todo-app

2. Session Preview (Temporary, unique)
   /preview/{session-id}
   Example: /preview/sess-a7b3c9d1-2e4f-5678-90ab-cdef12345678

3. Public Share (Optional, for sharing)
   /p/{short-code}
   Example: /p/xK9mP2
```

### How It Works

**User Flow:**

```
1. User visits: /project/my-todo-app
   ↓
2. Backend checks: Active session exists?
   Yes → Redirect to existing /preview/sess-xyz...
   No  → Create new session
   ↓
3. User works at: /preview/sess-monday-123
   ↓
4. Session expires after 2 hours
   ↓
5. User returns: /project/my-todo-app
   ↓
6. New session created: /preview/sess-tuesday-456
   ↓
7. Project state restored from last checkpoint
```

### Implementation Details

**Phase 1 (Weeks 1-4): Simple Session IDs**
- Each session gets unique random ID
- Preview URL: `/preview/{session-id}`
- No project permalinks yet
- Sessions die after 2 hours, URL becomes invalid
- **Simple, focused on core functionality**

**Phase 2-3 (Weeks 5-10): Hybrid System**
- Add project persistence
- Project permalink: `/project/{slug}` (always works)
- Auto-redirects to active session or creates new one
- **Best of both worlds: stability + isolation**

**Phase 4 (Weeks 11-14): Advanced Features**
- Custom slugs for Pro users
- Vanity URLs: `/project/username/project-name`
- Public sharing with short codes

### Git Integration

**Git is local to each container:**

```
Container filesystem:
/workspace/
  ├── .git/               ← Initialized automatically
  │   ├── objects/
  │   ├── refs/
  │   └── config
  ├── package.json
  ├── src/
  │   └── app.js
  └── README.md
```

**Auto-commit workflow:**

```
User: "Create a React app"
   ↓
Claude: Creates files...
   ↓
System automatically:
1. git add -A
2. git commit -m "Claude (Msg #5): Created React app structure"
3. Save commit hash to database (checkpoints table)
4. Associate with message number
```

**Git repository lifecycle:**

```
Session created → git init
Files changed → git commit (after each Claude action)
Session ended → git repo destroyed
Project saved → git repo archived (optional: to S3)
Project restored → git repo unpacked into new container
```

### Download Options

**Users can download projects in multiple formats:**

```
┌────────────────────────────────────────┐
│  Download Options                      │
├────────────────────────────────────────┤
│                                        │
│  📦 Quick Download (Code only)         │
│      - No .git folder                  │
│      - Smaller size (~2 MB)            │
│      - Just want the code              │
│                                        │
│  📚 Full Download (With git history)   │
│      - Includes .git folder            │
│      - Larger size (~5 MB)             │
│      - Can see all checkpoints         │
│      - Can git log locally             │
│                                        │
│  🗜️ Compressed (TAR.GZ)                │
│      - Smaller file size               │
│      - Same options as ZIP             │
│                                        │
└────────────────────────────────────────┘
```

**After download, users can:**

```bash
# Unzip the project
unzip my-todo-app.zip
cd my-todo-app

# If downloaded with git history:
git log --oneline
# Shows:
# pqr678 Claude (Msg #12): Fixed login bug
# mno345 Manual Checkpoint: Working authentication
# def456 Claude (Msg #5): Added React components
# abc123 Claude (Msg #1): Initial project setup

# Continue working locally
npm install
npm start

# Even continue the git history
git commit -m "Added my own feature"
```

### Project Import/Upload (Re-upload to Sandbox)

**Users can upload modified code back to the platform:**

**Scenario:**
```
Month 1: Build app in sandbox → Download
Months 2-4: Work locally (npm install, git commit, etc.)
Month 5: Want to add AI features again
```

**Import Options:**

```
┌────────────────────────────────────────┐
│  Import Project                        │
├────────────────────────────────────────┤
│                                        │
│  📤 Upload ZIP/TAR.GZ                  │
│      - Upload your modified code       │
│      - Git history preserved (if .git) │
│      - Creates new project             │
│                                        │
│  🔗 Import from Git URL (Pro)          │
│      - GitHub/GitLab/Bitbucket         │
│      - Clone into new sandbox          │
│      - Keep synced with remote         │
│                                        │
│  📋 Paste/Drop Files                   │
│      - Drag & drop files               │
│      - Quick import                    │
│      - No git history                  │
│                                        │
└────────────────────────────────────────┘
```

**Upload Workflow:**

```
1. User clicks "Import Project"
2. Uploads my-todo-app.zip (includes .git folder)
3. Backend:
   - Validates ZIP (max 100 MB)
   - Scans for malware
   - Extracts to temporary location
   - Creates new project entry
   - Creates new sandbox session
   - Copies files to container /workspace
4. User sees:
   - File tree populated
   - Git history intact (git log works)
   - Can continue with Claude: "Add user authentication"
5. Claude sees all existing code
6. Work continues seamlessly
```

**Implementation:**

```javascript
// Upload API endpoint
POST /api/projects/import

// Request (multipart/form-data)
{
  file: <uploaded-file.zip>,
  name: "My Todo App",
  include_git: true
}

// Process upload
async function importProject(file, userId) {
  // 1. Validate
  if (file.size > 100 * 1024 * 1024) {
    throw new Error('File too large (max 100 MB)');
  }

  // 2. Scan for malware (ClamAV)
  await scanFile(file);

  // 3. Extract
  const tempDir = await extractZip(file);

  // 4. Validate structure
  const hasPackageJson = fs.existsSync(`${tempDir}/package.json`);
  const hasGit = fs.existsSync(`${tempDir}/.git`);

  // 5. Create project
  const project = await db.projects.create({
    user_id: userId,
    name: req.body.name,
    slug: slugify(req.body.name),
    git_enabled: hasGit,
    storage_path: await archiveToS3(tempDir)
  });

  // 6. Create session
  const session = await createSession(userId, project.id);

  // 7. Copy to container
  await copyToContainer(session.container_id, tempDir, '/workspace');

  // 8. Track upload
  await db.uploads.insert({
    user_id: userId,
    project_id: project.id,
    original_filename: file.originalname,
    file_size_mb: file.size / 1024 / 1024,
    upload_type: 'zip',
    status: 'completed',
    files_extracted: countFiles(tempDir)
  });

  return { project, session };
}
```

**Security Considerations:**

```
Upload limits:
- Free tier: 50 MB, 5 uploads/day
- Pro tier: 100 MB, 50 uploads/day
- Enterprise: 500 MB, unlimited

Validation:
- Scan for malware (ClamAV)
- Check for suspicious files (.env with secrets, etc.)
- Limit total files (max 10,000 files)
- Block executable files (.exe, .sh without review)

What gets preserved:
✅ All code files
✅ Git history (if .git folder included)
✅ File structure
✅ Dependencies (package.json, requirements.txt)
❌ node_modules (user must npm install again)
❌ Old conversation (starts fresh with Claude)
❌ Running processes
```

**Git Remote Integration (Pro Feature):**

```javascript
// Connect to Git remote
POST /api/projects/import-git

{
  git_url: "https://github.com/user/my-app.git",
  branch: "main",
  auth_token: "ghp_..." // optional for private repos
}

// Backend clones repo into new container
async function importFromGit(gitUrl, userId) {
  const session = await createSession(userId);

  await execInContainer(session.container_id,
    `git clone ${gitUrl} /workspace`
  );

  // User can git push/pull from sandbox
  return session;
}
```

**Benefits:**

✅ **For Users:**
- Don't lose work when sandbox expires
- Work locally with full tooling
- Come back anytime to add AI features
- Natural development workflow

✅ **For Business:**
- Higher retention (users come back)
- More session revenue
- Competitive parity with Replit/CodeSandbox
- Enables long-term projects

✅ **For System:**
- Same architecture (just reversed flow)
- Reuses existing container/git system
- No new infrastructure needed

### URL Security

**Session ID Generation:**
```javascript
// Cryptographically secure random UUID
const sessionId = crypto.randomUUID();
// Example: a7b3c9d1-2e4f-5678-90ab-cdef12345678
// 128-bit entropy = virtually unguessable
```

**Access Control:**
```javascript
// Every preview request checks ownership
async function accessPreview(sessionId, userId) {
  const session = await db.sessions.findOne({
    id: sessionId,
    user_id: userId  // Must match
  });

  if (!session) {
    throw new Error('Unauthorized');
  }

  // Optional: Check if session expired
  if (session.expires_at < Date.now()) {
    throw new Error('Session expired');
  }

  return session;
}
```

**Public Sharing (Optional):**
```javascript
// Generate temporary share token
async function generateShareLink(sessionId, expiresInHours = 24) {
  const token = crypto.randomBytes(16).toString('hex');

  await db.share_tokens.insert({
    token: token,
    session_id: sessionId,
    expires_at: Date.now() + (expiresInHours * 60 * 60 * 1000)
  });

  return `/share/${token}`;
}
```

### Handling Edge Cases

**Multiple Tabs/Devices:**

```
Scenario: User opens same project in 2 tabs

Detection:
1. User opens Tab 1 → /project/my-app → /preview/sess-123
2. User opens Tab 2 → /project/my-app
3. Backend detects sess-123 already active
4. Show modal:

┌──────────────────────────────────────┐
│  ⚠️  Project Already Open            │
├──────────────────────────────────────┤
│  This project is open in another     │
│  tab or device.                      │
│                                      │
│  [Take Control] (closes other)       │
│  [Open Read-Only]                    │
│  [Cancel]                            │
└──────────────────────────────────────┘
```

**Session Expired:**

```
Scenario: User has old /preview/sess-xyz URL bookmarked

1. User visits bookmarked /preview/sess-xyz
2. Backend checks: Session expired
3. Show message:

┌──────────────────────────────────────┐
│  ⏰ Session Expired                  │
├──────────────────────────────────────┤
│  This session ended 3 days ago.      │
│                                      │
│  [Restore from Last Checkpoint]      │
│  [View Project]                      │
│  [Start Fresh]                       │
└──────────────────────────────────────┘
```

### Routing Implementation

**API Routes:**

```
GET  /project/:slug
  → Find project by slug
  → Check for active session
  → Redirect to /preview/:sessionId or create new

GET  /preview/:sessionId
  → Verify ownership
  → Proxy to container port 3000
  → Stream live preview

POST /projects/:id/restore
  → Create new session from project
  → Restore git state
  → Return new session ID

POST /projects/import
  → Upload ZIP/TAR.GZ file
  → Validate and scan for malware
  → Extract and create new project
  → Create session with imported files
  → Return project and session

POST /projects/import-git
  → Import from Git URL
  → Clone repo into new container
  → Support private repos with auth tokens
  → Return session

GET  /sessions/:id/download
  → Verify ownership
  → Generate ZIP/TAR.GZ
  → Include or exclude .git based on param
  → Stream download
```

### Storage Strategy

**Session Data (Temporary):**
```
Location: Container filesystem
Lifetime: 2 hours
Cleanup: Auto-delete on expire
Size: ~50-500 MB per session
```

**Project Data (Persistent):**
```
Phase 1-2 (QNAP):
  Location: /share/projects/{user-id}/{project-id}/
  Format: TAR.GZ with git history

Phase 3+ (Cloud):
  Location: S3/Spaces
  Format: TAR.GZ compressed
  Versioning: Enabled
  Lifecycle: Archive to Glacier after 90 days
```

### URL Examples

**Phase 1 (MVP):**
```
Main app: https://sandbox.yourdomain.com
Session: https://sandbox.yourdomain.com/preview/sess-abc123...

User workflow:
1. Click "New Project"
2. Get /preview/sess-abc123
3. Work for 1 hour
4. Close browser
5. URL becomes invalid after 2 hours
```

**Phase 2-3 (Hybrid):**
```
Project: https://sandbox.yourdomain.com/project/my-todo-app
Session: https://sandbox.yourdomain.com/preview/sess-monday-123

User workflow:
1. Click "New Project" → Name it "my-todo-app"
2. Bookmark: /project/my-todo-app (stable!)
3. Redirected to: /preview/sess-monday-123
4. Come back tomorrow
5. Visit: /project/my-todo-app
6. New session: /preview/sess-tuesday-456
7. Same project state, different session
```

**Phase 4 (Advanced):**
```
Vanity URLs:
  https://sandbox.yourdomain.com/@username/project-name

Short share links:
  https://sandbox.yourdomain.com/p/xK9mP2

Embed preview:
  https://sandbox.yourdomain.com/embed/sess-abc123
```

### Benefits of Hybrid Approach

✅ **For Users:**
- Stable bookmark URL (`/project/my-app`)
- Shareable project links
- Works across devices
- Natural mental model

✅ **For System:**
- Session isolation (no conflicts)
- Easy cleanup (delete old sessions)
- Security (random session IDs)
- Scalability (stateless sessions)

✅ **For Development:**
- Simple Phase 1 implementation
- Progressive enhancement
- No breaking changes
- Clean architecture

---

## Mobile App Development Support

### Overview

The platform supports building mobile applications alongside web apps:
- **Web apps**: Native support (runs in Linux containers)
- **Android apps**: Native support (Android SDK in containers)
- **iOS apps**: Hybrid approach (Mac as build agent)
- **Cross-platform**: React Native, Flutter, PWA

### Android App Development

**Built-in Android SDK in containers:**

```
Container includes:
- Android SDK & Build Tools
- Android Emulator (optional, resource heavy)
- Gradle
- Java/Kotlin support
```

**User workflow:**
```
1. User: "Create an Android app"
2. Claude generates Kotlin/Java code
3. Preview options:
   - Emulator in container (if enough RAM)
   - Export APK for testing on device
   - Gradle build and download
```

**Resource requirements:**
```
Standard container: 1GB RAM (no emulator)
With emulator: 3GB RAM recommended
CPU: 1-2 cores
```

### iOS App Development (Mac + QNAP Hybrid)

**Architecture:**

```
QNAP (Primary):                Mac (Build Agent):
- User codes with Claude       - Receives build requests
- Stores project files          - Runs Xcode builds
- Manages sessions             - iOS Simulator
                               - Streams preview
         ↕ HTTP/WebSocket
    (Local network 192.168.1.x)
```

**Mac Build Agent Setup:**

**Requirements:**
- Any Mac (MacBook, Mac Mini, iMac, Mac Studio)
- macOS 12+ (Monterey or later)
- Xcode installed (latest stable)
- Node.js 18+
- Network access to QNAP

**Installation:**

```bash
# On Mac: Install build agent
npm install -g @your-platform/ios-build-agent

# Configure
ios-build-agent configure \
  --qnap-host=192.168.1.100 \
  --api-key=your-secret-key \
  --xcode-path=/Applications/Xcode.app

# Start as service (runs in background)
ios-build-agent start --daemon

# Or run manually for testing
ios-build-agent start
```

**How it works:**

```
1. User in QNAP sandbox: "Create iOS app in SwiftUI"
2. Claude generates Swift code
3. User clicks "Build iOS"
4. QNAP sends build request to Mac:
   POST http://mac-ip:3001/api/ios/build
   { sessionId, code, buildType: 'simulator' }
5. Mac Build Agent:
   - Receives request
   - Creates temporary Xcode project
   - Runs: xcodebuild
   - Starts iOS Simulator
   - Streams simulator view (VNC or screenshot stream)
6. User sees iOS preview in browser
7. Can interact, test, debug
```

**Build Agent Implementation:**

```javascript
// On Mac: ios-build-agent/index.js
const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');

const app = express();

// Build request from QNAP
app.post('/api/ios/build', async (req, res) => {
  const { sessionId, code, buildType } = req.body;

  try {
    // 1. Create temp Xcode project
    const projectPath = `/tmp/ios-build-${sessionId}`;
    await createXcodeProject(projectPath, code);

    // 2. Build for simulator
    await execPromise(
      `xcodebuild -project ${projectPath}/App.xcodeproj \
       -scheme App \
       -destination 'platform=iOS Simulator,name=iPhone 15' \
       build`
    );

    // 3. Install to simulator
    const appPath = `${projectPath}/build/Debug-iphonesimulator/App.app`;
    await execPromise(`xcrun simctl install booted ${appPath}`);

    // 4. Launch app
    await execPromise(`xcrun simctl launch booted com.yourplatform.app`);

    // 5. Start streaming simulator screen
    const streamUrl = await startSimulatorStream();

    // 6. Return preview URL
    res.json({
      success: true,
      previewUrl: streamUrl,
      buildLog: '...'
    });

    // 7. Notify QNAP build complete
    await notifyQNAP(sessionId, 'completed', streamUrl);

  } catch (error) {
    res.status(500).json({ error: error.message });
    await notifyQNAP(sessionId, 'failed', null, error.message);
  }
});

// Simulator streaming (WebSocket or HTTP screenshots)
function startSimulatorStream() {
  // Option A: Screenshot stream (simple)
  setInterval(() => {
    exec('xcrun simctl io booted screenshot screenshot.png');
    // Send to QNAP or serve via HTTP
  }, 100); // 10 FPS

  // Option B: VNC protocol (better)
  // Use ios-mirroring or similar

  return 'http://mac-ip:8080/stream/session-id';
}

app.listen(3001);
```

**QNAP Integration:**

```javascript
// On QNAP: services/ios-build-service.js
class IOSBuildService {
  async buildIOS(sessionId, code) {
    // Check if Mac available
    const macAgent = await this.findAvailableMac();
    if (!macAgent) {
      throw new Error('No Mac build agent available');
    }

    // Create build job
    const build = await db.ios_builds.insert({
      session_id: sessionId,
      user_id: req.user.id,
      build_type: 'simulator',
      status: 'queued',
      mac_agent_id: macAgent.id
    });

    // Send to Mac
    const response = await fetch(`${macAgent.url}/api/ios/build`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${macAgent.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sessionId,
        code,
        buildId: build.id,
        buildType: 'simulator',
        callbackUrl: `https://qnap-url/api/ios/build-complete`
      })
    });

    const result = await response.json();

    // Update build status
    await db.ios_builds.update(build.id, {
      status: 'building',
      started_at: new Date(),
      simulator_stream_url: result.previewUrl
    });

    return result;
  }

  async findAvailableMac() {
    // Check registered Mac agents
    const agents = await db.mac_agents.findAll({ status: 'online' });
    if (agents.length === 0) return null;

    // Return least loaded Mac
    return agents.reduce((min, agent) =>
      agent.active_builds < min.active_builds ? agent : min
    );
  }
}
```

**Mac Agents Table:**

```sql
mac_agents:
  - id (uuid)
  - name (text) -- "Office Mac Mini"
  - host (text) -- IP or hostname
  - port (integer) -- default 3001
  - api_key_hash (text)
  - status (enum: online, offline, busy)
  - xcode_version (text)
  - macos_version (text)
  - max_concurrent_builds (integer) -- default 2
  - active_builds (integer)
  - last_heartbeat (timestamptz)
  - created_at (timestamptz)
```

### Cross-Platform Development

**React Native:**
```
User: "Create React Native app"
Claude: Generates code
Preview options:
- Web browser (Expo Web)
- Android emulator (QNAP)
- iOS simulator (Mac)
One codebase, three platforms
```

**Flutter:**
```
Same approach:
- flutter run -d web (QNAP)
- flutter run -d android (QNAP with emulator)
- flutter run -d ios (Mac with simulator)
```

**Progressive Web Apps (PWA):**
```
Best for cross-platform without native builds:
- Works on iOS + Android from browser
- Installable
- Offline support
- No App Store approval
- Runs entirely on QNAP
```

### Cost Analysis

**Option 1: QNAP + Your Mac** (Recommended)
```
QNAP: $0 (owned)
Mac: $0 (owned)
Electricity: ~$15/month (both running)
Total: $15/month
Supports: iOS + Android + Web
```

**Option 2: QNAP + Cloud Mac**
```
QNAP: $0 (owned)
AWS EC2 Mac: $650/month minimum
Total: $650/month
```

**Option 3: Cloud only (no iOS support)**
```
VPS: $100/month
No iOS builds possible
Total: $100/month
```

**Option 4: iOS build services**
```
QNAP: $0
Expo EAS Build: $29-99/month
Codemagic: $75-250/month
Total: $29-250/month (per service)
```

### When to Add Mac

**Phase 1-2:** Skip (focus on web)
- Build core platform
- Web apps only
- Defer iOS support

**Phase 3:** Add Mac if needed
- If users request iOS support
- Connect your Mac to QNAP
- Install build agent
- Zero additional cost

**Phase 4:** Formalize iOS support
- Document Mac setup
- Add iOS simulator streaming
- Polish iOS build UI
- Consider: Second Mac for redundancy

### Security Considerations

**Mac Build Agent:**
```
✅ API key authentication
✅ Requests only from QNAP IP
✅ Temporary project files (auto-delete)
✅ Sandboxed Xcode builds
✅ No arbitrary code execution
✅ Rate limiting (max 2 concurrent builds)
```

**Network Security:**
```
- Mac and QNAP on same LAN
- Firewall: Block external access to Mac
- VPN: For remote Mac management
- HTTPS: Encrypt build artifacts
```

---

## Multi-AI Collaboration & Discussion

### Overview

The platform supports **multi-AI collaboration** where Claude and ChatGPT can work together on the same project, either in parallel or through direct discussion with each other. This enables:

- **Specialized Roles**: ChatGPT for analysis/planning, Claude for implementation
- **Collaborative Problem-Solving**: AIs discuss approaches before implementing
- **Quality Assurance**: One AI reviews another's work
- **Diverse Perspectives**: Different AI models bring different strengths

**Key Features:**
- Multiple AI models in the same sandbox session
- AI-to-AI discussion (with user moderation)
- Guard rails to prevent runaway costs
- User control over AI interactions
- Full transparency (user sees all AI communication)

### Architecture

**Multi-AI Orchestration System:**

```
┌────────────────────────────────────────────────────┐
│              Frontend (Next.js)                     │
│  Chat + AI Selector + Discussion View              │
└──────────────────┬─────────────────────────────────┘
                   │ WebSocket + REST
┌──────────────────▼─────────────────────────────────┐
│         Multi-AI Orchestrator Service               │
│  Routes messages, manages discussions, enforces     │
│  guard rails, tracks costs                          │
└──┬──────────────┬───────────────┬──────────────┬───┘
   │              │               │              │
┌──▼────────┐ ┌──▼─────────┐ ┌──▼────────┐ ┌──▼──────┐
│  Claude   │ │  ChatGPT   │ │  Gemini   │ │  Future │
│  Service  │ │  Service   │ │  Service  │ │  AIs    │
└───────────┘ └────────────┘ └───────────┘ └─────────┘
        │            │              │
        └────────────┴──────────────┘
                     │
        ┌────────────▼────────────┐
        │   Container Manager     │
        │   (Shared workspace)    │
        └─────────────────────────┘
```

### Collaboration Modes

**Mode 1: Sequential (Basic)**
```
User → Claude → Result
User → ChatGPT → Result
Each AI works independently, user coordinates
```

**Mode 2: Parallel (Concurrent)**
```
User asks: "Build a todo app"
├─→ Claude: Implements code
└─→ ChatGPT: Writes documentation

Results merge in same workspace
```

**Mode 3: Collaborative Discussion (Advanced)**
```
User asks: "Design a scalable authentication system"
   ↓
1. ChatGPT analyzes requirements
   → "I recommend JWT with refresh tokens..."
   ↓
2. Claude responds
   → "I agree with JWT. Should we add OAuth2?"
   ↓
3. ChatGPT responds
   → "Good idea. Let's use Passport.js for OAuth2..."
   ↓
4. User approves approach
   ↓
5. Claude implements
```

### Guard Rails & Safety Mechanisms

**Critical safeguards to prevent runaway costs and infinite loops:**

**1. Round Limits**
```javascript
// Maximum AI-to-AI discussion rounds
const DISCUSSION_LIMITS = {
  free: 3,        // Max 3 rounds of AI discussion
  pro: 10,        // Max 10 rounds
  enterprise: 25  // Max 25 rounds
};

// After limit reached, user MUST intervene
```

**2. Token Budget per Discussion**
```javascript
const TOKEN_BUDGETS = {
  free: 50000,      // ~$0.25 per discussion
  pro: 200000,      // ~$1.00 per discussion
  enterprise: 1000000 // ~$5.00 per discussion
};

// Stop discussion if budget exceeded
// Alert user before reaching limit
```

**3. Cost Alerts**
```javascript
// Real-time cost tracking during discussion
function trackDiscussionCost(discussion) {
  const currentCost = calculateCost(discussion.tokens);

  if (currentCost > budget * 0.5) {
    alertUser('Discussion is 50% of budget');
  }

  if (currentCost > budget * 0.8) {
    alertUser('Discussion is 80% of budget - will stop at 100%');
  }

  if (currentCost >= budget) {
    stopDiscussion('Budget limit reached');
    requireUserIntervention();
  }
}
```

**4. User Moderation**
```javascript
// User must approve continuation after N rounds
const APPROVAL_CHECKPOINTS = [5, 10, 15, 20];

if (APPROVAL_CHECKPOINTS.includes(currentRound)) {
  pauseDiscussion();
  askUser('AIs have discussed for X rounds. Continue?');
  // [ Continue ] [ Stop ] [ Adjust Approach ]
}
```

**5. Infinite Loop Detection**
```javascript
// Detect if AIs are repeating themselves
function detectInfiniteLoop(messages) {
  const lastThree = messages.slice(-3);
  const similarity = calculateSimilarity(lastThree);

  if (similarity > 0.85) {
    stopDiscussion('AIs seem stuck in a loop');
    suggestUserIntervention();
  }
}
```

**6. Time Limits**
```javascript
const DISCUSSION_TIMEOUT = {
  free: 5 * 60,      // 5 minutes max
  pro: 15 * 60,      // 15 minutes max
  enterprise: 30 * 60 // 30 minutes max
};

// Auto-stop if discussion exceeds time limit
```

### Implementation

**Multi-AI Orchestrator Service:**

```javascript
// services/multi-ai-orchestrator/index.js
class MultiAIOrchestrator {
  constructor() {
    this.claudeService = new ClaudeService();
    this.chatGPTService = new ChatGPTService();
  }

  async startCollaborativeDiscussion(sessionId, userId, prompt, options = {}) {
    const { mode = 'discussion', maxRounds = 10, tokenBudget = 200000 } = options;

    // Create AI conversation tracking
    const aiConversation = await db.ai_conversations.insert({
      session_id: sessionId,
      user_id: userId,
      mode: mode,
      status: 'active',
      max_rounds: maxRounds,
      token_budget: tokenBudget,
      current_round: 0,
      total_tokens: 0,
      total_cost: 0
    });

    // Initialize discussion
    const discussion = {
      id: aiConversation.id,
      messages: [],
      round: 0,
      tokens: 0,
      cost: 0,
      status: 'active'
    };

    try {
      // Step 1: ChatGPT analyzes/plans
      const chatGPTResponse = await this.chatGPTService.sendMessage({
        role: 'system',
        content: `You are working with Claude AI to help the user. Your role: analyze requirements and suggest approaches. Be concise.`
      }, {
        role: 'user',
        content: prompt
      });

      discussion.messages.push({
        ai: 'chatgpt',
        role: 'assistant',
        content: chatGPTResponse.content,
        tokens: chatGPTResponse.usage
      });
      discussion.tokens += chatGPTResponse.usage.total_tokens;
      discussion.cost += this.calculateCost('gpt-4', chatGPTResponse.usage);

      // Notify user
      await this.notifyUser(sessionId, {
        type: 'ai_message',
        ai: 'ChatGPT',
        message: chatGPTResponse.content
      });

      // Check guard rails
      if (await this.checkGuardRails(discussion, aiConversation)) {
        return discussion;
      }

      // Step 2: Claude responds
      discussion.round++;
      const claudeResponse = await this.claudeService.sendMessage({
        role: 'system',
        content: `You are collaborating with ChatGPT to help the user. ChatGPT has analyzed the requirements. Review their analysis and add your thoughts or agree. Be concise.`
      }, {
        role: 'user',
        content: `User request: ${prompt}\n\nChatGPT's analysis:\n${chatGPTResponse.content}\n\nYour response:`
      });

      discussion.messages.push({
        ai: 'claude',
        role: 'assistant',
        content: claudeResponse.content,
        tokens: claudeResponse.usage
      });
      discussion.tokens += claudeResponse.usage.input_tokens + claudeResponse.usage.output_tokens;
      discussion.cost += this.calculateCost('claude-sonnet-4.5', claudeResponse.usage);

      await this.notifyUser(sessionId, {
        type: 'ai_message',
        ai: 'Claude',
        message: claudeResponse.content
      });

      // Continue discussion rounds (with guard rails)
      while (discussion.round < maxRounds) {
        if (await this.checkGuardRails(discussion, aiConversation)) {
          break;
        }

        if (await this.needsUserApproval(discussion)) {
          await this.requestUserApproval(sessionId, discussion);
          break; // Wait for user
        }

        // Continue discussion
        discussion.round++;
        // ... more rounds ...
      }

      // Final: Claude implements
      await this.notifyUser(sessionId, {
        type: 'discussion_complete',
        summary: `Discussion complete (${discussion.round} rounds, ${discussion.tokens} tokens, $${discussion.cost.toFixed(4)})`
      });

      // Update database
      await db.ai_conversations.update(aiConversation.id, {
        status: 'completed',
        current_round: discussion.round,
        total_tokens: discussion.tokens,
        total_cost: discussion.cost,
        completed_at: new Date()
      });

      return discussion;

    } catch (error) {
      await db.ai_conversations.update(aiConversation.id, {
        status: 'failed',
        error_message: error.message
      });
      throw error;
    }
  }

  async checkGuardRails(discussion, limits) {
    // Token budget check
    if (discussion.tokens >= limits.token_budget) {
      await this.notifyUser(discussion.sessionId, {
        type: 'guard_rail_triggered',
        reason: 'token_budget_exceeded',
        message: `Token budget reached (${discussion.tokens}/${limits.token_budget})`
      });
      return true;
    }

    // Cost check
    if (discussion.cost >= limits.cost_limit) {
      await this.notifyUser(discussion.sessionId, {
        type: 'guard_rail_triggered',
        reason: 'cost_limit_exceeded',
        message: `Cost limit reached ($${discussion.cost.toFixed(4)})`
      });
      return true;
    }

    // Round limit check
    if (discussion.round >= limits.max_rounds) {
      await this.notifyUser(discussion.sessionId, {
        type: 'guard_rail_triggered',
        reason: 'max_rounds_exceeded',
        message: `Maximum discussion rounds reached (${discussion.round}/${limits.max_rounds})`
      });
      return true;
    }

    // Infinite loop detection
    if (this.detectInfiniteLoop(discussion.messages)) {
      await this.notifyUser(discussion.sessionId, {
        type: 'guard_rail_triggered',
        reason: 'infinite_loop_detected',
        message: 'AIs seem to be repeating. Manual intervention needed.'
      });
      return true;
    }

    return false;
  }

  detectInfiniteLoop(messages) {
    if (messages.length < 3) return false;

    const lastThree = messages.slice(-3).map(m => m.content);
    // Simple similarity check (in production, use proper text similarity)
    const uniqueWords = new Set(lastThree.join(' ').split(' '));
    return uniqueWords.size < 20; // Too few unique words = likely loop
  }

  async needsUserApproval(discussion) {
    const CHECKPOINTS = [5, 10, 15, 20];
    return CHECKPOINTS.includes(discussion.round);
  }

  calculateCost(model, usage) {
    const PRICING = {
      'gpt-4': { input: 0.03 / 1000, output: 0.06 / 1000 },
      'claude-sonnet-4.5': { input: 0.003 / 1000, output: 0.015 / 1000 }
    };

    const pricing = PRICING[model];
    return (usage.input_tokens * pricing.input) + (usage.output_tokens * pricing.output);
  }
}
```

### Database Schema Additions

**New table: ai_conversations**

```sql
-- AI-to-AI conversations (multi-AI discussions)
ai_conversations:
  - id (uuid, primary key)
  - session_id (fk → sessions.id, indexed)
  - user_id (fk → users.id, indexed)
  - conversation_id (fk → conversations.id) -- link to main conversation
  - mode (enum: sequential, parallel, discussion)
  - status (enum: active, paused, completed, failed, stopped_by_guard_rail)
  - participating_ais (text[]) -- ['claude', 'chatgpt']
  - max_rounds (integer)
  - current_round (integer)
  - token_budget (bigint)
  - total_tokens (bigint)
  - total_cost (numeric(10,4))
  - messages (jsonb) -- array of {ai, role, content, tokens, timestamp}
  - guard_rails_triggered (jsonb) -- which guard rails stopped it
  - user_interventions (integer) -- how many times user had to intervene
  - error_message (text, nullable)
  - created_at (timestamptz)
  - completed_at (timestamptz, nullable)

-- Indexes
CREATE INDEX idx_ai_conversations_session ON ai_conversations(session_id, created_at DESC);
CREATE INDEX idx_ai_conversations_user ON ai_conversations(user_id, created_at DESC);
CREATE INDEX idx_ai_conversations_status ON ai_conversations(status) WHERE status IN ('active', 'paused');
```

**Extend token_usage table:**

```sql
-- Add AI identifier to token tracking
ALTER TABLE token_usage ADD COLUMN ai_provider (text); -- 'claude', 'chatgpt', 'gemini'
ALTER TABLE token_usage ADD COLUMN ai_conversation_id (uuid, fk → ai_conversations.id, nullable);

CREATE INDEX idx_token_usage_ai_conversation ON token_usage(ai_conversation_id);
```

### UI/UX Design

**AI Selector (Chat Interface):**

```
┌────────────────────────────────────────────┐
│  Who should help with this task?           │
├────────────────────────────────────────────┤
│                                            │
│  ○  Claude (Default)                       │
│      Best for: Implementation, coding      │
│                                            │
│  ○  ChatGPT                                │
│      Best for: Analysis, planning          │
│                                            │
│  ○  Collaborate (Claude + ChatGPT) 🤝      │
│      They will discuss before coding       │
│      [ Configure... ]                      │
│                                            │
│  ○  Gemini (Coming soon)                   │
│      Best for: Data analysis               │
│                                            │
└────────────────────────────────────────────┘
```

**Collaboration Configuration:**

```
┌────────────────────────────────────────────┐
│  Multi-AI Collaboration Settings           │
├────────────────────────────────────────────┤
│                                            │
│  Mode:                                     │
│  ● Discuss then implement (Recommended)    │
│  ○ Work in parallel                        │
│  ○ Sequential (I'll coordinate)            │
│                                            │
│  Discussion Limits:                        │
│  Max rounds: [10  ▼]  (3-25)              │
│  Token budget: [200K ▼]  (~$1.00)         │
│                                            │
│  ⚠️  Estimated cost: $0.50 - $2.00         │
│  💡 Tip: Start with fewer rounds           │
│                                            │
│  [ Cancel ]  [ Start Collaboration ]       │
│                                            │
└────────────────────────────────────────────┘
```

**Discussion View:**

```
┌────────────────────────────────────────────┐
│  AI Discussion (Round 3/10)                │
│  Tokens: 45,000 / 200,000  💰 $0.23       │
├────────────────────────────────────────────┤
│                                            │
│  🤖 ChatGPT:                               │
│  "I recommend using JWT tokens with..."    │
│                                            │
│  🤖 Claude:                                │
│  "Good approach. I'd add OAuth2 for..."    │
│                                            │
│  🤖 ChatGPT:                               │
│  "Agreed. Let's use Passport.js..."        │
│                                            │
│  ⏸️  Discussion paused for your review     │
│                                            │
│  [ Continue Discussion (7 rounds left) ]   │
│  [ Stop & Let Claude Implement ]           │
│  [ Adjust Approach... ]                    │
│                                            │
└────────────────────────────────────────────┘
```

**Cost Alert (Mid-Discussion):**

```
┌────────────────────────────────────────────┐
│  ⚠️  Discussion Cost Alert                 │
├────────────────────────────────────────────┤
│                                            │
│  The AIs have been discussing for 8 rounds │
│                                            │
│  Current cost: $0.85 / $1.00 budget        │
│  Tokens used: 170K / 200K                  │
│                                            │
│  Continue for 2 more rounds?               │
│                                            │
│  [ Yes, Continue ]                         │
│  [ Stop Here & Implement ]                 │
│  [ Increase Budget to $2.00 ]              │
│                                            │
└────────────────────────────────────────────┘
```

### Cost Analysis

**Single AI (Current):**
```
Typical session: 50,000 tokens
Claude Sonnet 4.5: ~$0.25 per session
```

**Multi-AI Collaboration:**
```
Discussion phase: 100,000 tokens (ChatGPT + Claude analyzing)
  - ChatGPT (GPT-4): 50,000 tokens = ~$2.00
  - Claude: 50,000 tokens = ~$0.25
  - Total discussion: ~$2.25

Implementation phase: 50,000 tokens (Claude coding)
  - Claude: 50,000 tokens = ~$0.25

Total session cost: ~$2.50 (10x more expensive)
```

**Cost Optimization Strategies:**
1. Use GPT-3.5 for discussion (90% cheaper)
2. Limit discussion rounds to 3-5 by default
3. Cache common discussions
4. Use multi-AI only for complex tasks
5. Offer as Pro/Enterprise feature

**Pricing Impact:**
```
Free tier: No multi-AI (too expensive)
Pro tier ($29/mo): 10 multi-AI sessions/month included
Enterprise ($299/mo): 100 multi-AI sessions/month
Pay-as-you-go: $2-5 per discussion
```

### Use Cases

**1. Complex Architecture Decisions**
```
User: "Design a microservices architecture for my e-commerce app"
ChatGPT: Analyzes requirements, suggests patterns
Claude: Reviews, adds implementation details
Result: Well-thought-out architecture + code
```

**2. Code Review**
```
User: "Review the authentication system Claude built"
Claude: Built the system
ChatGPT: Reviews for security issues, best practices
Result: Higher quality, fewer bugs
```

**3. Debugging Complex Issues**
```
User: "Why is my app slow?"
ChatGPT: Analyzes symptoms, suggests profiling
Claude: Runs profiling tools, finds bottleneck
ChatGPT: Suggests optimization strategies
Claude: Implements optimizations
```

**4. Learning/Education**
```
User: "Explain how React hooks work and build an example"
ChatGPT: Explains concepts (better at explanations)
Claude: Builds working examples (better at coding)
Result: Better learning experience
```

### Security Considerations

**1. Prompt Injection Prevention**
```javascript
// Sanitize AI-to-AI messages
function sanitizeAIMessage(message) {
  // Remove system prompt injection attempts
  const blocked = [
    'ignore previous instructions',
    'you are now',
    'forget everything',
    'new instructions'
  ];

  for (const phrase of blocked) {
    if (message.toLowerCase().includes(phrase)) {
      throw new Error('Potential prompt injection detected');
    }
  }

  return message;
}
```

**2. API Key Isolation**
```javascript
// Each AI service uses separate API keys
// If one is compromised, others remain secure
const config = {
  claude: { apiKey: process.env.CLAUDE_API_KEY },
  chatgpt: { apiKey: process.env.OPENAI_API_KEY },
  gemini: { apiKey: process.env.GEMINI_API_KEY }
};
```

**3. Rate Limiting per AI**
```javascript
// Separate rate limits for each AI provider
const rateLimits = {
  claude: { requests: 100, per: 'hour' },
  chatgpt: { requests: 100, per: 'hour' },
  total: { requests: 150, per: 'hour' } // Combined limit
};
```

**4. Audit All AI Communications**
```javascript
// Log every AI message for security review
await db.audit_logs.insert({
  user_id: userId,
  action: 'ai_conversation',
  resource_type: 'ai_message',
  metadata: {
    ai_provider: 'chatgpt',
    message_preview: message.substring(0, 100),
    conversation_id: aiConversation.id
  }
});
```

### Phase Implementation

**Phase 3 (Week 9): Basic Multi-AI**
- ✅ ChatGPT API integration
- ✅ Sequential mode (user coordinates)
- ✅ Parallel mode (independent work)
- ✅ Token tracking for multiple AIs
- ✅ Cost breakdown per AI
- ✅ Simple AI selector UI

**Phase 4 (Week 13): AI Discussion**
- ✅ Collaborative discussion mode
- ✅ AI-to-AI message passing
- ✅ Guard rails implementation (all 6 types)
- ✅ Discussion viewer UI
- ✅ Cost alerts and user approvals
- ✅ ai_conversations database table
- ✅ Analytics: discussion effectiveness

**Future Enhancements:**
- Gemini integration (Phase 5)
- More specialized AI agents (code review, testing, docs)
- AI voting (3+ AIs vote on best approach)
- Learning from successful discussions
- User feedback on AI collaboration quality

### Benefits

**For Users:**
- ✅ Better results (multiple AI perspectives)
- ✅ Higher quality code (peer review by AIs)
- ✅ Faster problem-solving (parallel work)
- ✅ Educational value (learn from AI discussions)

**For Business:**
- ✅ Differentiation (unique feature)
- ✅ Higher-tier monetization (premium feature)
- ✅ Reduced refunds (better outcomes)
- ✅ Marketing: "Multiple AIs working together"

**For System:**
- ✅ Same container infrastructure
- ✅ Reuses existing AI services
- ✅ Guard rails prevent abuse
- ✅ Transparent costs

### Risks & Mitigations

**Risk: Runaway costs**
- Mitigation: All 6 guard rails enforced
- Impact: High → Low

**Risk: AIs don't collaborate well**
- Mitigation: Pre-tested prompts, A/B testing
- Impact: Medium → Low

**Risk: Slower than single AI**
- Mitigation: Optional feature, user choice
- Impact: Low

**Risk: Confusing for users**
- Mitigation: Clear UI, defaults to single AI
- Impact: Medium → Low

---

## Conversational Orchestration Layer (Optional / Future Enhancement)

> **Status:** Planned but not committed. This section ensures the architecture can accommodate conversational interaction without requiring major refactoring later.

### Overview

The Conversational Orchestration Layer is an **optional UX enhancement** that sits between the user and the underlying services, providing natural-language understanding, intent extraction, confirmation dialogs, and human-readable feedback in multiple languages (including Cantonese).

**Key Principle:** This layer coordinates existing services without replacing them. It's an orchestration layer, not a reimplementation.

**Why Plan This Now:**
- Ensures core architecture is orchestrator-friendly
- Prevents future refactoring nightmares
- Allows incremental adoption (start simple, add complexity later)
- No commitment to implement, but fully architected if needed

### Architecture

**With Conversational Orchestrator (Optional):**

```
┌────────────────────────────────────────────────────┐
│              Frontend (Next.js)                     │
│         Chat + Monaco Editor + Preview             │
└──────────────────┬─────────────────────────────────┘
                   │ User message (text or voice)
┌──────────────────▼─────────────────────────────────┐
│      Conversational Orchestrator (Optional)         │
│  • Detect language (Cantonese/English/mixed)       │
│  • Extract intent (create, modify, debug, etc.)    │
│  • Request clarification if ambiguous              │
│  • Generate confirmation dialog (if destructive)   │
│  • Route to appropriate service                    │
│  • Generate human-readable summary                 │
└──┬──────────┬────────────┬──────────────┬──────────┘
   │          │            │              │
   │ If orchestrator disabled, frontend routes directly to services
   │
   ├─→ AI Service (Claude/ChatGPT)
   ├─→ Multi-AI Orchestrator
   ├─→ Container Manager
   └─→ Git Service

Result: User sees human-language summary, not raw execution logs
```

**Without Orchestrator (Current MVP):**
```
Frontend → AI Service → Container Manager → Result
(User messages go directly to AI, no interpretation layer)
```

**Key Design Decision:** The orchestrator is **optional** and can be toggled on/off per user or per tier:
- Free tier: Direct AI access (lower latency, lower cost)
- Pro tier: Optional orchestrator (better UX, confirmation dialogs)
- Enterprise: Full orchestrator (Cantonese, intent detection, safety)

### Supported Intents (v1)

The orchestrator recognizes these high-level intents:

```
1. create_project     - "Build a todo app", "創建一個 React 項目"
2. modify_code        - "Add validation", "改呢個 function"
3. debug_issue        - "Fix the bug", "搵出問題喺邊"
4. refactor_code      - "Make it cleaner", "重構呢段 code"
5. explain_code       - "How does this work?", "解釋畀我聽"
6. review_code        - "Check for issues", "幫我 review"
7. run_test           - "Run the app", "測試下"
8. revert_restore     - "Undo that change", "還原返之前"
9. import_export      - "Download project", "上傳 code"
```

**Intent Extraction Example:**

```javascript
// User input (Cantonese mixed with English)
"幫我 refactor 呢個 login function，make it more secure"

// Orchestrator extracts:
{
  intent: "refactor_code",
  target: "login function",
  goal: "improve security",
  language: "mixed_cantonese_english",
  confidence: 0.92
}

// Orchestrator confirms:
"我會重構 login function，加強 security：
- Add input validation
- Hash passwords properly
- Add rate limiting

繼續嗎？ [Yes] [No] [Tell me more]"
```

### Confirmation Rules (Critical for Safety)

**Non-Negotiable Rule:** For destructive or large changes, the orchestrator MUST summarize and request confirmation.

**Automatic Confirmation Thresholds:**

```javascript
const CONFIRMATION_RULES = {
  // Auto-proceed (no confirmation needed)
  auto: {
    max_lines_changed: 10,
    max_files_changed: 1,
    no_deletions: true,
    no_dependency_changes: true
  },

  // Optional confirmation (show diff, let user decide)
  optional: {
    max_lines_changed: 100,
    max_files_changed: 5,
    show_diff: true
  },

  // Mandatory confirmation (cannot proceed without approval)
  mandatory: [
    'file_deletion',
    'directory_deletion',
    'lines_changed > 100',
    'files_changed > 5',
    'dependency_modification',
    'database_schema_change',
    'refactor_across_multiple_modules',
    'security_related_changes'
  ]
};
```

**Confirmation Dialog Example:**

```
┌────────────────────────────────────────────────┐
│  ⚠️  Confirm Action                            │
├────────────────────────────────────────────────┤
│                                                │
│  Intent: Refactor authentication system        │
│                                                │
│  Changes:                                      │
│  • Modify 8 files                              │
│  • 247 lines changed                           │
│  • Add 2 dependencies (passport, bcrypt)       │
│  • Delete old auth.js                          │
│                                                │
│  Estimated time: 2-3 minutes                   │
│  Estimated cost: ~$0.15                        │
│                                                │
│  [ View Full Diff ] [ Cancel ] [ Proceed ]    │
│                                                │
└────────────────────────────────────────────────┘
```

### Language Support

**Supported Languages:**
- **English** (primary)
- **Cantonese** (廣東話) - unique differentiator for HK/GD market
- **Mixed** (e.g., "幫我 add一個 validation check")

**Language Detection Strategy:**

```javascript
async function detectLanguage(userMessage) {
  // Fast heuristic check (no AI call)
  const cantonese_chars = /[\u4e00-\u9fff]/g;
  const ratio = (userMessage.match(cantonese_chars) || []).length / userMessage.length;

  if (ratio > 0.5) return 'cantonese';
  if (ratio > 0.1) return 'mixed';
  return 'english';
}

// Response matches user's language
if (language === 'cantonese' || language === 'mixed') {
  response = generateCantoneseResponse(intent, result);
} else {
  response = generateEnglishResponse(intent, result);
}
```

**Tone Guidelines:**

```
✅ Good (human, helpful):
"我會幫你 refactor 呢個 function，改用 async/await。
完成後我會話你知有咩改動。"

❌ Bad (robotic, technical):
"Executing refactor operation on target function.
Applying transformation: callbacks → async/await.
Awaiting completion signal."
```

### Conversation → Checkpoint Mapping

**Critical Rule:** Each confirmed conversational action MUST result in:

1. **One logical execution** (AI performs the task)
2. **One git commit** (code changes tracked)
3. **One checkpoint** (revertible point)
4. **One human-readable summary** (user understands what changed)

**Example Flow:**

```
User: "Fix the login bug"
   ↓
Orchestrator: Extract intent (debug_issue)
   ↓
Orchestrator: "我會搵出 login 嘅問題。繼續？"
   ↓
User: "Yes"
   ↓
AI Service: Debug and fix
   ↓
Git: Commit "Fixed login validation bug"
   ↓
Checkpoint: Created at message #47
   ↓
Orchestrator: "搞掂！修復咗 login validation 嘅 bug。
主要改動：
- 加咗 email format 檢查
- 修正咗 password 長度驗證
- 改善咗錯誤提示"
```

### Implementation Considerations

**Phase 3 (Week 9-10): Lite Orchestrator (Optional)**
- ✅ Confirmation dialogs for destructive actions only
- ✅ No intent classification (messages go directly to AI)
- ✅ English only
- ✅ Simple summaries: "Modified 3 files, added 47 lines"
- ✅ Cost: +500 tokens per action (~$0.01)

**Phase 4+ (Week 13+): Full Orchestrator (Optional)**
- ✅ Intent classification (9 types)
- ✅ Cantonese + English + mixed
- ✅ Clarification questions for ambiguous requests
- ✅ Rich summaries with bullet points
- ✅ Conversation state management
- ✅ Cost: +1500-2000 tokens per action (~$0.03-0.10)

**Expert Mode Bypass:**
Power users (Pro/Enterprise) can disable orchestrator:
- No confirmation dialogs
- No intent classification
- Direct AI access (like MVP)
- Faster execution, lower cost
- For users who know exactly what they want

### Cost Analysis

**Orchestrator Token Overhead:**

```
Lite Orchestrator (Phase 3):
- Confirmation generation: 300-500 tokens
- Summary generation: 200-300 tokens
- Total per action: ~500-800 tokens
- Cost per action: ~$0.01
- Session overhead (50 actions): ~$0.50 (10% increase)

Full Orchestrator (Phase 4+):
- Intent extraction: 500-800 tokens
- Language detection: 100-200 tokens (if AI-based)
- Clarification questions: 300-500 tokens (when needed)
- Confirmation generation: 300-500 tokens
- Summary generation: 300-500 tokens
- Total per action: ~1500-2500 tokens
- Cost per action: ~$0.03-0.10
- Session overhead (50 actions): ~$1.50-5.00 (30% increase)
```

**Pricing Strategy:**

```
Free Tier: No orchestrator (too expensive)
Pro Tier: Lite orchestrator (confirmations + summaries)
Enterprise Tier: Full orchestrator (Cantonese + intent + clarification)
```

**Alternative: Per-Action Pricing:**
- Lite orchestration: +$0.01 per action
- Full orchestration: +$0.05 per action
- User chooses based on need

### Database Schema Additions

**New table: orchestrator_conversations (optional)**

```sql
-- Track orchestrator conversation state (if full orchestrator enabled)
orchestrator_conversations:
  - id (uuid, primary key)
  - session_id (fk → sessions.id, indexed)
  - user_id (fk → users.id, indexed)
  - message_number (integer)
  - user_message (text)
  - detected_language (enum: english, cantonese, mixed)
  - extracted_intent (enum: create_project, modify_code, debug_issue, etc.)
  - intent_confidence (numeric(3,2)) -- 0.00 to 1.00
  - clarification_needed (boolean)
  - confirmation_required (boolean)
  - confirmation_status (enum: pending, approved, rejected, null)
  - action_summary (text) -- human-readable summary after execution
  - tokens_used (integer)
  - cost_usd (numeric(10,4))
  - created_at (timestamptz)
  - resolved_at (timestamptz, nullable)

-- Indexes
CREATE INDEX idx_orchestrator_conv_session ON orchestrator_conversations(session_id, message_number DESC);
CREATE INDEX idx_orchestrator_conv_pending ON orchestrator_conversations(confirmation_status, created_at DESC)
  WHERE confirmation_status = 'pending';
```

**Extend sessions table:**

```sql
-- Add orchestrator preference
ALTER TABLE sessions ADD COLUMN orchestrator_enabled (boolean DEFAULT false);
ALTER TABLE sessions ADD COLUMN orchestrator_mode (enum: off, lite, full, DEFAULT 'off');
```

**Extend users table:**

```sql
-- Add user orchestrator preferences
ALTER TABLE users ADD COLUMN preferred_language (enum: english, cantonese, mixed, auto, DEFAULT 'auto');
ALTER TABLE users ADD COLUMN orchestrator_preference (enum: off, lite, full, DEFAULT 'off');
ALTER TABLE users ADD COLUMN expert_mode (boolean DEFAULT false); -- bypass all confirmations
```

### UI/UX Mockups

**Orchestrator Settings (User Preferences):**

```
┌────────────────────────────────────────────┐
│  Conversational Assistance Settings        │
├────────────────────────────────────────────┤
│                                            │
│  Assistance Level:                         │
│  ○  Off (Direct AI access)                 │
│      Fastest, lowest cost                  │
│                                            │
│  ●  Lite (Safety confirmations)            │
│      Confirm before destructive changes    │
│      +$0.01 per action                     │
│                                            │
│  ○  Full (Natural conversation) [Pro]      │
│      Cantonese support, intent detection   │
│      +$0.05 per action                     │
│                                            │
│  Language:                                 │
│  [Auto-detect ▼] English, 廣東話, Mixed    │
│                                            │
│  ☐ Expert Mode (skip all confirmations)   │
│     ⚠️  Use with caution                   │
│                                            │
│  [ Save Settings ]                         │
│                                            │
└────────────────────────────────────────────┘
```

**Intent Clarification Dialog:**

```
┌────────────────────────────────────────────┐
│  🤔 I need more information                │
├────────────────────────────────────────────┤
│                                            │
│  You said: "Make it faster"                │
│                                            │
│  What would you like me to do?             │
│                                            │
│  ○  Optimize algorithm performance         │
│  ○  Add caching (Redis/memory)             │
│  ○  Reduce API calls                       │
│  ○  Database query optimization            │
│  ○  Something else (tell me more)          │
│                                            │
│  [ Cancel ]  [ Continue ]                  │
│                                            │
└────────────────────────────────────────────┘
```

**Cantonese Confirmation Example:**

```
┌────────────────────────────────────────────┐
│  ⚠️  確認操作                               │
├────────────────────────────────────────────┤
│                                            │
│  我會重構 login module，同時改 auth flow：  │
│                                            │
│  主要改動：                                 │
│  • 用 JWT tokens 取代 session cookies      │
│  • 加 OAuth2 support (Google, Facebook)    │
│  • 重寫 password hashing (bcrypt)          │
│                                            │
│  影響範圍：                                 │
│  • 8 個 files                              │
│  • 預計 15-20 分鐘                         │
│  • 費用：~$0.30                            │
│                                            │
│  [ 睇詳細 ] [ 唔做 ] [ 繼續 ]             │
│                                            │
└────────────────────────────────────────────┘
```

### Voice-Ready Design Note

**Future Consideration (No implementation now):**

The conversational orchestrator is designed to be **input-agnostic**:
- Today: Text input (chat interface)
- Future: Voice input (speech-to-text → orchestrator → text-to-speech)

**Design principles that enable voice:**
- Orchestrator processes text, not UI events
- Stateless intent extraction
- Confirmation dialogs can be audio prompts
- Summaries are human-language (readable = speakable)

**No action needed now**, but architecture supports voice when ready.

### Implementation Checklist

**If/When Implementing Lite Orchestrator (Phase 3):**
- [ ] Add orchestrator service (NestJS microservice)
- [ ] Implement confirmation rules engine
- [ ] Create confirmation dialog UI components
- [ ] Add summary generation (post-execution)
- [ ] Track orchestrator costs separately
- [ ] Add user preference: on/off/expert mode
- [ ] Test with destructive operations (file deletion, etc.)
- [ ] A/B test: orchestrator vs direct AI (measure satisfaction)

**If/When Implementing Full Orchestrator (Phase 4+):**
- [ ] Implement intent classification (Claude/GPT-4)
- [ ] Add language detection (Cantonese/English/mixed)
- [ ] Create clarification question system
- [ ] Implement conversation state manager
- [ ] Add orchestrator_conversations database table
- [ ] Build rich summary templates (per intent type)
- [ ] Add Cantonese response generation
- [ ] Implement language-matching logic
- [ ] Test with real Cantonese users
- [ ] Measure: latency impact, cost impact, user satisfaction

### Benefits

**For Users:**
- ✅ Safer (confirm before breaking things)
- ✅ Natural language (no need to learn AI prompting)
- ✅ Cantonese support (unique in market)
- ✅ Understand what changed (human summaries)
- ✅ Less anxiety (know before it happens)

**For Business:**
- ✅ Differentiation (first AI sandbox with Cantonese)
- ✅ Higher-tier feature (Pro/Enterprise upsell)
- ✅ Reduced support tickets (fewer "AI broke my code" complaints)
- ✅ Better retention (users trust the platform)
- ✅ Voice-ready (future expansion opportunity)

**For System:**
- ✅ Optional layer (can disable for power users)
- ✅ No changes to core services
- ✅ Incremental adoption (start lite, go full later)
- ✅ Cost-transparent (track separately)

### Risks & Mitigations

**Risk: Latency increase**
- Current: 1 round trip (user → AI → result)
- With orchestrator: 2-3 round trips (extract intent → confirm → execute)
- Mitigation: Lite mode for fast users, full mode for safety-conscious users
- Impact: Medium (but acceptable for safety)

**Risk: Confirmation fatigue**
- Users get annoyed by too many confirmations
- Mitigation: Smart thresholds (only large/destructive changes)
- Mitigation: Expert mode bypass
- Impact: Low → Medium

**Risk: Cost increase (20-30%)**
- Orchestrator adds 1500-2500 tokens per action
- Mitigation: Make it optional (off by default for free tier)
- Mitigation: Charge per-action or include in Pro/Enterprise
- Impact: Medium (but offset by higher-tier pricing)

**Risk: Intent misclassification**
- Orchestrator misunderstands user intent
- Mitigation: High confidence threshold (0.85+) or ask for clarification
- Mitigation: User can always override/correct
- Impact: Low → Medium

**Risk: Language mixing complexity**
- Hong Kong users mix Cantonese + English + code terms
- Mitigation: Claude handles mixed language well
- Mitigation: Test extensively with real HK users
- Impact: Medium (but core audience needs this)

### Why Plan This Now (Even If Not Implementing)

1. **Architecture Compatibility:** Core services designed to be orchestrator-friendly
2. **Database Schema:** Users/sessions tables include orchestrator fields
3. **API Design:** Services expose intent-friendly endpoints
4. **No Refactoring Later:** Can add orchestrator without changing existing code
5. **Optional Adoption:** Can deploy MVP without orchestrator, add later incrementally
6. **Business Option:** If users demand better UX, can implement Phase 3 in 2-3 weeks

**Bottom Line:** Planning now = zero cost, maximum flexibility.

---

## Security Architecture (Non-Negotiable)

### Sandbox Isolation

**Technology**: gVisor (runsc runtime)
- Intercepts all system calls
- Prevents container escape
- Works on x86_64 (TS-253D compatible)

**Container Configuration**:
```
Runtime: runsc (gVisor)
User: non-root (uid 1000)
Network: disabled by default (allowlist mode for package managers)
Filesystem: read-only except /workspace
Capabilities: all dropped
Devices: none mounted
CPU: 0.5 core limit per container
Memory: 1GB hard limit
Swap: 512MB
Disk quota: 3GB
Process limit: 100
Timeout: 2 hours hard kill
```

**Network Policy**:
```
Default: No network access
If enabled: Allowlist only
  - registry.npmjs.org
  - pypi.org
  - cdn.jsdelivr.net
  - api.github.com (for package metadata only)

Blocked:
  - All other domains
  - No SMTP (prevent spam)
  - No SSH/FTP (prevent lateral movement)
```

**File System Restrictions**:
```
/workspace: Read-write (user code)
/tmp: Read-write, cleared on exit
/: Read-only
/proc, /sys: Restricted access
No device mounting
No privilege escalation
```

### Authentication & Authorization

**Auth Stack**:
- JWT tokens (short-lived: 15 min access, 7 day refresh)
- HttpOnly cookies for web
- API keys for programmatic access
- bcrypt for password hashing (cost factor: 12)

**Role-Based Access Control**:
```
admin: Full access, user management, billing view
user: Own sessions, projects, usage data
beta: Limited features, rate limits
```

**Rate Limiting** (Redis-based):
```
Anonymous: 10 requests/hour
Free tier: 100 requests/hour, 5 sessions/day
Pro tier: 1000 requests/hour, 50 sessions/day
Enterprise: Custom limits
```

### API Security

**Request Validation**:
- All inputs sanitized
- File path traversal prevention
- Command injection prevention
- XSS protection on all outputs
- CSRF tokens for state-changing operations

**DDoS Protection**:
- Cloudflare proxy (free tier)
- Rate limiting per IP
- Progressive delays for repeat offenders
- Automatic IP banning for abuse

---

## Phase 1: Foundation + MVP (Weeks 1-4)

### Goal
Working sandbox system with core features, tested on QNAP TS-253D

### Week 1: Infrastructure Setup

**Tasks**:
1. Set up development environment on QNAP
   - Install Docker + Docker Compose
   - Install gVisor (runsc)
   - Configure Docker to use runsc runtime
   - Test gVisor with hello-world container

2. Database setup
   - PostgreSQL 15 container
   - Create all tables from schema (even unused ones)
   - Add all indexes
   - Seed test data

3. Redis setup
   - Redis 7 container
   - Configure persistence
   - Test connection pooling

4. Project structure
   - Monorepo with services/
   - NestJS backend skeleton
   - Next.js frontend skeleton
   - Shared types package
   - Docker Compose for all services

**Deliverables**:
- ✅ QNAP running Docker with gVisor
- ✅ PostgreSQL + Redis operational
- ✅ Project repository initialized
- ✅ Dev environment documented

### Week 2: Container Manager Service

**Tasks**:
1. Container lifecycle management
   - Create sandbox with gVisor runtime
   - Execute commands in container
   - Stream stdout/stderr via WebSocket
   - Resource monitoring (CPU, memory, disk)
   - Auto-cleanup on timeout

2. Git integration
   - Auto-initialize git on container creation
   - Auto-commit after Claude actions
   - Store commit hashes in database
   - Basic revert to commit hash

3. File operations
   - Read file (with path traversal prevention)
   - Write file (with size limits)
   - List directory (with pagination)
   - Delete file
   - File search (grep-like)

4. Security enforcement
   - Network isolation
   - Resource limits
   - Command sanitization
   - Timeout enforcement

**Deliverables**:
- ✅ Container Manager Service operational
- ✅ API: POST /sessions (create)
- ✅ API: POST /sessions/:id/execute (run command)
- ✅ API: GET/POST /sessions/:id/files/* (file ops)
- ✅ API: DELETE /sessions/:id (cleanup)
- ✅ Git auto-commits working

### Week 3: AI Service + Conversation Tracking

**Tasks**:
1. Claude API integration
   - Anthropic SDK setup
   - Message streaming
   - Tool execution mapping
   - Context window management

2. Token tracking (critical!)
   - Log every API call to database
   - Calculate costs in real-time
   - Track per session, per user, per month
   - Alert on quota approaching

3. Conversation management
   - Store full message history in database
   - Link messages to checkpoints
   - Message numbering for timeline
   - Conversation replay capability

4. Tool execution
   - Map Claude tools to Container Manager APIs
   - Read/Write/Edit file tools
   - Bash command tool
   - Grep/Glob search tools

**Deliverables**:
- ✅ AI Service operational
- ✅ API: POST /conversations/message
- ✅ Token usage tracked 100% accurately
- ✅ Conversation history stored
- ✅ Claude can create/edit files, run commands

### Week 4: Frontend + Basic Timeline

**Tasks**:
1. Main UI components
   - Chat interface (left panel, 40% width)
   - Monaco code editor (center, 40% width)
   - App preview iframe (right, 20% width)
   - Responsive layout

2. WebSocket integration
   - Real-time message streaming
   - File change notifications
   - Terminal output streaming
   - Connection recovery

3. Simple timeline UI
   - List of checkpoints with timestamps
   - Basic "Revert to this point" button
   - Show files changed count
   - Highlight current position

4. Token usage display
   - Current session tokens + cost
   - Monthly total tokens + cost
   - Progress bar toward quota
   - Warning when approaching limit

**Deliverables**:
- ✅ Working web interface
- ✅ Chat with Claude functional
- ✅ Code editor synced with container
- ✅ Preview showing port 3000
- ✅ Basic revert working
- ✅ Token counter visible

### Phase 1 End State

**What Works**:
- User can chat with Claude
- Claude can create/edit files and run commands
- User sees changes in real-time
- Preview updates automatically
- Full conversation history stored
- Basic undo (revert to checkpoint)
- Token usage tracked
- Runs on QNAP TS-253D

**What's Missing**:
- No multi-user (single test user)
- No advanced timeline UI
- No diff viewer
- No billing
- No user management

**Capacity**: 1 user testing

---

## Phase 2: Multi-User + Enhanced History (Weeks 5-6)

### Goal
Support 5-10 users with full version control features

### Week 5: Multi-User Support

**Tasks**:
1. Authentication system
   - User registration/login
   - JWT token management
   - Password reset flow
   - Session management

2. User management
   - Admin dashboard
   - User invitation system
   - Role assignment
   - Usage quotas per user

3. Queue system
   - Max 8 concurrent sandboxes on QNAP
   - Queue users when at capacity
   - Show queue position
   - Auto-start when slot available

4. Resource tracking
   - CPU/memory usage per user
   - Disk space per user
   - Enforce per-user quotas
   - Auto-cleanup old sessions

**Deliverables**:
- ✅ User authentication working
- ✅ Multiple users can use system
- ✅ Queue prevents overload
- ✅ Per-user usage tracking
- ✅ Admin can see all users

### Week 6: Enhanced Timeline & Diff Viewer

**Tasks**:
1. Advanced timeline UI
   - Visual timeline with branching
   - Manual checkpoint creation ("Save Point")
   - Star important checkpoints
   - Search checkpoints by description
   - Filter by date/type

2. Diff viewer
   - Side-by-side file comparison
   - Syntax-highlighted diffs
   - Compare any two checkpoints
   - Show summary (files added/changed/deleted)

3. Git log viewer
   - Full commit history
   - Click to view code at that point
   - Visualize changes over time
   - Export history as markdown

4. Advanced revert
   - Preview before reverting
   - Revert specific files (not whole workspace)
   - Create branch from checkpoint (optional)

5. Project import/upload (NEW)
   - Upload ZIP/TAR.GZ files
   - File size validation (max 100 MB)
   - Malware scanning (ClamAV integration)
   - Extract and create new project
   - Preserve git history if included
   - Drag & drop interface

**Deliverables**:
- ✅ Beautiful timeline UI
- ✅ Manual checkpoints working
- ✅ Diff viewer functional
- ✅ Git log browseable
- ✅ Advanced revert options
- ✅ Project import/upload working

### Week 6.5: Usage Dashboard

**Tasks**:
1. User dashboard
   - Token usage chart (last 30 days)
   - Most expensive sessions
   - Storage used
   - Sessions history
   - Download usage reports (CSV)

2. Admin dashboard
   - All users overview
   - Total system costs
   - Per-user breakdown
   - Resource utilization graphs
   - Set/modify user quotas

**Deliverables**:
- ✅ User can see their usage
- ✅ Admin can monitor all users
- ✅ Usage reports exportable

### Phase 2 End State

**What Works**:
- 5-10 users can use system simultaneously
- Full version control with timeline
- Diff viewer and git history
- Manual checkpoints
- Project import/upload (ZIP/TAR.GZ)
- Usage tracking and quotas
- Admin management

**What's Missing**:
- No payment system
- No public access (invite-only)
- No API access
- No project sharing
- No git remote integration (push/pull)

**Capacity**: 5-8 concurrent users on QNAP

---

## Phase 3: Commercial Features (Weeks 7-10)

### Goal
Ready to charge customers, accept payments, provide API access

### Week 7: Pricing Plans & Quotas

**Tasks**:
1. Define pricing tiers
   - Free: 100K tokens/month, 1 session, 20 checkpoints
   - Pro ($29/mo): 1M tokens/month, 3 sessions, 100 checkpoints
   - Enterprise ($299/mo): 20M tokens/month, 10 sessions, unlimited checkpoints

2. Quota enforcement
   - Block actions when quota exceeded
   - Soft limit warnings (90% used)
   - Grace period for payment failures
   - Automatic downgrade logic

3. Overage handling
   - Track usage beyond quota
   - Calculate overage charges
   - Show estimate before charging

**Deliverables**:
- ✅ Pricing plans configured
- ✅ Quotas enforced
- ✅ Overage tracking working

### Week 8: Stripe Integration

**Tasks**:
1. Stripe setup
   - Create Stripe account
   - Configure products and prices
   - Set up webhooks
   - Test mode integration first

2. Subscription management
   - User can select plan
   - Stripe checkout flow
   - Subscription status synced
   - Handle payment failures

3. Invoice generation
   - Monthly invoices with usage breakdown
   - Show token usage per session
   - PDF invoice generation
   - Email invoices automatically

4. Payment methods
   - Add/remove credit cards
   - Update billing info
   - View payment history

**Deliverables**:
- ✅ Stripe integration complete
- ✅ Users can subscribe
- ✅ Payments processed
- ✅ Invoices generated

### Week 9: Project Persistence & Sharing

**Tasks**:
1. Save projects
   - Save current workspace as project
   - Include full git history
   - Store on QNAP storage initially
   - Name and describe projects

2. Load projects
   - Create new session from project
   - Restore from specific checkpoint
   - Clone project to new workspace

3. Share projects
   - Generate shareable link
   - Read-only view of checkpoint
   - Embed code snippets
   - Fork project (copy to own account)

4. Project management
   - List all projects
   - Search/filter projects
   - Delete projects
   - Export project as ZIP

5. Git remote integration (Pro feature)
   - Import from Git URL (GitHub/GitLab/Bitbucket)
   - Clone private repos with auth tokens
   - Push/pull from sandbox
   - Sync with remote repository
   - Branch management

6. Mac build agent setup (Optional - iOS support)
   - Mac agent registration system
   - API key generation for Mac
   - Heartbeat monitoring
   - Basic iOS build request routing
   - Install guide for Mac setup

7. Multi-AI collaboration (Basic features)
   - ChatGPT API integration
   - AI selector UI (choose Claude, ChatGPT, or both)
   - Sequential mode (user coordinates between AIs)
   - Parallel mode (AIs work independently)
   - Token tracking per AI provider
   - Cost breakdown per AI
   - Database: ai_conversations table
   - Database: extend token_usage with ai_provider column

**Deliverables**:
- ✅ Projects can be saved
- ✅ Projects can be loaded
- ✅ Shareable links work
- ✅ Fork functionality
- ✅ Git remote import/sync working
- ✅ Mac build agent integration (if iOS support desired)
- ✅ ChatGPT integration working
- ✅ Users can select which AI to use
- ✅ Basic multi-AI collaboration (sequential/parallel modes)

### Week 10: API Access & Documentation

**Tasks**:
1. API key management
   - Generate API keys
   - Revoke keys
   - Set rate limits per key
   - Track usage per key

2. Public API endpoints
   - POST /api/v1/sessions (create sandbox)
   - POST /api/v1/sessions/:id/messages (chat)
   - GET /api/v1/sessions/:id/files (list files)
   - GET /api/v1/usage (usage stats)

3. API documentation
   - OpenAPI spec
   - Interactive docs (Swagger)
   - Code examples (curl, JavaScript, Python)
   - Authentication guide

4. Webhooks (optional)
   - Notify on session complete
   - Notify on quota reached
   - Notify on errors

**Deliverables**:
- ✅ API keys working
- ✅ REST API documented
- ✅ Developers can integrate
- ✅ Rate limiting enforced

### Phase 3 End State

**What Works**:
- Full payment system
- Users can subscribe and pay
- Project saving and sharing
- Project import/upload (ZIP + Git remote)
- API access for developers
- Comprehensive documentation

**Ready for**: Public launch

**Still on QNAP**: Yes (5-8 users max)

---

## Phase 4: Scale & Advanced Features (Weeks 11-14)

### Goal
Prepare for growth, add advanced features, plan cloud migration

### Week 11: Cloud Migration Preparation

**Tasks**:
1. Infrastructure as Code
   - Terraform/Pulumi scripts
   - Kubernetes manifests
   - Helm charts
   - CI/CD pipeline

2. Database migration plan
   - Export script from QNAP
   - Import script to cloud
   - Zero-downtime migration strategy
   - Backup and rollback plan

3. Choose cloud provider
   - Compare AWS, GCP, DigitalOcean, Hetzner
   - Cost projections for 50/100/500 users
   - Set up cloud account
   - Test deployment on staging

4. Monitoring setup
   - Prometheus + Grafana
   - Application metrics
   - Cost tracking
   - Alert rules

**Deliverables**:
- ✅ Cloud infrastructure ready
- ✅ Migration plan documented
- ✅ Can deploy to cloud in <2 hours
- ✅ Monitoring configured

### Week 12: Performance Optimization

**Tasks**:
1. Container warm pool
   - Pre-create 3 containers
   - Instant session start
   - Automatic pool refilling

2. Database optimization
   - Query performance analysis
   - Add missing indexes
   - Connection pooling tuned
   - Read replicas (if needed)

3. Git optimization
   - Squash old commits automatically
   - Keep only recent 100 auto-commits
   - Preserve manual checkpoints
   - Efficient diff generation

4. Frontend optimization
   - Code splitting
   - Lazy loading
   - CDN for static assets
   - Service worker caching

**Deliverables**:
- ✅ Faster session creation
- ✅ Optimized database queries
- ✅ Reduced git repo size
- ✅ Faster page loads

### Week 13: Advanced Features

**Tasks**:
1. Time-travel debugging
   - Slider to preview code at any message
   - Live preview at selected point
   - Step through conversation
   - Animated code changes

2. Conversation branching
   - Create branch from checkpoint
   - Try different approaches
   - Switch between branches
   - Merge branches (optional)

3. Export features
   - Export conversation as tutorial
   - Generate step-by-step guide
   - Export as blog post format
   - Export as video script

4. Collaboration (basic)
   - Share session link (read-only)
   - Invite collaborator (full access)
   - See who's viewing
   - Comment on checkpoints

5. iOS simulator streaming (if Mac connected)
   - Stream iOS Simulator to browser
   - Real-time interaction with iOS preview
   - Screenshot vs VNC streaming options
   - Build status and error display

6. Mobile companion apps (React Native)
   - Android + iOS companion app
   - Session sync via WebSocket
   - Mobile-optimized code viewer
   - Chat with Claude from phone
   - Quick edits on mobile
   - Push notifications for build complete

7. Multi-AI discussion mode (Advanced)
   - AI-to-AI message passing orchestration
   - Discussion mode (ChatGPT + Claude discuss, then implement)
   - Guard rails implementation:
     * Round limits (3-25 based on tier)
     * Token budget per discussion
     * Cost alerts (50%, 80%, 100%)
     * User approval checkpoints
     * Infinite loop detection
     * Time limits
   - Discussion viewer UI
   - Real-time cost tracking during discussion
   - User moderation controls
   - Analytics: discussion effectiveness metrics
   - A/B testing: single AI vs multi-AI quality

**Deliverables**:
- ✅ Time-travel UI working
- ✅ Branching functional
- ✅ Export formats available
- ✅ Basic collaboration
- ✅ iOS simulator streaming (if Mac available)
- ✅ Mobile companion apps (Android + iOS)
- ✅ Multi-AI discussion mode fully functional
- ✅ All 6 guard rails enforced
- ✅ Discussion UI with cost transparency

### Week 14: Analytics & Launch Prep

**Tasks**:
1. Analytics dashboard
   - User retention metrics
   - Feature usage stats
   - Most common operations
   - Error rates
   - Cost per user

2. Admin tools
   - Ban abusive users
   - Refund handling
   - Manual quota adjustments
   - System health overview

3. Legal/compliance
   - Terms of Service
   - Privacy Policy
   - Cookie consent
   - GDPR compliance tools (data export/delete)

4. Marketing prep
   - Landing page
   - Pricing page
   - Documentation site
   - Demo videos
   - Blog post announcing launch

**Deliverables**:
- ✅ Analytics working
- ✅ Admin tools complete
- ✅ Legal docs ready
- ✅ Ready to launch publicly

### Phase 4 End State

**Ready for**:
- Public launch
- 100+ users (after cloud migration)
- Advanced use cases
- Developer ecosystem

---

## Deployment Strategy

### Environment 1: QNAP TS-253D (Development & Initial Users)

**Timeline**: Weeks 1-12 (possibly longer if growth is slow)

**Specs**:
- CPU: Intel Celeron J4125 (4 cores)
- RAM: 20GB
- Storage: NAS storage pool
- Network: Home/office internet + Cloudflare Tunnel

**Capacity**:
- Concurrent sandboxes: 8 max
- Daily active users: 10-15
- Best for: Development, beta testing, early customers

**Deployment**:
```
Docker Compose on QNAP
├── PostgreSQL container
├── Redis container
├── API Gateway container
├── Container Manager (host Docker socket)
├── AI Service container
├── Billing Service container
├── Queue Service container
└── Frontend (Nginx)

Optional: Mac Build Agent (for iOS support)
└── Connected via LAN (192.168.1.x)
    └── Xcode + iOS Simulator

Access: Cloudflare Tunnel → sandbox.yourdomain.com
Security: gVisor, network isolation, rate limiting
```

**Costs**:
- Hardware: $0 (owned)
- Electricity: ~$10/month (QNAP only)
- Electricity with Mac: ~$15/month (both running)
- Cloudflare: $0 (free tier)
- Claude API: ~$50-200/month (depends on usage)
- ChatGPT API: ~$0-100/month (if multi-AI enabled, depends on usage)
- **Total: $60-210/month (single AI, QNAP only)**
- **Total with Multi-AI: $60-310/month (Claude + ChatGPT, QNAP only)**
- **Total with iOS: $65-215/month (single AI, QNAP + Mac)**
- **Total with iOS + Multi-AI: $65-315/month (Claude + ChatGPT + iOS, QNAP + Mac)**

**Alternative iOS Options** (if no Mac):
- Cloud Mac (AWS EC2): +$650/month
- Expo EAS Build: +$29-99/month
- Codemagic: +$75-250/month

**When to migrate**:
- Sustained 8+ concurrent users
- Performance complaints
- Need 99.9% uptime SLA
- Monthly revenue > $500

---

### Environment 2: Cloud VPS (Growth Phase)

**Timeline**: Week 13+ (when QNAP capacity exceeded)

**Option A: DigitalOcean (Easiest)**
```
Droplet: 16GB RAM, 4 vCPU, 320GB SSD
Cost: $96/month
Capacity: 15-20 concurrent sandboxes

Add-ons:
- Managed PostgreSQL: $60/month
- Managed Redis: $15/month
- Spaces (S3-like): $5/month
Total: ~$175/month
```

**Option B: Hetzner (Cheapest)**
```
Dedicated: 64GB RAM, 6 cores, 512GB SSD
Cost: $50/month
Capacity: 50+ concurrent sandboxes

Self-managed:
- PostgreSQL on same server
- Redis on same server
Total: $50/month
```

**Option C: AWS/GCP (Enterprise)**
```
Kubernetes cluster
- 3 nodes (8GB each)
- Managed DB (RDS/Cloud SQL)
- Load balancer
- Auto-scaling
Cost: $300-500/month
Capacity: 100+ users, highly available
```

**Migration Process** (2-4 hours downtime):
1. Set maintenance mode on QNAP
2. Export PostgreSQL database (pg_dump)
3. Upload to cloud VPS
4. Deploy containers via Docker Compose/K8s
5. Import database
6. Test all features
7. Update DNS to point to cloud IP
8. Monitor for issues
9. Keep QNAP as backup for 1 week

---

### Environment 3: Kubernetes (Scale Phase)

**Timeline**: Month 6+ (if reaching 100+ concurrent users)

**Architecture**:
```
Load Balancer (Cloudflare/Nginx Ingress)
↓
API Gateway Pods (3 replicas, auto-scale)
↓
├── Container Manager Pods (5 replicas)
├── AI Service Pods (3 replicas)
├── Billing Service Pods (2 replicas)
└── Queue Service Pods (2 replicas)
↓
├── PostgreSQL (managed, read replicas)
├── Redis Cluster (3 nodes)
└── S3-compatible storage (projects)
```

**Cost at Scale** (500 concurrent users):
- Compute: $1000/month
- Database: $300/month
- Storage: $100/month
- Claude API: $5000-10000/month (depends on usage)
- ChatGPT API: $1000-3000/month (if 20-30% use multi-AI)
- Monitoring: $100/month
- **Total (Single AI): $6500-11500/month**
- **Total (With Multi-AI): $7500-14500/month**

**Revenue** (500 users, 50% paid):
- 250 free users: $0
- 200 Pro users × $29: $5800
- 50 Enterprise × $299: $14,950
- **Total: $20,750/month**

**Margin**:
- Single AI: $9,250-14,250/month (45-70%)
- With Multi-AI: $6,250-13,250/month (30-64%)

---

## Monitoring & Operations

### Health Checks

**Application**:
- API response time < 200ms (p95)
- Container creation time < 5s
- WebSocket connection success rate > 99%
- Error rate < 0.1%

**Infrastructure**:
- CPU usage < 70% sustained
- Memory usage < 80%
- Disk usage < 85%
- Network latency < 100ms

**Business**:
- Claude API success rate > 99.5%
- Payment success rate > 95%
- User session success rate > 98%

### Alerts

**Critical** (page on-call):
- API down > 2 minutes
- Database unreachable
- All containers failing to start
- Payment processing broken
- Security breach detected

**Warning** (email/Slack):
- CPU > 80% for 10 minutes
- Memory > 85% for 10 minutes
- Error rate > 1% for 5 minutes
- Queue length > 10 users
- Claude API rate limit approaching

**Info**:
- New user signup
- Subscription upgraded/downgraded
- Large token usage (> 1M tokens in session)

### Backup Strategy

**Database**:
- Continuous: Write-ahead log (WAL) streaming
- Hourly: Incremental backups
- Daily: Full backup (retained 30 days)
- Weekly: Full backup (retained 1 year)

**Projects/Files**:
- Hourly: Changed files only
- Daily: Full snapshot
- Stored on: S3 with versioning

**Disaster Recovery**:
- RTO (Recovery Time Objective): 1 hour
- RPO (Recovery Point Objective): 15 minutes
- Test recovery: Monthly

---

## Security Hardening Checklist

### Infrastructure
- ✅ gVisor for container isolation
- ✅ Network policies (deny by default)
- ✅ Firewall rules (only 443, 22 open)
- ✅ SSH key-only authentication
- ✅ Automatic security updates
- ✅ Intrusion detection (fail2ban)
- ✅ DDoS protection (Cloudflare)

### Application
- ✅ All inputs sanitized
- ✅ SQL injection prevention (parameterized queries)
- ✅ XSS prevention (output encoding)
- ✅ CSRF tokens
- ✅ Rate limiting (per IP, per user, per API key)
- ✅ JWT tokens (short-lived)
- ✅ API key hashing (bcrypt)
- ✅ HTTPS everywhere (TLS 1.3)
- ✅ Security headers (CSP, HSTS, etc.)

### Data
- ✅ Database encryption at rest
- ✅ Backups encrypted
- ✅ PII data encrypted (user emails, etc.)
- ✅ Password hashing (bcrypt, cost 12)
- ✅ Secure secret management (env vars, not code)
- ✅ API keys never logged

### Compliance
- ✅ GDPR: Data export/delete on request
- ✅ Privacy policy
- ✅ Terms of service
- ✅ Cookie consent
- ✅ Audit logging
- ✅ Incident response plan

### Regular Tasks
- Weekly: Review audit logs
- Weekly: Check for CVEs in dependencies
- Monthly: Penetration testing (automated)
- Quarterly: Manual security audit
- Yearly: Third-party security assessment

---

## Cost Management

### Token Cost Optimization

**Strategies**:
1. Context pruning: Remove old messages when context too large
2. Smart caching: Cache common responses
3. Prompt engineering: Minimize token usage in system prompts
4. Model selection: Use Claude Haiku for simple tasks
5. Streaming: Show progress, allow user to stop

**Monitoring**:
- Alert if per-user cost > $50/day
- Alert if Claude API cost > 70% of revenue
- Daily report: Top 10 most expensive users/sessions

### Infrastructure Cost Optimization

**QNAP Phase**:
- Free compute (owned hardware)
- Only pay for Claude API
- Maximize utilization before migrating

**Cloud Phase**:
- Reserved instances (30% cheaper)
- Spot instances for non-critical workloads
- Auto-scaling (scale down at night)
- Right-size instances based on metrics
- Use managed services (avoid ops overhead)

**Storage**:
- Automatic cleanup of old sessions (7 days free tier, 90 days paid)
- Compress old projects
- Archive cold data to glacier storage

### Revenue Protection

**Prevent abuse**:
- Require credit card even for free tier (no anonymous abuse)
- Rate limit free tier aggressively
- Detect and ban token farming
- Monitor for API key sharing

**Optimize pricing**:
- A/B test pricing tiers
- Analyze willingness to pay
- Introduce annual plans (2 months free)
- Volume discounts for enterprises

---

## Risk Management

### Technical Risks

**Risk**: Container escape / security breach
- **Mitigation**: gVisor, network isolation, regular updates
- **Impact**: High (data breach, legal liability)
- **Likelihood**: Low (with gVisor)

**Risk**: Claude API outage
- **Mitigation**: Graceful degradation, error messages, retry logic
- **Impact**: High (service unusable)
- **Likelihood**: Low (Anthropic 99.9% uptime)

**Risk**: Database corruption
- **Mitigation**: Continuous backups, replicas, PITR
- **Impact**: High (data loss)
- **Likelihood**: Very low

**Risk**: QNAP hardware failure
- **Mitigation**: Backups to cloud, can migrate in 2-4 hours
- **Impact**: Medium (temporary downtime)
- **Likelihood**: Low

### Business Risks

**Risk**: Low user adoption
- **Mitigation**: Start on QNAP (low fixed costs), pivot based on feedback
- **Impact**: Medium (time wasted)
- **Likelihood**: Medium

**Risk**: Claude API costs exceed revenue
- **Mitigation**: Smart caching, quotas, markup pricing
- **Impact**: High (business unsustainable)
- **Likelihood**: Low (if priced correctly)

**Risk**: Competitors (Replit, StackBlitz)
- **Mitigation**: Differentiate with features (full revert, Claude integration, pricing)
- **Impact**: Medium
- **Likelihood**: High (already exists)

**Risk**: Claude API ToS violation
- **Mitigation**: Review ToS, ensure compliance, get approval if needed
- **Impact**: High (account banned)
- **Likelihood**: Low

### Legal Risks

**Risk**: User runs illegal code (piracy, hacking, spam)
- **Mitigation**: ToS prohibits it, audit logs, ban offenders
- **Impact**: Medium (legal issues, hosting ban)
- **Likelihood**: Medium

**Risk**: GDPR non-compliance
- **Mitigation**: Implement data export/delete, privacy policy
- **Impact**: High (fines)
- **Likelihood**: Low (if built in from start)

---

## Success Metrics

### Phase 1 (MVP)
- ✅ You can build a todo app using the system
- ✅ 2-3 colleagues successfully use it
- ✅ No major bugs in 1 week of testing
- ✅ Average session: 10+ messages

### Phase 2 (Beta)
- ✅ 10 beta users onboarded
- ✅ 5+ active daily users
- ✅ 80%+ user satisfaction (survey)
- ✅ Average session: 30+ minutes
- ✅ Users creating real projects

### Phase 3 (Commercial)
- ✅ 50 signups in first month
- ✅ 20%+ conversion to paid
- ✅ $500+ MRR (monthly recurring revenue)
- ✅ <5% churn rate
- ✅ Net Promoter Score > 40

### Phase 4 (Growth)
- ✅ 500+ users
- ✅ $10K+ MRR
- ✅ 30%+ paid conversion
- ✅ <3% churn rate
- ✅ Profitable (revenue > costs)

---

## Timeline Summary

| Phase | Weeks | Environment | Users | Features | Costs/Month |
|-------|-------|-------------|-------|----------|-------------|
| **Phase 1: MVP** | 1-4 | QNAP Dev | 1-3 | Core sandbox, chat, basic revert | $60-210 |
| **Phase 2: Multi-User** | 5-6 | QNAP Prod | 5-10 | Timeline, diff, quotas | $100-500 |
| **Phase 3: Commercial** | 7-10 | QNAP Prod | 10-30 | Billing, projects, API | $200-1000 |
| **Phase 4: Scale** | 11-14 | Cloud Ready | 30-100 | Advanced features, monitoring | $500-2000 |
| **Future: Growth** | 15+ | Cloud/K8s | 100-1000+ | Collaboration, integrations | $2000-15000 |

**Total to launch**: 14 weeks (3.5 months)

---

## Next Steps

### Immediate (Before Starting)
1. ✅ Register Claude API account (allow 1-2 days for approval)
2. ✅ Register domain name
3. ✅ Set up Cloudflare account
4. ✅ Create GitHub repository
5. ✅ Install Docker + gVisor on QNAP
6. ✅ Test gVisor with sample container

### Week 1 Kickoff
1. ✅ Set up development environment
2. ✅ Initialize project structure
3. ✅ Deploy PostgreSQL + Redis
4. ✅ Create database schema
5. ✅ Build hello-world API endpoint

### Decision Points

**After Week 4**:
- Does the core product work?
- Do you/colleagues want to use it?
- Go/no-go decision

**After Week 10**:
- Is there paying customer demand?
- Is unit economics positive?
- Migrate to cloud or stay on QNAP?

**After Week 14**:
- Launch publicly or stay invite-only?
- What features to prioritize next?

---

## Summary

This plan provides:
- ✅ **Solid architecture** that scales from 1 to 1000+ users
- ✅ **Security by default** (gVisor, network isolation, quotas)
- ✅ **Low initial cost** (develop on owned QNAP hardware)
- ✅ **Easy migration** to cloud when needed
- ✅ **Full version control** (git-based time-travel)
- ✅ **Commercial-ready** (billing, API, analytics)
- ✅ **Pragmatic approach** (MVP first, iterate based on feedback)

**Key insight**: Build the right *architecture* from day 1, but keep *features* simple initially. This lets you move fast while maintaining ability to scale.

**Estimated total investment**:
- Time: 14 weeks (full-time) or 6 months (part-time)
- Money: $1000-3000 for development phase
- Money: $200-2000/month operational (scales with revenue)

---

## Document Information

**Version**: 1.5
**Date**: December 2024
**Author**: AI Sandbox Platform Planning Team
**Status**: Final

**Changelog**:
- v1.5 (Dec 2024): Added comprehensive Conversational Orchestration Layer (optional/future enhancement) with natural-language understanding, intent extraction (9 intent types), Cantonese language support, confirmation rules for safety, human-readable summaries, orchestrator_conversations database table, extended users/sessions tables with orchestrator preferences, cost analysis showing 10-30% overhead, implementation phasing (Lite in Phase 3, Full in Phase 4+), expert mode bypass option, UI/UX mockups for settings and dialogs, voice-ready design note, and complete implementation checklists - fully architected to prevent future refactoring while remaining optional
- v1.4 (Dec 2024): Added comprehensive Multi-AI Collaboration & Discussion section with ChatGPT integration, collaborative discussion modes, 6 guard rail mechanisms (round limits, token budgets, cost alerts, user moderation, infinite loop detection, time limits), ai_conversations database table, extended token_usage table with ai_provider tracking, implementation code examples, UI/UX designs, cost analysis for multi-AI operations, security considerations, and updated Phase 3/Phase 4 timelines
- v1.3 (Dec 2024): Added comprehensive Mobile App Development Support section with Mac + QNAP hybrid architecture for iOS builds, Android SDK integration, ios_builds database table, mac_agents table, iOS simulator streaming, mobile companion apps (React Native), cross-platform development strategies, and updated cost analysis
- v1.2 (Dec 2024): Added project import/upload feature with ZIP/TAR.GZ support and Git remote integration, updated database schema with uploads table, added malware scanning and security considerations for file uploads
- v1.1 (Dec 2024): Added comprehensive URL structure & session management section, download options, git integration details, and updated database schema with project slugs and download tracking
- v1.0 (Dec 2024): Initial complete plan with security hardening, QNAP deployment strategy, and scalability considerations

---

**Ready to start building!**
