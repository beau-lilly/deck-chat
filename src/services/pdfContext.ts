import type { ChatAnchor } from '../types';

/**
 * Renders a PDF page to a canvas and returns it as a base64 PNG.
 * If an anchor with a region is provided, crops to that region.
 */
export async function capturePageImage(
  pageElement: HTMLElement,
  _anchor?: ChatAnchor,
): Promise<string | undefined> {
  const canvas = pageElement.querySelector('canvas');
  if (!canvas) return undefined;

  if (_anchor?.type === 'region' && _anchor.width && _anchor.height) {
    // Crop to the selected region
    const cropCanvas = document.createElement('canvas');
    const ctx = cropCanvas.getContext('2d');
    if (!ctx) return canvas.toDataURL('image/png').split(',')[1];

    const sx = ((_anchor.x) / 100) * canvas.width;
    const sy = ((_anchor.y) / 100) * canvas.height;
    const sw = ((_anchor.width) / 100) * canvas.width;
    const sh = ((_anchor.height) / 100) * canvas.height;

    cropCanvas.width = sw;
    cropCanvas.height = sh;
    ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
    return cropCanvas.toDataURL('image/png').split(',')[1];
  }

  // Full page image
  return canvas.toDataURL('image/png').split(',')[1];
}

export function buildSystemPrompt(anchor: ChatAnchor): string {
  let prompt = 'You are a helpful assistant analyzing a document. The user has selected a specific area on a page to ask about.';

  prompt += ` They selected a rectangular region on page ${anchor.pageNumber} at (${Math.round(anchor.x)}%, ${Math.round(anchor.y)}%) with size ${Math.round(anchor.width!)}% x ${Math.round(anchor.height!)}%.`;

  if (anchor.description) {
    prompt += ` They described their selection as: "${anchor.description}"`;
  }

  prompt += ' An image of the page (or cropped region) is attached. Answer their question based on what you can see.';
  return prompt;
}
