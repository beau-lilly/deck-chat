# Deck Chat - Roadmap

## Phase 1: Anthropic API + Native PDF Context
- [x] Switch from OpenRouter to direct Anthropic Messages API
- [x] Send entire PDF as native document block for full deck context
- [x] Send region screenshot alongside PDF so LLM knows the specific area
- [x] Update settings UI for Anthropic API key
- [x] Anthropic models: Claude Opus 4, Claude Sonnet 4, Claude Haiku 4
- [x] `anthropic-dangerous-direct-browser-access` header for client-side CORS

## Phase 1.1: Cost Optimization — Context Modes + Text Extraction
- [x] Replace raw PDF document block (~$1/query) with client-side text extraction via pdf.js `getTextContent()`
- [x] Three context modes per chat: Selection (region only), Slide (page text + images), Full Doc (all page text)
- [x] Context mode selector UI in selection popup (3 pills)
- [x] Mode badge displayed in chat thread header
- [x] Prompt caching via `cache_control: { type: 'ephemeral' }` on system prompt
- [x] Cache usage indicator (hit/miss, token counts) in chat UI + console logging
- [x] Removed `pdfs-2024-09-25` beta header (no longer sending raw PDF blocks)
- [x] Cost reduction: ~$1/query → $0.02-0.23/query depending on mode

## Phase 1.2: Text Selection UX
- [x] Text selection auto-shows prompt popup directly (no intermediate "Ask about this" button)
- [x] Works on both Safari and Chrome
- [x] Clicking outside dismisses text selection popup
- [x] Single click dismisses region selection box
- [x] Small accidental drags (<8%) treated as dismiss clicks instead of creating micro-regions

## Phase 1.2.1: Chat UX Polish
- [x] Hide "Regarding the selected text:..." prefix from visible chat messages (context still sent to LLM via system prompt)

## Phase 1.3: API Key Gating + Error Handling
- [x] Settings modal auto-opens on first load if no API key configured
- [x] Upload buttons gated behind API key check (opens settings if missing)
- [x] Auth errors (401/invalid key) auto-open settings with clear error message
- [x] Fix Safari model select dropdown styling (appearance-none, custom chevron)

## Phase 1.5: Extended Thinking
- [ ] Add option to enable extended thinking for Claude models
- [ ] UI toggle for thinking mode (e.g. "Deep analysis" switch)
- [ ] Display thinking process in a collapsible section

## Phase 2: Multi-Provider API Keys
- [ ] Add OpenAI Responses API support (native PDF)
- [ ] Add Google Gemini API support (native PDF)
- [ ] Settings UI: optional API key per provider
- [ ] Model picker grouped by provider (only show models for configured keys)

## Phase 3: Backend + Free Trial + Subscriptions
- [ ] Backend proxy server (holds API keys server-side)
- [ ] User authentication
- [ ] Free trial tier (limited messages/month)
- [ ] Subscription tier (unlimited or higher limits)
- [ ] Usage tracking and metering

## Phase 4: Left Sidebar + Library Persistence
### 4.A — Data model + Dexie persistence (DONE)
- [x] Add `Folder` and `DocumentRecord` types; keep `Chat` shape for UI
- [x] Dexie schema v1: `folders`, `documents`, `blobs`, `chats`, `messages`
- [x] Repository layer (`src/data/repo.ts`) — single seam for future REST swap
- [x] Store PDF bytes as Blob so refresh fully rehydrates documents
- [x] Split `messages` into their own table for cheap streaming appends
- [x] `documentStore.openDocument(id)` rehydrates the active document from Dexie
- [x] `chatStore.loadChatsForDocument(id)` and all mutations persist via repo

### 4.B — Left sidebar UI (DONE)
- [x] Collapsible left sidebar with `/` root folder and tree view
- [x] Folder / File filter toggle (All / Folders / Files)
- [x] Click a PDF to open it; chats swap to that document
- [x] Upload via sidebar or toolbar — lands in the currently-selected folder
- [x] New-folder button in sidebar header
- [x] Upload-target footer so users see where the next PDF will go

### 4.B.1 — Chat list under each PDF (DONE)
- [x] Each PDF row in the sidebar has a chevron to expand its chats
- [x] Chats sort by anchor position: page ASC, then y ASC, then x ASC
- [x] Click a chat to open its document and activate it
- [x] `useChatsForDocument` liveQuery only mounts when a doc is expanded

### 4.C — Folder & file CRUD (TODO)
- [ ] Rename folder / rename document (context menu or inline)
- [ ] Move document to another folder (picker)
- [ ] Delete folder (cascading) with confirm dialog
- [ ] Delete document (cascading chats + blobs)
- [ ] Drag-and-drop: drop `.pdf` onto folder to upload there
- [ ] Drag-and-drop: drag doc node onto folder to move

### 4.D — Library settings (TODO)
- [ ] Export / import library (zip of PDFs + metadata JSON)
- [ ] Storage usage indicator (MB used by blobs)
- [ ] "Clear all" with double confirm

## Phase 5: Server-backed Library (future)
Swap `DexieRepo` for a `RestRepo` implementing the same `Repo` interface. No UI code should need to change.
- [ ] Node server (Express or Hono) exposing the `Repo` verbs over REST
- [ ] Persist PDFs to filesystem or S3; metadata in SQLite/Postgres
- [ ] `RestRepo` client; env flag selects `DexieRepo` vs `RestRepo`
- [ ] Auth (email/password or OAuth); user id scopes every query
- [ ] HTTP-only cookie sessions
- [ ] Optional offline cache: Dexie as a write-through layer over REST
- [ ] Shareable links per folder / per PDF
- [ ] Migrate `blobs` table to object storage before scale

## Phase 6: Library + Chat UX polish (nice-to-have)
- [ ] Search across all chats / documents
- [ ] Starred / recently-opened documents
- [ ] Per-document tags
