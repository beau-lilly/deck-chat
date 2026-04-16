import { useEffect, useRef, useState } from 'react';
import {
  Search,
  SlidersHorizontal,
  Check,
  LayoutList,
  Folder as FolderIcon,
  FileText,
  X,
} from 'lucide-react';
import { useLibrarianStore, type LibraryFilter } from '../../stores/librarianStore';

const FILTER_OPTIONS: { value: LibraryFilter; label: string; Icon: typeof LayoutList }[] = [
  { value: 'all', label: 'All', Icon: LayoutList },
  { value: 'folders', label: 'Folders only', Icon: FolderIcon },
  { value: 'files', label: 'Files only', Icon: FileText },
];

export default function SearchBar() {
  const search = useLibrarianStore((s) => s.search);
  const setSearch = useLibrarianStore((s) => s.setSearch);
  const filter = useLibrarianStore((s) => s.filter);
  const setFilter = useLibrarianStore((s) => s.setFilter);

  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close the filter menu when the user clicks anywhere outside the search
  // bar (including in the sidebar tree below it).
  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  // Show a filter-applied indicator dot when the user has narrowed to folders
  // or files only — helpful hint since the dropdown is hidden by default.
  const filterActive = filter !== 'all';

  return (
    <div ref={rootRef} className="relative">
      <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-md px-2 h-8 focus-within:border-indigo-500 transition-colors">
        <Search size={12} className="text-slate-500 shrink-0" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setSearch('');
          }}
          placeholder="Search files…"
          className="flex-1 min-w-0 bg-transparent text-xs text-slate-200 placeholder-slate-500 outline-none"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="p-0.5 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-700 shrink-0"
            title="Clear search"
            aria-label="Clear search"
          >
            <X size={11} />
          </button>
        )}
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className={`relative p-1 rounded shrink-0 transition-colors ${
            menuOpen
              ? 'bg-slate-700 text-slate-100'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
          }`}
          title="Filter"
          aria-label="Filter"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <SlidersHorizontal size={12} />
          {filterActive && (
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-indigo-400" />
          )}
        </button>
      </div>

      {menuOpen && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-20 w-40 bg-slate-800 border border-slate-700 rounded-md shadow-lg py-1"
        >
          {FILTER_OPTIONS.map(({ value, label, Icon }) => {
            const selected = filter === value;
            return (
              <button
                key={value}
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => {
                  setFilter(value);
                  setMenuOpen(false);
                }}
                className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs text-left transition-colors ${
                  selected
                    ? 'text-indigo-200 bg-indigo-600/20'
                    : 'text-slate-300 hover:bg-slate-700'
                }`}
              >
                <Icon size={12} className="shrink-0" />
                <span className="flex-1">{label}</span>
                {selected && <Check size={12} className="shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
