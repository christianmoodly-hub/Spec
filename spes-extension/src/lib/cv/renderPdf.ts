import { jsPDF } from 'jspdf'
import {
  companyLine,
  contactLine,
  CV_SECTION,
  formatDateRange,
  type CvDocument,
  type CvEducation,
  type CvExperience,
  type CvSkillGroup,
} from './document'
import { CV_STYLE, ptToMm } from './template'

type FontStyle = 'normal' | 'bold' | 'italic'

class Layout {
  readonly doc: jsPDF
  readonly pageW: number
  readonly pageH: number
  readonly margin: number
  readonly contentW: number
  readonly bottom: number
  top: number

  constructor(doc: jsPDF) {
    this.doc = doc
    this.pageW = doc.internal.pageSize.getWidth()
    this.pageH = doc.internal.pageSize.getHeight()
    this.margin = CV_STYLE.page.marginMm
    this.contentW = this.pageW - this.margin * 2
    this.bottom = this.pageH - this.margin
    this.top = this.margin
    doc.setTextColor(0, 0, 0)
  }

  atTop(): boolean {
    return this.top <= this.margin + 0.2
  }

  newPage(): void {
    this.doc.addPage()
    this.top = this.margin
  }

  /** Move a block that fits on one page onto the next page instead of the margin. */
  ensure(heightMm: number): void {
    const contentH = this.bottom - this.margin
    if (heightMm < contentH && this.top + heightMm > this.bottom + 0.05) {
      this.newPage()
    }
  }
}

function leading(sizePt: number): number {
  return ptToMm(sizePt * CV_STYLE.lineHeight)
}

function useFont(layout: Layout, sizePt: number, style: FontStyle): void {
  layout.doc.setFont(CV_STYLE.pdfFont, style)
  layout.doc.setFontSize(sizePt)
}

function wrap(
  layout: Layout,
  text: string,
  widthMm: number,
  sizePt: number,
  style: FontStyle,
): string[] {
  useFont(layout, sizePt, style)
  const lines = layout.doc.splitTextToSize(text, Math.max(8, widthMm)) as string[]
  return lines.map((line) => line.trimEnd()).filter((line) => line.length > 0)
}

function drawLines(
  layout: Layout,
  lines: string[],
  sizePt: number,
  style: FontStyle,
  x: number,
  align: 'left' | 'center' = 'left',
): void {
  const lead = leading(sizePt)
  const ascent = ptToMm(sizePt) * 0.8
  useFont(layout, sizePt, style)
  for (const line of lines) {
    if (layout.top + lead > layout.bottom + 0.05) {
      layout.newPage()
    }
    layout.doc.text(line, x, layout.top + ascent, align === 'center' ? { align } : undefined)
    layout.top += lead
  }
}

function drawCentered(layout: Layout, text: string, sizePt: number, style: FontStyle): void {
  const lines = wrap(layout, text, layout.contentW, sizePt, style)
  drawLines(layout, lines, sizePt, style, layout.pageW / 2, 'center')
}

function drawHeading(layout: Layout, label: string, followMm: number): void {
  const before = layout.atTop() ? 0 : ptToMm(CV_STYLE.spaceBeforeHeadingPt)
  const lead = leading(CV_STYLE.headingPt)
  const after = ptToMm(CV_STYLE.spaceAfterRulePt)
  layout.ensure(before + lead + after + followMm)
  if (!layout.atTop()) {
    layout.top += ptToMm(CV_STYLE.spaceBeforeHeadingPt)
  }
  drawLines(layout, [label], CV_STYLE.headingPt, 'bold', layout.margin)
  layout.doc.setDrawColor(0, 0, 0)
  layout.doc.setLineWidth(ptToMm(CV_STYLE.rulePt))
  layout.doc.line(layout.margin, layout.top, layout.margin + layout.contentW, layout.top)
  layout.top += after
}

function drawSpread(
  layout: Layout,
  left: string,
  right: string,
  leftStyle: 'bold' | 'normal',
): void {
  useFont(layout, CV_STYLE.bodyPt, 'normal')
  const rightW = right ? layout.doc.getTextWidth(right) : 0
  const leftWidth = layout.contentW - (right ? rightW + CV_STYLE.dateGapMm : 0)
  const lines = left
    ? wrap(layout, left, leftWidth, CV_STYLE.bodyPt, leftStyle)
    : ['']
  const lead = leading(CV_STYLE.bodyPt)
  const ascent = ptToMm(CV_STYLE.bodyPt) * 0.8
  layout.ensure(lead * lines.length)
  lines.forEach((line, index) => {
    const y = layout.top + ascent
    if (line) {
      useFont(layout, CV_STYLE.bodyPt, leftStyle)
      layout.doc.text(line, layout.margin, y)
    }
    if (index === 0 && right) {
      useFont(layout, CV_STYLE.bodyPt, 'normal')
      layout.doc.text(right, layout.pageW - layout.margin, y, { align: 'right' })
    }
    layout.top += lead
  })
}

