import { useCallback, useRef, useEffect } from 'react';
import { Document } from 'react-pdf';
import { pdfjs } from 'react-pdf';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import PdfPage from './PdfPage';
import { useDocumentStore } from '../../stores/documentStore';

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfViewerProps {
  containerWidth: number;
}

export default function PdfViewer({ containerWidth }: PdfViewerProps) {
  const { pdfUrl, pageCount, setPageCount, setCurrentPage } = useDocumentStore();
  const setPageTexts = useDocumentStore((s) => s.setPageTexts);
  const scrollRef = useRef<HTMLDivElement>(null);

  const onDocumentLoadSuccess = useCallback(async (pdf: PDFDocumentProxy) => {
    setPageCount(pdf.numPages);

    // Extract text from all pages in the background
    const texts: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      try {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        texts.push(pageText);
      } catch {
        texts.push('');
      }
    }
    setPageTexts(texts);
    console.log(`[Deck Chat] Extracted text from ${pdf.numPages} pages (${texts.reduce((a, t) => a + t.length, 0)} chars total)`);
  }, [setPageCount, setPageTexts]);

  // Track current page via scroll position
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || pageCount === 0) return;

    const handleScroll = () => {
      const pages = container.querySelectorAll<HTMLDivElement>('[data-page]');
      const containerRect = container.getBoundingClientRect();
      const containerMiddle = containerRect.top + containerRect.height / 3;

      for (const page of pages) {
        const rect = page.getBoundingClientRect();
        if (rect.top <= containerMiddle && rect.bottom > containerMiddle) {
          const pageNum = parseInt(page.dataset.page || '1', 10);
          setCurrentPage(pageNum);
          break;
        }
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [pageCount, setCurrentPage]);

  if (!pdfUrl) return null;

  const pageWidth = Math.min(containerWidth - 48, 900);

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto px-6 py-4">
      <Document file={pdfUrl} onLoadSuccess={onDocumentLoadSuccess}>
        {Array.from({ length: pageCount }, (_, i) => (
          <PdfPage key={i + 1} pageNumber={i + 1} width={pageWidth} />
        ))}
      </Document>
    </div>
  );
}
