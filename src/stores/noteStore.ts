import { create } from 'zustand';
import type { ChatAnchor, Note } from '../types';
import { repo } from '../data/repo';

interface NoteState {
  /** The currently-open note (hydrated — full body loaded), or null. */
  activeNote: Note | null;
  /** Busy flag while the note is being loaded or created. */
  isLoading: boolean;

  /** Create a new empty note anchored to `anchor` on `documentId`,
   * persist it, and open it. Returns the new note. */
  createAndOpenNote: (
    documentId: string,
    anchor: ChatAnchor,
    initialBody?: string,
  ) => Promise<Note>;

  /** Load a note by id from the repo and make it active. */
  openNote: (id: string) => Promise<void>;

  /** Close whatever is active without clearing the repo. */
  closeNote: () => void;

  /** Save a new body for the active note; persisted via repo.
   * Updates the in-memory active note optimistically. */
  updateActiveNoteBody: (body: string) => Promise<void>;

  /** Rename the active note. */
  renameActiveNote: (title: string) => Promise<void>;
}

function uuid(): string {
  return crypto.randomUUID();
}

// Default title for a freshly-created note. Notes now carry explicit
// titles (not auto-derived from the body's first line) — see the
// note on updateActiveNoteBody below — so every note starts here and
// only changes when the user clicks the header to rename it.
const DEFAULT_TITLE = 'Untitled note';

export const useNoteStore = create<NoteState>((set, get) => ({
  activeNote: null,
  isLoading: false,

  createAndOpenNote: async (documentId, anchor, initialBody = '') => {
    const now = new Date();
    // Always start as "Untitled note" regardless of `initialBody`.
    // A seeded body (e.g. a blockquote of the selected text — see
    // AppLayout.handleCreateNote) used to drive an auto-derived title
    // like `> Selected text`, which read as noise. Users rename via
    // the header click-to-edit flow instead.
    const note: Note = {
      id: uuid(),
      documentId,
      anchor,
      title: DEFAULT_TITLE,
      body: initialBody,
      createdAt: now,
      updatedAt: now,
    };
    await repo.createNote(note);
    set({ activeNote: note });
    return note;
  },

  openNote: async (id) => {
    set({ isLoading: true });
    const note = await repo.getNote(id);
    set({ activeNote: note ?? null, isLoading: false });
  },

  closeNote: () => set({ activeNote: null }),

  // Titles are now explicit, not derived. A body edit only writes the
  // body — the title is untouched unless the user calls
  // renameActiveNote via the header click-to-edit UI. This matches
  // the Obsidian/Notion model where titles are first-class fields,
  // and avoids the "my title just changed to '> Selected text'"
  // surprise that the old auto-derive produced when the body was
  // seeded with a blockquote.
  updateActiveNoteBody: async (body) => {
    const current = get().activeNote;
    if (!current) return;
    const updated: Note = { ...current, body, updatedAt: new Date() };
    set({ activeNote: updated });
    await repo.updateNoteBody(current.id, body);
  },

  renameActiveNote: async (title) => {
    const current = get().activeNote;
    if (!current) return;
    const now = new Date();
    set({ activeNote: { ...current, title, updatedAt: now } });
    await repo.renameNote(current.id, title);
  },
}));
