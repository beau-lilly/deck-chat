import { repo } from '../data/repo';
import { useDocumentStore } from '../stores/documentStore';
import { useChatStore } from '../stores/chatStore';
import { useLibrarianStore } from '../stores/librarianStore';

// Shared upload path used by the toolbar and the sidebar. Persists the PDF to
// the repo, makes it the active document, and clears any previously-loaded
// chats (none will exist for a brand-new document).
export async function uploadPdfToFolder(file: File, folderId: string): Promise<string | null> {
  if (!file || file.type !== 'application/pdf') return null;
  const doc = await repo.createDocument(folderId, file);
  // Seed document store with the File we already have in memory so we can
  // render immediately without another IndexedDB roundtrip.
  const { setPdfFile, setActiveDocumentId } = useDocumentStore.getState();
  setPdfFile(file);
  setActiveDocumentId(doc.id);
  // Fresh document => empty chat list.
  await useChatStore.getState().loadChatsForDocument(doc.id);
  // Focus the folder we uploaded into so subsequent uploads land there too.
  useLibrarianStore.getState().setSelectedFolderId(folderId);
  useLibrarianStore.getState().expandFolder(folderId);
  return doc.id;
}
