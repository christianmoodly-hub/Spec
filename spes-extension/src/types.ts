export type ApplicationStatus =
  | 'to-apply'
  | 'applied'
  | 'interview'
  | 'rejected'
  | 'offer'

export const APPLICATION_STATUSES: ApplicationStatus[] = [
  'to-apply',
  'applied',
  'interview',
  'rejected',
  'offer',
]

export interface ApplicationItem {
  title: string
  company: string
  url: string
  description: string
  status: ApplicationStatus
  dueDate: string | null
  notes: string
  createdAt: string
  updatedAt: string
  cvVersionUsed?: string
  coverLetterVersionUsed?: string
}

export interface Application extends ApplicationItem {
  id: string
}

export type NewApplication = Omit<ApplicationItem, 'createdAt' | 'updatedAt'>

export type ApplicationPatch = Partial<Omit<ApplicationItem, 'createdAt'>>

export interface Streak {
  currentStreak: number
  lastActivityDate: string | null
  applicationsThisWeek: number
}

export interface ProfileAddress {
  street: string
  city: string
  stateProvince: string
  postalCode: string
  country: string
}

export interface ProfileStructuredFields {
  fullName: string
  email: string
  phone: string
  address: ProfileAddress
  linkedinUrl: string
  portfolioUrl: string
  workAuthorization: string
  yearsExperience: string
  salaryExpectation: string
  noticePeriod: string
  eeoAnswers: Record<string, string>
  customFields: Record<string, string>
}

export interface Profile {
  baseCV: string
  reusableBullets: string[]
  displayName: string
  rawDump: string
  structuredFields: ProfileStructuredFields
  lastParsedFromDump: string | null
}

export type ProfilePatch = Partial<Profile>
