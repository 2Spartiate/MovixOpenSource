import type { WrappedTopContent } from '@/services/wrappedService';

export type WrappedScene = 'intro' | 'time' | 'timeline' | 'genres' | 'quiz' | 'favorite' | 'top-five' | 'rhythm' | 'community' | 'persona' | 'closing' | 'race' | 'eras' | 'awards';
export type WrappedVersion = 'A' | 'B';
export type WrappedShareFormat = 'story' | 'top-five' | 'poster' | 'ticket';

export interface WrappedShareCardData {
    year: number;
    domain: string;
    backdropUrl?: string | null;
    period?: string;
    watchTime: string;
    watchTimeParts: string[];
    titleCount: string;
    persona: string;
    traits?: { label: string; evidence: string }[];
    signature: number[];
    signatureCaption: string;
    signatureFutureFrom: number | null;
    items: Array<Pick<WrappedTopContent, 'title'> & { posterUrl: string | null; duration: string }>;
    labels: {
        heading: string;
        favorite: string;
        watchTime: string;
        titles: string;
        persona: string;
        topFive: string;
        ticket: string;
        imageUnavailable: string;
        signature: string;
    };
}

export interface WrappedSession {
    token: string | null;
    profileId: string | null;
    collectionEnabled: boolean;
}
