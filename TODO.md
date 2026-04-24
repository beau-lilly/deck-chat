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

### 4.B.2 — Search bar + filter dropdown (DONE)
- [x] Replaced All/Folders/Files pills with a search input + sliders icon dropdown
- [x] Search filters folders and documents by name; ancestors force-expand so matches stay reachable
- [x] Filter dropdown (All / Folders only / Files only) with indicator dot when narrowed
- [x] Escape or clear button resets the search; clicking outside closes the filter menu

### 4.B.3 — Cleaner sidebar chrome (DONE)
- [x] Dropped the "Files" header; search bar is the topmost element
- [x] Root folder is always expanded — no chevron to collapse it
- [x] Per-folder hover actions for new-folder and upload, scoped to the row

### 4.B.4 — Context menus for folders and PDFs (DONE)
- [x] Right-click folder → New folder / Upload / Rename / Delete (root omits Rename+Delete)
- [x] Right-click PDF → Rename / Delete; clears viewer state if the deleted doc is open
- [x] Cross-browser right-click: native capture-phase listeners + document-level preventDefault on mousedown(button=2) and contextmenu
- [x] Hover-visible ⋮ kebab button as a guaranteed fallback when extensions (StopTheMadness, etc.) hijack right-click

### 4.B.5 — Inline rename + new-folder flow (DONE)
- [x] Rename uses an in-row editor (auto-focus, pre-selected text, Enter/blur to commit, Escape to cancel)
- [x] New folder creates "untitled folder" (auto-numbered on collision) and opens the editor on the new row
- [x] PDF rename pre-selects the basename so the `.pdf` extension stays intact

### 4.B.6 — Drag-and-drop moves (DONE)
- [x] Drag folders and PDFs onto folders to move them; target highlights on hover
- [x] Root is a drop target but not a drag source; cycles (folder → its own descendant) are rejected at UI and repo layers
- [x] Counter-based dragenter/dragleave tracking for Safari-safe hover highlighting

### 4.B.7 — Resizable sidebars (DONE)
- [x] Drag the inner edge of the left sidebar or right chat panel to resize
- [x] Widths clamped (sidebar 180–640 px, chat panel 260–800 px) and persisted in localStorage

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

## Phase 7: PDF viewer canvas
### 7.A — Transform-based pan + zoom (DONE)
- [x] Replaced native scroll container with fixed viewport + CSS-transform canvas (Figma/Miro/claude.ai/design pattern)
- [x] Free-form two-axis trackpad panning with soft axis-lock (smoothstep deadzone) — tunable from fully-free to pure orthogonal
- [x] Smooth pinch/Cmd+wheel zoom via CSS-transform preview during gesture, committed to react-pdf canvas on debounce / Safari gestureend
- [x] Cursor-anchored zoom; zoom buttons + MIN/MAX/STEP constants; click-to-reset-to-100% on the percentage readout
- [x] Fixed text highlighting (removed inherited `user-select: none` that was killing pdf.js text layer)

### 7.B — Show active chat's anchor on the PDF (DONE)
- [x] Pulsing overlay on the anchor page (indigo ring for regions, amber highlighter for text); PdfViewer auto-pans so the anchor lands in the viewport center

### 7.C — Type immediately into selection popup (DONE)
- [x] Popup keeps the page text selection alive for `⌘C` copy AND accepts typing — document-level keydown routes characters into the prompt until a printable key promotes the input to real focus (see `docs/text-selection-popup-focus.md`)

### 7.D — Animated pan + fit-width zoom on chat open (DONE)
- [x] Clicking a chat glides the canvas (300 ms ease-out cubic) to a fit-width view — page centered between the sidebars, anchor vertically centered, canvas re-renders crisp at the target scale on animation end

### 7.E — Center + scroll-to-top toolbar button (DONE)
- [x] LocateFixed icon in the toolbar zoom cluster; bumps a monotonic `centerTrigger` counter in documentStore which the PdfViewer subscribes to and runs its centering helper on

### 7.F — FIT/PAN mode split + auto-recenter everywhere (DONE)
- [x] FIT mode (page fits): horizontal locked, snap-to-center; PAN mode (zoomed in): 0.2/0.4 smoothstep axis-lock, strict edge bounds so the page never pans off-viewport; zoomBy clamps every step. Auto-recenter on pdfUrl change, scale change, and viewport resize. Manual center button removed (now redundant). Tightened EmptyState centering + sidebar max to 300 px.

