import { emptyDraft, type CaptureDraft } from '../lib/capture'
import { firstInnerText, firstText, metaContent } from './dom'

const TITLE_SELECTORS = [
  '[data-testid="simpler-jobTitle"]',
  '[data-testid="jobsearch-JobInfoHeader-title"]',
  'h2.jobsearch-JobInfoHeader-title',
  'h1.jobsearch-JobInfoHeader-title',
  '.jobsearch-JobInfoHeader-title',
  'h1',
]

const COMPANY_SELECTORS = [
  '[data-testid="inlineHeader-companyName"]',
  '[data-company-name="true"]',
  '.jobsearch-InlineCompanyRating-companyHeader a',
  '.jobsearch-InlineCompanyRating-companyHeader',
  '[data-testid="jobsearch-CompanyInfoContainer"] a',
]

const DESCRIPTION_SELECTORS = [
  '#jobDescriptionText',
  '#job-description',
  '[data-testid="jobsearch-JobComponent-description"]',
  '.jobsearch-JobComponent-description',
]

export function isIndeedJobPage(): boolean {
  const path = location.pathname
  return (
    path.includes('/viewjob') ||
    path.includes('/jobs/view') ||
    path.includes('/rc/clk') ||
    new URLSearchParams(location.search).has('jk')
  )
}

export function parseIndeedJob(): CaptureDraft {
  let title = firstInnerText(TITLE_SELECTORS) || firstText(TITLE_SELECTORS)
  let company = firstInnerText(COMPANY_SELECTORS) || firstText(COMPANY_SELECTORS)
  const description =
    firstInnerText(DESCRIPTION_SELECTORS) || firstText(DESCRIPTION_SELECTORS)

  if (!title) {
    title = metaContent('og:title')
      .replace(/\s*[-|]\s*Indeed.*$/i, '')
      .trim()
  }
  if (!company) {
    const cleaned = document.title.replace(/\s*\|\s*Indeed.*$/i, '')
    const dash = cleaned.split(/\s+-\s+/)
    if (dash.length >= 2) {
      title = title || dash[0]?.trim() || ''
      company = dash[1]?.trim() ?? ''
    }
  }

  return emptyDraft({
    source: 'indeed',
    url: location.href,
    title,
    company,
    description,
  })
}
