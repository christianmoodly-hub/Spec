import type { ApplicationStatus } from '../types'
import { APPLICATION_STATUSES } from '../types'

export { APPLICATION_STATUSES }

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  'to-apply': 'To apply',
  applied: 'Applied',
  interview: 'Interview',
  rejected: 'Rejected',
  offer: 'Offer',
}
