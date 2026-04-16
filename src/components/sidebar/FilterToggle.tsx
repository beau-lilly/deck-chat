import { Folder as FolderIcon, FileText, LayoutList } from 'lucide-react';
import { useLibrarianStore, type LibraryFilter } from '../../stores/librarianStore';

export default function FilterToggle() {
  const filter = useLibrarianStore((s) => s.filter);
  const setFilter = useLibrarianStore((s) => s.setFilter);

  const btn = (value: LibraryFilter, icon: React.ReactNode, label: string) => (
    <button
      onClick={() => setFilter(value)}
      className={`flex items-center gap-1 px-2 py-1 text-[11px] rounded transition-colors ${
        filter === value
          ? 'bg-indigo-600 text-white'
          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
      }`}
      title={`Show ${label}`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="flex items-center gap-0.5 bg-slate-800 rounded-md p-0.5">
      {btn('all', <LayoutList size={11} />, 'All')}
      {btn('folders', <FolderIcon size={11} />, 'Folders')}
      {btn('files', <FileText size={11} />, 'Files')}
    </div>
  );
}
