export const FREE_TIER_SECONDS = 120

const USED_KEY = 'pt.freeSecondsUsed'
const SUB_KEY = 'pt.isSubscribed'
const PLAN_KEY = 'pt.plan'

export type Plan = 'monthly' | 'yearly'

export function getFreeSecondsUsed(): number {
  const raw = localStorage.getItem(USED_KEY)
  const n = raw ? parseFloat(raw) : 0
  return Number.isFinite(n) ? n : 0
}

export function addFreeSecondsUsed(seconds: number) {
  localStorage.setItem(USED_KEY, String(getFreeSecondsUsed() + seconds))
}

export function getFreeSecondsRemaining(): number {
  return Math.max(0, FREE_TIER_SECONDS - getFreeSecondsUsed())
}

export function isSubscribed(): boolean {
  return localStorage.getItem(SUB_KEY) === 'true'
}

export function getPlan(): Plan | null {
  const v = localStorage.getItem(PLAN_KEY)
  return v === 'monthly' || v === 'yearly' ? v : null
}

export function markSubscribed(plan: Plan) {
  localStorage.setItem(SUB_KEY, 'true')
  localStorage.setItem(PLAN_KEY, plan)
}

export function clearSubscription() {
  localStorage.removeItem(SUB_KEY)
  localStorage.removeItem(PLAN_KEY)
}

export function resetFreeUsage() {
  localStorage.removeItem(USED_KEY)
}
