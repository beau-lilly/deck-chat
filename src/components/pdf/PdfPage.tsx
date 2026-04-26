import { Page } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import SelectionOverlay from './SelectionOverlay';
import ChatAnchorIndicator from './ChatAnchorIndicator';
import { useSelectionStore } from '../../stores/selectionStore';

interface PdfPageProps {
  pageNumber: number;
  width: number;
}

export default function PdfPage({ pageNumber, width }: PdfPageProps) {
  const tool = useSelectionStore((s) => s.tool);
  const isRegionMode = tool === 'region';

  return (
    <div
      className="relative mb-4 shadow-lg"
      data-page={pageNumber}
    >
      <Page
        pageNumber={pageNumber}
        width={width}
        renderTextLayer={!isRegionMode}
        renderAnnotationLayer={false}
      />
      {isRegionMode && <SelectionOverlay pageNumber={pageNumber} />}
      {/* Always renders. Owns the spatial anchor highlights AND the
          bottom-right cluster (slide-wide chat/note chips + the
          page-number badge that doubles as "Ask about this slide").
          The badge used to live in this file but now sits inside the
          cluster so chips and badge can share a single hover group. */}
      <ChatAnchorIndicator pageNumber={pageNumber} />
    </div>
  );
}