function drawBody(layout: Layout, text: string, style: FontStyle = 'normal'): void {
  const lines = wrap(layout, text, layout.contentW, CV_STYLE.bodyPt, style)
  drawLines(layout, lines, CV_STYLE.bodyPt, style, layout.margin)
}

function bulletHeight(layout: Layout, text: string): number {
  const indent = ptToMm(CV_STYLE.bulletIndentPt)
  const lines = wrap(
    layout,
    text,
    layout.contentW - indent,
    CV_STYLE.bodyPt,
    'normal',
  )
  return Math.max(1, lines.length) * leading(CV_STYLE.bodyPt)
}

function drawBullet(layout: Layout, text: string, kept: boolean): void {
  const indent = ptToMm(CV_STYLE.bulletIndentPt)
  const lines = wrap(
    layout,
    text,
    layout.contentW - indent,
    CV_STYLE.bodyPt,
    'normal',
  )
  const drawn = lines.length > 0 ? lines : [text]
  const lead = leading(CV_STYLE.bodyPt)
  const ascent = ptToMm(CV_STYLE.bodyPt) * 0.8
  if (!kept) {
    layout.ensure(lead * drawn.length)
  }
  drawn.forEach((line, index) => {
    if (layout.top + lead > layout.bottom + 0.05) {
      layout.newPage()
    }
    const y = layout.top + ascent
    useFont(layout, CV_STYLE.bodyPt, 'normal')
    if (index === 0) {
      layout.doc.text('•', layout.margin, y)
    }
    layout.doc.text(line, layout.margin + indent, y)
    layout.top += lead
  })
}

function drawSkill(layout: Layout, group: CvSkillGroup): void {
  const items = group.items.join(', ')
  const label = group.category ? `${group.category}:` : ''
  useFont(layout, CV_STYLE.bodyPt, 'bold')
  const labelW = label ? layout.doc.getTextWidth(label) : 0
  const gap = label ? 1.4 : 0
  const hang = labelW + gap
  const firstWidth = layout.contentW - hang
  const narrow = firstWidth < 24
  const lines = wrap(
    layout,
    items,
    narrow ? layout.contentW : firstWidth,
    CV_STYLE.bodyPt,
    'normal',
  )
  const lead = leading(CV_STYLE.bodyPt)
  const ascent = ptToMm(CV_STYLE.bodyPt) * 0.8
  if (narrow && label) {
    layout.ensure(lead * 2)
    useFont(layout, CV_STYLE.bodyPt, 'bold')
    layout.doc.text(label, layout.margin, layout.top + ascent)
    layout.top += lead
  }
  const drawn = lines.length > 0 ? lines : ['']
  drawn.forEach((line, index) => {
    layout.ensure(lead)
    const y = layout.top + ascent
    if (index === 0 && label && !narrow) {
      useFont(layout, CV_STYLE.bodyPt, 'bold')
      layout.doc.text(label, layout.margin, y)
      useFont(layout, CV_STYLE.bodyPt, 'normal')
      layout.doc.text(line, layout.margin + hang, y)
    } else {
      useFont(layout, CV_STYLE.bodyPt, 'normal')
      const x = !narrow && label ? layout.margin + hang : layout.margin
      layout.doc.text(line, x, y)
    }
    layout.top += lead
  })
  layout.top = Math.min(layout.bottom, layout.top + ptToMm(CV_STYLE.skillGapPt))
}

function roleKeepHeight(layout: Layout, entry: CvExperience): number {
  useFont(layout, CV_STYLE.bodyPt, 'normal')
  const dates = formatDateRange(entry.start, entry.end)
  const rightW = dates ? layout.doc.getTextWidth(dates) : 0
  const leftWidth = layout.contentW - (dates ? rightW + CV_STYLE.dateGapMm : 0)
  const titleLines = entry.title
    ? wrap(layout, entry.title, leftWidth, CV_STYLE.bodyPt, 'bold')
    : dates
      ? ['']
      : []
  const company = companyLine(entry.company, entry.location)
  const companyLines = company
    ? wrap(layout, company, layout.contentW, CV_STYLE.bodyPt, 'italic')
    : []
  const first = entry.bullets[0]
  return (
    titleLines.length * leading(CV_STYLE.bodyPt) +
    companyLines.length * leading(CV_STYLE.bodyPt) +
    (first ? bulletHeight(layout, first) : 0)
  )
}

