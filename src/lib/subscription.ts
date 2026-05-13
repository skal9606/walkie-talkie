export type Plan = 'monthly' | 'yearly'

/** Free trial cap per user, in seconds. Matches lib/constants.ts (server) and iOS Config.trialSeconds. */
export const FREE_TIER_SECONDS = 600
