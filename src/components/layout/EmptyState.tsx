import { FileUp } from 'lucide-react';

interface EmptyStateProps {
  onUpload: () => void;
}

export default function EmptyState({ onUpload }: EmptyStateProps) {
  return (
    <div className="flex-1 flex items-center justify-center bg-slate-950">
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center mx-auto mb-4">
          <FileUp size={28} className="text-slate-400" />
        </div>
        <h2 className="text-xl font-medium text-slate-200 mb-2">No PDF loaded</h2>
        <p className="text-slate-500 mb-4 text-sm">Upload a slide deck or document to get started</p>
        <button
          onClick={onUpload}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg transition-colors"
        >
          Upload PDF
        </button>
      </div>
    </div>
  );
}
