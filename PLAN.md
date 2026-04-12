# Deck Chat - Implementation Plan

## Tech Stack
- **Framework:** React 18 + TypeScript
- **Build tool:** Vite
- **PDF rendering:** react-pdf (wraps PDF.js)
- **Styling:** Tailwind CSS
- **State management:** Zustand (lightweight, perfect for this)
- **Storage:** IndexedDB via Dexie.js (with abstraction layer for future cloud migration)
- **LLM integration:** OpenRouter API (user provides API key)
- **Routing:** React Router (for future multi-document support)

## Architecture Overview

```
src/
├── components/
│   ├── pdf/
│   │   ├── PdfViewer.tsx          # Main PDF rendering + scroll container
│   │   ├── PdfPage.tsx            # Single page renderer
│   │   ├── SelectionOverlay.tsx   # Handles click & drag-box selection on pages
│   │   └── AnchorMarker.tsx       # Visual indicator on PDF where chats are anchored
│   ├── chat/
│   │   ├── ChatPanel.tsx          # Right-side collapsible panel
│   │   ├── ChatList.tsx           # List of all chats ordered by anchor position
│   │   ├── ChatListItem.tsx       # Summarized chat title (clickable)
│   │   ├── ChatThread.tsx         # Expanded chat conversation view
│   │   ├── ChatInput.tsx          # Message input with send button
│   │   └── ChatSearch.tsx         # Search/filter through past chats
│   ├── layout/
│   │   ├── AppLayout.tsx          # Main layout: PDF left, chat panel right
│   │   └── Toolbar.tsx            # Top bar: file upload, settings, etc.
│   └── settings/
│       └── ApiKeySettings.tsx     # OpenRouter API key configuration
├── stores/
│   ├── documentStore.ts           # Current PDF, pages, scroll position
│   ├── chatStore.ts               # All chats, active chat, messages
│   ├── selectionStore.ts          # Current selection state (point/box)
│   └── navigationStore.ts         # Jump history queue (undo/redo navigation)
├── services/
│   ├── llm.ts                     # OpenRouter API integration
│   ├── storage.ts                 # Dexie.js IndexedDB abstraction
│   └── pdfContext.ts              # Extracts page image + selection region for LLM
├── types/
│   └── index.ts                   # Shared TypeScript types
├── App.tsx
└── main.tsx
```

## Data Model

```typescript
interface Document {
  id: string;
  name: string;
  pdfData: ArrayBuffer;       // The raw PDF file
  pageCount: number;
  createdAt: Date;
}

interface ChatAnchor {
  pageNumber: number;          // Which page
  type: 'point' | 'region';   // Click vs drag-box
  // For point: x, y as percentage of page dimensions
  // For region: x, y, width, height as percentages
  x: number;
  y: number;
  width?: number;              // Only for region
  height?: number;             // Only for region
  description?: string;        // Optional user-provided text description
}

interface Chat {
  id: string;
  documentId: string;
  anchor: ChatAnchor;
  title: string;               // Auto-generated summary of first question
  messages: Message[];
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
}

// Navigation history for jump queue
interface NavigationEntry {
  pageNumber: number;
  scrollOffset: number;        // Pixel offset within page
}
```

## Build Phases

### Phase 1: Project Setup & PDF Viewer
1. Initialize Vite + React + TypeScript project
2. Install dependencies (react-pdf, tailwind, zustand, dexie)
3. Build `PdfViewer` and `PdfPage` components
4. Implement PDF upload and rendering
5. Basic scroll navigation between pages

### Phase 2: Selection System
1. Build `SelectionOverlay` component on top of each PDF page
2. Implement **click/point** selection (click anywhere → marker appears)
3. Implement **drag-box** selection (click + drag → rectangle region)
4. Optional text description input after selection
5. Visual feedback during selection (cursor changes, selection highlight)

### Phase 3: Chat Panel (Single Chat)
1. Build collapsible `ChatPanel` on right side
2. Build `ChatInput` for typing questions
3. Wire selection → new chat creation flow:
   - User selects region on PDF → chat panel opens → user types question
4. Display chat messages in `ChatThread`
5. Store chats in IndexedDB via Dexie

### Phase 4: LLM Integration
1. Build `ApiKeySettings` for OpenRouter key input (stored in localStorage)
2. Build `llm.ts` service: sends page screenshot + selection coords + question to OpenRouter
3. Build `pdfContext.ts`: renders the relevant page to a canvas, crops to selection region, converts to base64
4. Stream responses back to chat thread
5. Auto-generate chat title from first question (via LLM or simple truncation)

### Phase 5: Multi-Chat & Navigation
1. Build `ChatList` showing all chats ordered by anchor position in document
2. Build `AnchorMarker` indicators on PDF pages showing where chats exist
3. Click chat in list → PDF scrolls to anchor position
4. Click anchor marker on PDF → opens corresponding chat
5. Implement navigation history queue (jump stack with undo)
6. Double-click chat title → expand full chat thread

### Phase 6: Search & Archive
1. Build `ChatSearch` with text search across chat titles and messages
2. Archive functionality: mark chats as archived, filter from default view
3. Keyboard shortcuts for common actions

### Phase 7 (Future): Long Document / Book Mode
- Compressed summary of full document
- Rolling context window (summary of everything up to current page + raw text of last k pages)
- This phase needs experimentation with context strategies

## Key UX Interactions

1. **Creating a chat:** Click/drag on PDF → selection appears → chat panel opens with input focused → type question → send
2. **Viewing chats:** Expand chat panel → see all chats ordered by page → click title to scroll PDF to anchor → click again or double-click to expand thread
3. **Navigation:** Clicking anchors/chats adds to navigation stack → "back" button returns to previous position
4. **Collapsing panel:** Click toggle or drag edge → panel collapses → full PDF view

## LLM Context Strategy

When sending a message to the LLM:
1. **Full document context** (first message only): Send the full PDF as a file, or a text extraction of the full document
2. **Page image**: Render the anchor's page as an image
3. **Selection info**: Include coordinates and cropped image of the selected region
4. **User description**: If provided, include the user's text description of what they're highlighting
5. **Chat history**: Include all previous messages in this chat thread
6. **Cross-chat context** (future): Option to include summaries of nearby chats for richer context
