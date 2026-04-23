import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { Markdown } from 'tiptap-markdown';
import { useEffect, useRef } from 'react';

interface Props {
  /** Markdown source to seed the editor with. Treated as the source of
   *  truth on mount; after that the editor owns its content and we
   *  emit markdown back via `onChange` on every edit. */
  value: string;
  onChange: (markdown: string) => void;
  /** When true, grabs focus on mount (used for freshly-created notes). */
  autoFocus?: boolean;
  placeholder?: string;
}

/**
 * An Obsidian/Notion-style live-preview markdown editor.
 *
 * Built on Tiptap (a ProseMirror wrapper) with the StarterKit for
 * headings/lists/bold/italic/code/blockquote, plus `tiptap-markdown`
 * to:
 *   - parse the `value` prop into the editor's doc on mount
 *   - emit serialized markdown on every edit (via `editor.storage.markdown.getMarkdown()`)
 *   - enable "input rules" so common markdown shortcuts render as you
 *     type — `# ` becomes a heading, `**text**` becomes bold, etc.
 *
 * This is a single unified editing surface (no edit/preview toggle):
 * the formatting is rendered inline as the user types, which is what
 * the Obsidian "live preview" mode and Notion's block editor give
 * you. The raw markdown is what we persist.
 */
export default function LiveMarkdownEditor({
  value,
  onChange,
  autoFocus = false,
  placeholder,
}: Props) {
  // `onChange` could close over stale state in a parent component; use
  // a ref so the Tiptap callback always sees the latest.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Ignore the first `value` change that comes back from our own
  // onChange handler — otherwise updating the editor after a local
  // edit would overwrite the user's cursor position and break typing.
  const lastEmittedRef = useRef<string>(value);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // `StarterKit` includes code blocks; we already get syntax
        // styling via Tailwind in our shared Markdown view, so the
        // default here is fine.
      }),
      Link.configure({
        openOnClick: true,
        autolink: true,
        HTMLAttributes: {
          target: '_blank',
          rel: 'noopener noreferrer',
          class:
            'text-indigo-400 hover:text-indigo-300 underline decoration-indigo-400/40 hover:decoration-indigo-300 underline-offset-2',
        },
      }),
      // This extension is the glue: it enables markdown parsing of
      // incoming content and `editor.storage.markdown.getMarkdown()`
      // for reading back out, plus the input-rule shortcuts that make
      // the live-preview feel work (#, **, -, etc. transforming as
      // you type).
      Markdown.configure({
        html: false, // don't round-trip through HTML; keeps clean md
        transformPastedText: true, // paste markdown → parsed, not raw
        transformCopiedText: true, // copy selection as markdown
        breaks: true, // treat single newlines as <br>
      }),
    ],
    content: value, // tiptap-markdown parses string content as markdown
    editorProps: {
      attributes: {
        // Applied to the ProseMirror editable root. Matches the look
        // of our other panels + the shared Markdown renderer so
        // live-preview mode looks identical to what react-markdown
        // would produce for the same content.
        class:
          'markdown-body tiptap-editor outline-none text-sm leading-relaxed text-slate-200 px-3 py-3 min-h-full',
        'data-placeholder': placeholder ?? '',
      },
    },
    onUpdate: ({ editor }) => {
      // Pull markdown out of the editor. tiptap-markdown stores the
      // serializer on `editor.storage.markdown`.
      const md = editor.storage.markdown.getMarkdown();
      lastEmittedRef.current = md;
      onChangeRef.current(md);
    },
  });

  // If the `value` prop changes EXTERNALLY (e.g. the user switched to
  // a different note in the sidebar), reset the editor's content. We
  // guard against echoes of our own emissions via `lastEmittedRef`.
  useEffect(() => {
    if (!editor) return;
    if (value === lastEmittedRef.current) return;
    editor.commands.setContent(value, { emitUpdate: false });
    lastEmittedRef.current = value;
  }, [value, editor]);

  // Optional autofocus on mount (used when opening a freshly-created
  // note so the user can start typing immediately).
  useEffect(() => {
    if (!editor || !autoFocus) return;
    // Next microtask — the DOM node has to be in the tree first.
    const id = window.setTimeout(() => {
      editor.commands.focus('end');
    }, 0);
    return () => window.clearTimeout(id);
  }, [editor, autoFocus]);

  return <EditorContent editor={editor} className="h-full overflow-y-auto" />;
}
