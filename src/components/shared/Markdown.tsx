import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  content: string;
  /** Optional extra className applied to the outermost wrapper div. */
  className?: string;
}

/**
 * Shared markdown renderer used for both chat messages and notes.
 *
 * Covers the formatting an LLM typically emits (headings, lists,
 * code fences, tables, blockquotes, inline code, emphasis). `remarkGfm`
 * adds GitHub flavor — tables, strikethrough, autolinks, task lists.
 *
 * Styling is done with plain Tailwind classes on the renderers below
 * rather than the `@tailwindcss/typography` plugin so we stay inside
 * the app's dark palette without adding another dep.
 */
export default function Markdown({ content, className = '' }: Props) {
  return (
    <div className={`markdown-body text-sm leading-relaxed text-slate-200 ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Headings — scale down each level so they don't dwarf chat
          // rows. We intentionally skip h1 styling to discourage the
          // model from using top-level headings (which look out of
          // place in a chat bubble).
          h1: (p) => <h1 className="text-base font-semibold text-slate-100 mt-3 mb-1.5" {...p} />,
          h2: (p) => <h2 className="text-sm font-semibold text-slate-100 mt-3 mb-1.5" {...p} />,
          h3: (p) => <h3 className="text-sm font-medium text-slate-100 mt-2 mb-1" {...p} />,
          h4: (p) => <h4 className="text-sm font-medium text-slate-100 mt-2 mb-1" {...p} />,

          p: (p) => <p className="my-2 whitespace-pre-wrap" {...p} />,

          a: (p) => (
            <a
              {...p}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-400 hover:text-indigo-300 underline decoration-indigo-400/40 hover:decoration-indigo-300 underline-offset-2"
            />
          ),

          ul: (p) => <ul className="my-2 ml-5 list-disc space-y-1" {...p} />,
          ol: (p) => <ol className="my-2 ml-5 list-decimal space-y-1" {...p} />,
          li: (p) => <li className="marker:text-slate-500" {...p} />,

          strong: (p) => <strong className="font-semibold text-slate-50" {...p} />,
          em: (p) => <em className="italic" {...p} />,
          del: (p) => <del className="text-slate-500" {...p} />,

          blockquote: (p) => (
            <blockquote
              className="my-2 border-l-2 border-slate-600 pl-3 text-slate-400 italic"
              {...p}
            />
          ),

          // Inline code vs code blocks: react-markdown passes `inline`
          // as a prop on the `code` element. We branch on whether the
          // code has a language class (fenced block) to pick the style.
          code: ({ className, children, ...rest }) => {
            const isBlock = typeof className === 'string' && className.startsWith('language-');
            if (isBlock) {
              return (
                <code
                  {...rest}
                  className={`${className ?? ''} block text-xs leading-relaxed`}
                >
                  {children}
                </code>
              );
            }
            return (
              <code
                {...rest}
                className="bg-slate-800/80 text-indigo-300 rounded px-1 py-0.5 text-[0.85em] font-mono"
              >
                {children}
              </code>
            );
          },
          pre: (p) => (
            <pre
              className="my-2 bg-slate-800/80 border border-slate-700 rounded-md p-3 overflow-x-auto"
              {...p}
            />
          ),

          hr: () => <hr className="my-3 border-slate-700" />,

          // GFM tables (via remark-gfm).
          table: (p) => (
            <div className="my-2 overflow-x-auto">
              <table className="min-w-full text-xs border-collapse" {...p} />
            </div>
          ),
          thead: (p) => <thead className="border-b border-slate-700" {...p} />,
          th: (p) => <th className="text-left font-medium px-2 py-1 text-slate-300" {...p} />,
          td: (p) => <td className="px-2 py-1 border-t border-slate-800" {...p} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
