function fileStem(value: string): string {
  const safe = value
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
  return (safe || 'Spes-draft').slice(0, 80)
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

function paragraphs(text: string): string[] {
  return text.replace(/\r\n/g, '\n').split('\n')
}

export function draftFileName(
  label: string,
  company: string,
  title: string,
  extension: 'docx' | 'pdf',
): string {
  return `${fileStem(`${label}-${company || title}`)}.${extension}`
}

export async function downloadDraftDocx(
  text: string,
  filename: string,
): Promise<void> {
  const { Document, Packer, Paragraph, TextRun } = await import('docx')
  const children = paragraphs(text).map(
    (line) =>
      new Paragraph({
        spacing: { after: 120 },
        children: [
          new TextRun({
            text: line.length > 0 ? line : ' ',
            font: 'Calibri',
            size: 22,
          }),
        ],
      }),
  )
  const doc = new Document({
    sections: [
      {
        properties: {},
        children:
          children.length > 0
            ? children
            : [new Paragraph({ children: [new TextRun(' ')] })],
      },
    ],
  })
  const blob = await Packer.toBlob(doc)
  saveBlob(blob, filename)
}

export async function downloadDraftPdf(
  text: string,
  filename: string,
): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const margin = 48
  const maxWidth = doc.internal.pageSize.getWidth() - margin * 2
  const pageHeight = doc.internal.pageSize.getHeight()
  const lineHeight = 16
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  const lines = doc.splitTextToSize(text, maxWidth) as string[]
  let y = margin
  for (const line of lines) {
    if (y + lineHeight > pageHeight - margin) {
      doc.addPage()
      y = margin
    }
    doc.text(line, margin, y)
    y += lineHeight
  }
  saveBlob(doc.output('blob'), filename)
}
