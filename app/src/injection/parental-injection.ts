import { PARENTAL_RUNTIME_SOURCE } from './parental-runtime-source';

/** Source compiled at build time, so Hermes never stringifies a function. */
export function buildParentalControlsRuntime(): string {
  return PARENTAL_RUNTIME_SOURCE;
}
