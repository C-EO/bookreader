import { applyVariables } from "../../util/strings.js";

/**
 * Class to manage a 'chunk' (approximately a paragraph) of text on a page.
 */
export default class PageChunk {
  /**
   * @param {number} leafIndex
   * @param {number} chunkIndex
   * @param {string} text
   * @param {DJVURect[]} lineRects
   */
  constructor(leafIndex, chunkIndex, text, lineRects) {
    this.leafIndex = leafIndex;
    this.chunkIndex = chunkIndex;
    this.text = text;
    this.lineRects = lineRects;
  }

  /**
   * @param {import('@/src/util/strings.js').StringWithVars} pageChunkUrl
   * @param {number} leafIndex
   * @return {Promise<PageChunk[]>}
   */
  static async fetch(pageChunkUrl, leafIndex) {
    if (window.br.plugins.translate?.translationManager.active) {
      const translateLayers = await window.br.plugins.translate.getTranslateLayers(leafIndex);
      const paragraphs = Array.from(translateLayers[0].childNodes);

      const pageChunks = [];
      for (const [idx, item] of paragraphs.entries()) {
        // Should not read paragraphs w/ header or footer roles
        if (!item.classList.contains('ocr-role-header-footer')) {
          const translatedChunk = new PageChunk(leafIndex, idx, item.textContent, []);
          pageChunks.push(translatedChunk);
        }
      }
      if (pageChunks.length === 0) {
        const placeholder = new PageChunk(leafIndex, 0, "", []);
        pageChunks.push(placeholder);
      }
      return pageChunks;
    } else {
      const chunks = await $.ajax({
        type: 'GET',
        url: applyVariables(pageChunkUrl, { pageIndex: leafIndex }),
        cache: true,
        xhrFields: {
          withCredentials: window.br.protected,
        },
      });
      return PageChunk._fromTextWrapperResponse(leafIndex, chunks);
    }
  }

  /**
   * Convert the response from BookReaderGetTextWrapper.php into a {@link PageChunk} instance
   * @param {number} leafIndex
   * @param {Array<[String, ...DJVURect[]]>} chunksResponse
   * @return {PageChunk[]}
   */
  static _fromTextWrapperResponse(leafIndex, chunksResponse) {
    return chunksResponse.map((c, i) => {
      const correctedLineRects = PageChunk._fixChunkRects(c.slice(1));
      const correctedText = PageChunk._removeDanglingHyphens(c[0]);
      return new PageChunk(leafIndex, i, correctedText, correctedLineRects);
    });
  }

  /**
   * @private
   * Sometimes the first rectangle will be ridiculously wide/tall. Find those and fix them
   * *NOTE*: Modifies the original array and returns it.
   * *NOTE*: This should probably be fixed on the petabox side, and then removed here
   * Has 2 problems:
   *  - If the rect is the last rect on the page (and hence the only rect in the array),
   *    the rect's size isn't fixed
   * - Because this relies on the second rect, there's a chance it won't be the right
   *   width
   * @param {DJVURect[]} rects
   * @return {DJVURect[]}
   */
  static _fixChunkRects(rects) {
    if (rects.length < 2) return rects;

    const [firstRect, secondRect] = rects;
    const [left, bottom, right] = firstRect;
    const width = right - left;
    const secondHeight = secondRect[1] - secondRect[3];
    const secondWidth = secondRect[2] - secondRect[0];
    const secondRight = secondRect[2];

    if (width > secondWidth * 30) {
      // Set the end to be the same
      firstRect[2] = secondRight;
      // And the top to be the same height
      firstRect[3] = bottom - secondHeight;
    }

    return rects;
  }

  /**
   * Remove "dangling" hyphens from read aloud text to avoid TTS stuttering
   * @param {string} text
   * @return {string}
   */
  static _removeDanglingHyphens(text) {
    // Some books mis-OCR a dangling hyphen as a ¬ (mathematical not sign) . Since in math
    // the not sign should not appear followed by a space, we think we can safely assume
    // this should be replaced.
    return text.replace(/[-¬]\s+/g, '');
  }
}

/**
 * @typedef {[number, number, number, number]} DJVURect
 * coords are in l,b,r,t order
 */
