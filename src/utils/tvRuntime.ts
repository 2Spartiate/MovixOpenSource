/**
 * Frontend-side view of the explicit Android/Google TV runtime contract.
 *
 * The Android shell injects window.MOVIX_TV=true before the main document
 * executes. Keep this separate from VIP/ad-unlock state: television is a
 * platform mode, not a monetization entitlement.
 */
export const isMovixTvRuntime = (): boolean =>
  typeof window !== 'undefined'
  && (window as Window & { MOVIX_TV?: boolean }).MOVIX_TV === true;
