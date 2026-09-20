import type { WrappedVersion } from '@/types/wrapped';

/** En janvier, la campagne annuelle reste celle de l'année terminée. */
export function defaultWrappedYear(now = new Date()): number {
    return Math.max(2024, now.getFullYear() - (now.getMonth() === 0 ? 1 : 0));
}

/** Sélection explicite par URL ; aucune affectation aléatoire ni persistance. */
export function getWrappedExperiment(search: string): { test: boolean; version: WrappedVersion } {
    const params = new URLSearchParams(search);
    return {
        test: params.get('test') === 'true',
        version: params.get('version')?.toUpperCase() === 'A' ? 'A' : 'B',
    };
}

export function isWrappedTestRoute(pathname: string, search: string): boolean {
    return /^\/wrapped(?:\/[^/]+)?\/?$/.test(pathname) && getWrappedExperiment(search).test;
}
