import { emptyDraft, type CaptureDraft } from '../lib/capture'
import { firstInnerText, firstText, metaContent } from './dom'

const TITLE_SELECTORS = [
  '.job-details-jobs-unified-top-card__job-title',
  '.jobs-unified-top-card__job-title',
  'h1.t-24',
  'h1.top-card-layout__title',
  'h1',
]

const COMPANY_SELECTORS = [
  '.job-details-jobs-unified-top-card__company-name a',
  '.job-details-jobs-unified-top-card__company-name',
  '.jobs-unified-top-card__company-name a',
  '.jobs-unified-top-card__company-name',
  'a.topcard__org-name-link',
  '.topcard__org-name-link',
]

const DESCRIPTION_SELECTORS = [
  '[componentkey^="JobDetails_AboutTheJob"]',
  '.jobs-description__content',
  '#job-details',
  '.jobs-box__html-content',
  'div.show-more-less-html__markup',
  '.jobs-description-content__text',
]

export function isLinkedInJobPage(): boolean {
  return /\/jobs\//.test(location.pathname)
}

export function parseLinkedInJob(): CaptureDraft {
  let title = firstInnerText(TITLE_SELECTORS) || firstText(TITLE_SELECTORS)
  let company = firstInnerText(COMPANY_SELECTORS) || firstText(COMPANY_SELECTORS)
  const description =
    firstInnerText(DESCRIPTION_SELECTORS) || firstText(DESCRIPTION_SELECTORS)

  if (!title) {
    title = metaContent('og:title').replace(/\s*\|\s*LinkedIn\s*$/i, '')
  }
  if (!company) {
    const cleaned = document.title.replace(/\s*\|\s*LinkedIn\s*$/i, '')
    const parts = cleaned.split(/\s*\|\s*/)
    if (parts.length >= 2) {
      company = parts[1]?.trim() ?? ''
      if (!title) {
        title = parts[0]?.trim() ?? ''
      }
    }
  }

  return emptyDraft({
    source: 'linkedin',
    url: location.href,
    title,
    company,
    description,
  })
}