## Phase 8: Multi-provider API support
### 8.A — Anthropic + OpenAI + Gemini provider adapters (DONE)
- [x] Provider adapter layer (`src/services/providers/`) with extracted Anthropic, new OpenAI Chat Completions, and new Gemini streamGenerateContent; `llm.ts` routes by selected model. Settings store has one key per provider + provider-tagged model registry; settings UI shows three key inputs and a model picker grouped by provider (disables models whose provider lacks a key). All upload gates + ChatThread use `hasKeyForSelectedModel`. Images now sent every turn so Gemini doesn't drop multimodal context. Refreshed models to current releases (Claude 4.7/4.6/4.5, GPT-5.4 + o-series, Gemini 3.x preview + 2.5 stable).
- [x] UX polish: upload button moved to a rounded pill at the bottom of the sidebar; PanelLeft + FileText icons thinned to strokeWidth=1.5.

## Phase 9: Notes
### 9.A — Notes feature + live-preview markdown editor (DONE)
- [x] New `Note` type + Dexie `notes` table (DB_VERSION bumped to 2), repo methods for list/create/update/rename/delete, `useNotesForDocument` liveQuery hook, `noteStore` with activeNote + createAndOpenNote flow. Notes share the `ChatAnchor` shape so they pin to text/region selections on the PDF just like chats. Selection popup grows a "Note" button alongside "Ask".
- [x] Tiptap-based Obsidian/Notion-style live-preview markdown editor (StarterKit + Link + tiptap-markdown) in `NotePanel`; debounced 350ms persistence; autofocus on freshly-created notes. `.tiptap-editor` CSS matches the shared Markdown renderer so live preview and rendered output look identical.
- [x] Right panel renamed "Chats" → "Chats & Notes" with unified list, filter pills (All / Chats / Notes), sorted by anchor position. Left sidebar's per-PDF subtree also interleaves chats + notes. Selecting a chat while a note is open (or vice versa) closes the other source cleanly.
- [x] Chat assistant messages render through a shared `Markdown` component (react-markdown + remark-gfm); user messages stay plain text. Toolbar hide/show right-panel button becomes a minimal `PanelRight` icon mirroring the left `PanelLeft`.
- [x] `ChatAnchorIndicator` generalized to render for the active note too — amber ring for region anchors, amber highlighter for text anchors. `PdfViewer` subscribes to `noteStore` and pans to the active note's anchor on change.

### 9.B — Preview/open + visual polish (DONE)
- [x] Preview-vs-open click cycle (`src/stores/previewStore.ts`): single click on a sidebar chat/note row previews (pans the PDF to the anchor + highlights the row with a thin ring); second click on the same row opens it; double-click opens directly for free because React fires `onClick` twice on a native dblclick and the preview store state is read synchronously. Shared between `ChatNode`, `NoteNode`, and the right panel's unified rows.
- [x] Fixed the cross-doc zoom race — clicking a chat on a PDF that wasn't currently loaded used to leave the viewer pinned to the top-left at 4× because `panToAnchor` read stale `offsetWidth` before pdf.js re-rendered. It now waits for `hasInitializedRef` + the target page's DOM width to match the render target before computing the fit-zoom.
- [x] `ChatAnchorIndicator` pulses on previewed anchors too (thinner ring, no glow) so "selected but not opened" reads distinctly from "opened".
- [x] Real type-scale on Markdown + Tiptap headings: h1 text-xl, h2 text-lg, h3 text-base, h4 text-sm uppercase tracked. Previously every level was essentially body-sized with bolding.
- [x] Both sidebars slide open/closed over 200 ms via width transition + overflow-hidden + fixed-width inner. Animation gated on open/close toggles only so resize-drag stays crisp and doesn't leak slate-950 through the outer's width lag.
- [x] OpenAI adapter skips `image_url` parts for text-only models (o3-mini and future o-mini variants). Model registry gains a `supportsVision` flag; picker tags non-vision models with "text only". Fixes "Invalid content type. image_url is only supported by certain models." 400s.
