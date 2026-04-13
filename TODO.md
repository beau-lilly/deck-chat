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
