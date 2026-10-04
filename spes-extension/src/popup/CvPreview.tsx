import {
  companyLine,
  contactLine,
  CV_SECTION,
  formatDateRange,
  type CvDocument,
} from '../lib/cv/document'
import { CV_STYLE } from '../lib/cv/template'

interface CvPreviewProps {
  cv: CvDocument
}

function Heading({ children }: { children: string }) {
  return (
    <h4
      style={{
        fontSize: `${CV_STYLE.headingPt}pt`,
        borderBottom: `${CV_STYLE.rulePt}pt solid #111`,
        marginTop: `${CV_STYLE.spaceBeforeHeadingPt}pt`,
        marginBottom: `${CV_STYLE.spaceAfterRulePt}pt`,
        paddingBottom: '1px',
      }}
    >
      {children}
    </h4>
  )
}

function Spread({ left, right }: { left: string; right: string }) {
  return (
    <div className="cv-spread">
      <strong>{left}</strong>
      {right ? <span className="cv-dates">{right}</span> : null}
    </div>
  )
}

export function CvPreview({ cv }: CvPreviewProps) {
  const contact = contactLine(cv.contact)
  return (
    <article
      className="cv-preview"
      style={{
        fontFamily: CV_STYLE.previewFont,
        fontSize: `${CV_STYLE.bodyPt}pt`,
        lineHeight: CV_STYLE.lineHeight,
      }}
    >
      {cv.name ? (
        <h3
          style={{
            fontSize: `${CV_STYLE.namePt}pt`,
            lineHeight: CV_STYLE.lineHeight,
            marginBottom: `${CV_STYLE.afterNamePt}pt`,
          }}
        >
          {cv.name}
        </h3>
      ) : null}
      {contact ? (
        <p
          className="cv-contact"
          style={{ fontSize: `${CV_STYLE.contactPt}pt` }}
        >
          {contact}
        </p>
      ) : null}
      {cv.summary ? (
        <section>
          <Heading>{CV_SECTION.summary}</Heading>
          <p>{cv.summary}</p>
        </section>
      ) : null}
      {cv.skills.length > 0 ? (
        <section>
          <Heading>{CV_SECTION.skills}</Heading>
          {cv.skills.map((group) => (
            <p key={`${group.category}:${group.items.join(',')}`}>
              {group.category ? <strong>{group.category}: </strong> : null}
              {group.items.join(', ')}
            </p>
          ))}
        </section>
      ) : null}
      {cv.experience.length > 0 ? (
        <section>
          <Heading>{CV_SECTION.experience}</Heading>
          {cv.experience.map((entry) => {
            const company = companyLine(entry.company, entry.location)
            return (
              <div
                className="cv-role"
                key={`${entry.title}-${entry.company}-${entry.start}`}
              >
                <Spread
                  left={entry.title}
                  right={formatDateRange(entry.start, entry.end)}
                />
                {company ? <p className="cv-meta">{company}</p> : null}
                {entry.bullets.length > 0 ? (
                  <ul style={{ paddingLeft: `${CV_STYLE.bulletIndentPt}pt` }}>
                    {entry.bullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )
          })}
        </section>
      ) : null}
      {cv.education.length > 0 ? (
        <section>
          <Heading>{CV_SECTION.education}</Heading>
          {cv.education.map((entry) => (
            <div
              className="cv-school"
              key={`${entry.institution}-${entry.qualification}-${entry.start}`}
            >
              <Spread
                left={entry.institution}
                right={formatDateRange(entry.start, entry.end)}
              />
              {entry.qualification ? <p>{entry.qualification}</p> : null}
              {entry.details ? <p>{entry.details}</p> : null}
            </div>
          ))}
        </section>
      ) : null}
    </article>
  )
}
