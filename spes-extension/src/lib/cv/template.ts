/**
 * CV layout tokens. Margins, type sizes, and fonts live here so the
 * PDF, Word, and popup preview stay in step.
 *
 * PDF uses Helvetica because it is a built-in PDF font: the glyphs stay
 * real selectable text without embedding a font file. Word uses Arial.
 * Both are ATS-safe. The preview uses Arial, then Helvetica.
 */
export const CV_STYLE = {
  page: {
    widthMm: 210,
    heightMm: 297,
    /** 0.75 inch. Keep this at or above 0.5 inch (12.7mm). */
    marginMm: 19.05,
    marginTwip: 1080,
    widthTwip: 11906,
    heightTwip: 16838,
  },
  pdfFont: 'helvetica',
  docxFont: 'Arial',
  previewFont: 'Arial, Helvetica, sans-serif',
  namePt: 20,
  contactPt: 10,
  headingPt: 12,
  bodyPt: 10.5,
  lineHeight: 1.15,
  spaceBeforeHeadingPt: 12,
  spaceAfterRulePt: 5,
  /** Section rule thickness. Word stores this in eighths of a point. */
  rulePt: 0.75,
  bulletIndentPt: 14,
  dateGapMm: 4,
  afterNamePt: 2,
  roleGapPt: 6,
  skillGapPt: 2,
} as const

export function ptToMm(pt: number): number {
  return (pt * 25.4) / 72
}

export function ptToTwip(pt: number): number {
  return Math.round(pt * 20)
}

/** DOCX font size is in half-points. */
export function halfPoints(pt: number): number {
  return Math.round(pt * 2)
}

/** Auto line spacing in twentieths of a line (240 = single). */
export function lineSpacingTwip(): number {
  return Math.round(240 * CV_STYLE.lineHeight)
}

export function contentWidthTwip(): number {
  return CV_STYLE.page.widthTwip - CV_STYLE.page.marginTwip * 2
}
