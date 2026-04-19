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
      {/* Always render — component returns null if this page isn't the
          active chat's anchor page. Sits above the SelectionOverlay
          (later in DOM order) so the indicator is visible during both
          text and region modes. */}
      <ChatAnchorIndicator pageNumber={pageNumber} />
      <div className="absolute bottom-2 right-3 text-xs text-slate-400 bg-slate-900/60 px-2 py-0.5 rounded z-20 pointer-events-none">
        {pageNumber}
      </div>
    </div>
  );
}
