import {
  AlignmentType,
  BorderStyle,
  Document,
  LineRuleType,
  Packer,
  Paragraph,
  Tab,
  TabStopType,
  TextRun,
} from 'docx'
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
import {
  contentWidthTwip,
  CV_STYLE,
  halfPoints,
  lineSpacingTwip,
  ptToTwip,
} from './template'

const rule = {
  style: BorderStyle.SINGLE,
  size: Math.round(CV_STYLE.rulePt * 8),
  color: '000000',
  space: 1,
} as const

function bodySpacing(afterPt = 0): {
  before: number
  after: number
  line: number
  lineRule: (typeof LineRuleType)['AUTO']
} {
  return {
    before: 0,
    after: ptToTwip(afterPt),
    line: lineSpacingTwip(),
    lineRule: LineRuleType.AUTO,
  }
}

function run(
  text: string,
  options: { bold?: boolean; italics?: boolean; sizePt?: number } = {},
): TextRun {
  return new TextRun({
    text,
    font: CV_STYLE.docxFont,
    size: halfPoints(options.sizePt ?? CV_STYLE.bodyPt),
    bold: options.bold,
    italics: options.italics,
  })
}

function heading(label: string): Paragraph {
  return new Paragraph({
    border: { bottom: rule },
    spacing: {
      before: ptToTwip(CV_STYLE.spaceBeforeHeadingPt),
      after: ptToTwip(CV_STYLE.spaceAfterRulePt),
      line: lineSpacingTwip(),
      lineRule: LineRuleType.AUTO,
    },
    keepNext: true,
    keepLines: true,
    children: [run(label, { bold: true, sizePt: CV_STYLE.headingPt })],
  })
}

function spreadParagraph(
  left: string,
  right: string,
  options: { bold?: boolean; italics?: boolean; keepNext?: boolean; afterPt?: number },
): Paragraph {
  const children = []
  if (left) {
    children.push(
      run(left, { bold: options.bold, italics: options.italics }),
    )
  }
  if (right) {
    children.push(new Tab(), run(right))
  }
  return new Paragraph({
    tabStops: [
      {
        type: TabStopType.RIGHT,
        position: contentWidthTwip(),
      },
    ],
    spacing: bodySpacing(options.afterPt ?? 0),
    keepNext: options.keepNext,
    keepLines: true,
    children: children.length > 0 ? children : [run(' ')],
  })
}

function bodyParagraph(
  text: string,
  options: { italics?: boolean; keepNext?: boolean; afterPt?: number } = {},
): Paragraph {
  return new Paragraph({
    spacing: bodySpacing(options.afterPt ?? 0),
    keepNext: options.keepNext,
    keepLines: true,
    children: [run(text, { italics: options.italics })],
  })
}

function bulletParagraph(text: string, afterPt: number): Paragraph {
  const indent = ptToTwip(CV_STYLE.bulletIndentPt)
  return new Paragraph({
    tabStops: [{ type: TabStopType.LEFT, position: indent }],
    indent: { left: indent, hanging: indent },
    spacing: bodySpacing(afterPt),
    keepLines: true,
    children: [run('•'), new Tab(), run(text)],
  })
}

function skillParagraph(group: CvSkillGroup): Paragraph {
  const items = group.items.join(', ')
  const children = group.category
    ? [run(`${group.category}: `, { bold: true }), run(items)]
    : [run(items)]
  return new Paragraph({
    spacing: bodySpacing(CV_STYLE.skillGapPt),
    children,
  })
}

function roleParagraphs(entry: CvExperience): Paragraph[] {
  const dates = formatDateRange(entry.start, entry.end)
  const company = companyLine(entry.company, entry.location)
  const paragraphs: Paragraph[] = []
  if (entry.title || dates) {
    paragraphs.push(
      spreadParagraph(entry.title, dates, {
        bold: true,
        keepNext: Boolean(company || entry.bullets.length),
      }),
    )
  }
  if (company) {
    paragraphs.push(
      bodyParagraph(company, {
        italics: true,
        keepNext: entry.bullets.length > 0,
      }),
    )
  }
  entry.bullets.forEach((bullet, index) => {
    const last = index === entry.bullets.length - 1
    paragraphs.push(bulletParagraph(bullet, last ? CV_STYLE.roleGapPt : 0))
  })
  return paragraphs
}

function educationParagraphs(entry: CvEducation): Paragraph[] {
  const dates = formatDateRange(entry.start, entry.end)
  const paragraphs: Paragraph[] = []
  const hasFollow = Boolean(entry.qualification || entry.details)
  if (entry.institution || dates) {
    paragraphs.push(
      spreadParagraph(entry.institution, dates, {
        bold: true,
        keepNext: hasFollow,
      }),
    )
  }
  if (entry.qualification) {
    paragraphs.push(
      bodyParagraph(entry.qualification, {
        keepNext: Boolean(entry.details),
        afterPt: entry.details ? 0 : CV_STYLE.roleGapPt,
      }),
    )
  }
  if (entry.details) {
    paragraphs.push(bodyParagraph(entry.details, { afterPt: CV_STYLE.roleGapPt }))
  }
  return paragraphs
}

export function createCvDocx(cv: CvDocument): Document {
  const children: Paragraph[] = []
  if (cv.name) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: bodySpacing(CV_STYLE.afterNamePt),
        children: [run(cv.name, { bold: true, sizePt: CV_STYLE.namePt })],
      }),
    )
  }
  const contact = contactLine(cv.contact)
  if (contact) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: bodySpacing(0),
        children: [run(contact, { sizePt: CV_STYLE.contactPt })],
      }),
    )
  }
  if (cv.summary) {
    children.push(heading(CV_SECTION.summary), bodyParagraph(cv.summary))
  }
  if (cv.skills.length > 0) {
    children.push(heading(CV_SECTION.skills))
    for (const group of cv.skills) {
      children.push(skillParagraph(group))
    }
  }
  if (cv.experience.length > 0) {
    children.push(heading(CV_SECTION.experience))
    for (const entry of cv.experience) {
      children.push(...roleParagraphs(entry))
    }
  }
  if (cv.education.length > 0) {
    children.push(heading(CV_SECTION.education))
    for (const entry of cv.education) {
      children.push(...educationParagraphs(entry))
    }
  }
  if (children.length === 0) {
    children.push(new Paragraph({ children: [run(' ')] }))
  }
  return new Document({
    title: cv.name ? `${cv.name} CV` : 'CV',
    compatibility: { suppressSpacingAtTopOfPage: true },
    styles: {
      default: {
        document: {
          paragraph: { spacing: bodySpacing(0) },
          run: {
            font: CV_STYLE.docxFont,
            size: halfPoints(CV_STYLE.bodyPt),
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: CV_STYLE.page.widthTwip,
              height: CV_STYLE.page.heightTwip,
            },
            margin: {
              top: CV_STYLE.page.marginTwip,
              bottom: CV_STYLE.page.marginTwip,
              left: CV_STYLE.page.marginTwip,
              right: CV_STYLE.page.marginTwip,
              header: 360,
              footer: 360,
            },
          },
        },
        children,
      },
    ],
  })
}

export async function renderCvDocxBlob(cv: CvDocument): Promise<Blob> {
  return Packer.toBlob(createCvDocx(cv))
}

export async function renderCvDocxBuffer(cv: CvDocument): Promise<Uint8Array> {
  const buffer = await Packer.toBuffer(createCvDocx(cv))
  return new Uint8Array(buffer)
}