function drawRole(layout: Layout, entry: CvExperience): void {
  layout.ensure(roleKeepHeight(layout, entry))
  const dates = formatDateRange(entry.start, entry.end)
  if (entry.title || dates) {
    drawSpread(layout, entry.title, dates, 'bold')
  }
  const company = companyLine(entry.company, entry.location)
  if (company) {
    drawBody(layout, company, 'italic')
  }
  entry.bullets.forEach((bullet, index) => {
    drawBullet(layout, bullet, index === 0)
  })
  layout.top = Math.min(layout.bottom, layout.top + ptToMm(CV_STYLE.roleGapPt))
}

function educationKeepHeight(layout: Layout, entry: CvEducation): number {
  useFont(layout, CV_STYLE.bodyPt, 'normal')
  const dates = formatDateRange(entry.start, entry.end)
  const rightW = dates ? layout.doc.getTextWidth(dates) : 0
  const leftWidth = layout.contentW - (dates ? rightW + CV_STYLE.dateGapMm : 0)
  const instLines =
    entry.institution || dates
      ? wrap(layout, entry.institution || ' ', leftWidth, CV_STYLE.bodyPt, 'bold')
      : []
  const qualLines = entry.qualification
    ? wrap(layout, entry.qualification, layout.contentW, CV_STYLE.bodyPt, 'normal')
    : []
  return (Math.max(instLines.length, entry.institution || dates ? 1 : 0) + qualLines.length) *
    leading(CV_STYLE.bodyPt)
}

function drawEducation(layout: Layout, entry: CvEducation): void {
  layout.ensure(educationKeepHeight(layout, entry))
  const dates = formatDateRange(entry.start, entry.end)
  if (entry.institution || dates) {
    drawSpread(layout, entry.institution, dates, 'bold')
  }
  if (entry.qualification) {
    drawBody(layout, entry.qualification)
  }
  if (entry.details) {
    drawBody(layout, entry.details)
  }
  layout.top = Math.min(layout.bottom, layout.top + ptToMm(CV_STYLE.roleGapPt))
}

function firstRoleFollow(layout: Layout, entry: CvExperience | undefined): number {
  return entry ? roleKeepHeight(layout, entry) : leading(CV_STYLE.bodyPt)
}

function drawCv(doc: jsPDF, cv: CvDocument): void {
  const layout = new Layout(doc)
  if (cv.name) {
    drawCentered(layout, cv.name, CV_STYLE.namePt, 'bold')
    layout.top += ptToMm(CV_STYLE.afterNamePt)
  }
  const contact = contactLine(cv.contact)
  if (contact) {
    drawCentered(layout, contact, CV_STYLE.contactPt, 'normal')
  }
  if (cv.summary) {
    const follow = leading(CV_STYLE.bodyPt)
    drawHeading(layout, CV_SECTION.summary, follow)
    drawBody(layout, cv.summary)
  }
  if (cv.skills.length > 0) {
    drawHeading(layout, CV_SECTION.skills, leading(CV_STYLE.bodyPt))
    for (const group of cv.skills) {
      drawSkill(layout, group)
    }
  }
  if (cv.experience.length > 0) {
    drawHeading(
      layout,
      CV_SECTION.experience,
      firstRoleFollow(layout, cv.experience[0]),
    )
    for (const entry of cv.experience) {
      drawRole(layout, entry)
    }
  }
  if (cv.education.length > 0) {
    drawHeading(
      layout,
      CV_SECTION.education,
      educationKeepHeight(layout, cv.education[0]),
    )
    for (const entry of cv.education) {
      drawEducation(layout, entry)
    }
  }
}

function buildPdf(cv: CvDocument): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  if (cv.name) {
    doc.setProperties({ title: `${cv.name} CV` })
  }
  drawCv(doc, cv)
  return doc
}

export function renderCvPdfBlob(cv: CvDocument): Blob {
  return buildPdf(cv).output('blob')
}

export function renderCvPdfBytes(cv: CvDocument): Uint8Array {
  return new Uint8Array(buildPdf(cv).output('arraybuffer'))
}
