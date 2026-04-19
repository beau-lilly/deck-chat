import { Upload } from 'lucide-react';

interface EmptyStateProps {
  onUpload: () => void;
}

export default function EmptyState({ onUpload }: EmptyStateProps) {
  return (
    // h-full + w-full so this div fills the pdf container (which isn't a
    // flex parent — flex-1 wouldn't work here). flex items-center +
    // justify-center then centers the inner content block both ways.
    <div className="h-full w-full flex items-center justify-center bg-slate-950 px-6">
      <div className="text-center max-w-md">
        <h2 className="text-xl font-medium text-slate-200 mb-2">No PDF loaded</h2>
        <p className="text-slate-500 mb-5 text-sm leading-relaxed">
          Pick a PDF from the sidebar, or upload a new one to get started.
        </p>
        <button
          onClick={onUpload}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg transition-colors"
        >
          <Upload size={14} />
          Upload PDF
        </button>
      </div>
    </div>
  );
}
