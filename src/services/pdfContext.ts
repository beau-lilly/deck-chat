import type { ChatAnchor, ContextMode } from '../types';

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

/**
 * Build a system prompt and determine what images to include based on context mode.
 */
export function buildContextForMode(
  anchor: ChatAnchor,
  contextMode: ContextMode,
  pageTexts: string[],
): { systemPrompt: string; includeFullPageImage: boolean } {
  const pageNum = anchor.pageNumber;

  switch (contextMode) {
    case 'selection': {
      let prompt = `You are a helpful assistant analyzing a presentation. The user selected a region on page ${pageNum}.`;
      prompt += ' A screenshot of that selected region is attached. Answer based on what you can see in the screenshot.';
      if (anchor.description) {
        prompt += ` They described their selection as: "${anchor.description}"`;
      }
      return { systemPrompt: prompt, includeFullPageImage: false };
    }

    case 'slide': {
      const slideText = pageTexts[pageNum - 1] || '';
      let prompt = `You are a helpful assistant analyzing a presentation.`;
      if (slideText) {
        prompt += ` Here is the text content of page ${pageNum}:\n\n${slideText}\n\n`;
      } else {
        prompt += ` Page ${pageNum} appears to be primarily visual content.\n\n`;
      }
      prompt += `The user selected a region on this page. A full image of the page and a cropped screenshot of their selection are both attached.`;
      if (anchor.description) {
        prompt += ` They described their selection as: "${anchor.description}"`;
      }
      prompt += ' Use the page text and images to answer their question thoroughly.';
      return { systemPrompt: prompt, includeFullPageImage: true };
    }

    case 'document': {
      const allText = pageTexts
        .map((t, i) => {
          if (!t) return `--- Page ${i + 1} --- (visual content, no extractable text)`;
          return `--- Page ${i + 1} ---\n${t}`;
        })
        .join('\n\n');

      let prompt = `You are a helpful assistant analyzing a presentation deck. Here is the full document text:\n\n${allText}\n\n`;
      prompt += `The user selected a region on page ${pageNum}. A screenshot of that selected region is attached.`;
      if (anchor.description) {
        prompt += ` They described their selection as: "${anchor.description}"`;
      }
      prompt += ' Use the full document text for context and the region screenshot to identify what they are asking about. Answer thoroughly.';
      return { systemPrompt: prompt, includeFullPageImage: false };
    }
  }
}
