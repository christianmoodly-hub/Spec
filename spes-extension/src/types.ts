export type ApplicationStatus =
  | 'to-apply'
  | 'applied'
  | 'interview'
  | 'rejected'
  | 'offer'

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

export interface Profile {
  baseCV: string
  reusableBullets: string[]
  displayName: string
}
