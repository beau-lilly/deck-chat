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

/** Turn a markdown body into a sensible default title. Pulls the first
 *  non-empty line, strips markdown hashes / stars, and caps to 60 chars.
 *  Falls back to "Untitled note" if the body is empty. */
function deriveTitle(body: string): string {
  const firstLine = body.split('\n').find((l) => l.trim().length > 0);
  if (!firstLine) return 'Untitled note';
  const stripped = firstLine
    .replace(/^#+\s*/, '')
    .replace(/^\*+\s*/, '')
    .replace(/^[*_~`]+|[*_~`]+$/g, '')
    .trim();
  return stripped.length > 60 ? `${stripped.slice(0, 57)}…` : stripped;
}

export const useNoteStore = create<NoteState>((set, get) => ({
  activeNote: null,
  isLoading: false,

  createAndOpenNote: async (documentId, anchor, initialBody = '') => {
    const now = new Date();
    const note: Note = {
      id: uuid(),
      documentId,
      anchor,
      title: deriveTitle(initialBody),
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

  updateActiveNoteBody: async (body) => {
    const current = get().activeNote;
    if (!current) return;
    // Auto-retitle as long as the user hasn't customised the title away
    // from whatever was derived from the previous body. If the stored
    // title still matches the derived-from-previous-body title, we
    // follow along; otherwise we leave it alone (user intervened).
    const prevDerived = deriveTitle(current.body);
    const nextTitle =
      current.title === prevDerived ? deriveTitle(body) : current.title;
    const now = new Date();
    const updated: Note = {
      ...current,
      body,
      title: nextTitle,
      updatedAt: now,
    };
    set({ activeNote: updated });
    await repo.updateNoteBody(current.id, body);
    if (nextTitle !== current.title) {
      await repo.renameNote(current.id, nextTitle);
    }
  },

  renameActiveNote: async (title) => {
    const current = get().activeNote;
    if (!current) return;
    const now = new Date();
    set({ activeNote: { ...current, title, updatedAt: now } });
    await repo.renameNote(current.id, title);
  },
}));
