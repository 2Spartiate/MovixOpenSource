import type { WrappedTopContent } from '@/services/wrappedService';

export interface WrappedStoryData {
    race: { items: WrappedTopContent[]; months: { month: number; minutes: number[] }[] } | null;
    eras: { fromMonth: number; toMonth: number; kind: 'genre' | 'format'; label: string; share: number; coverage: number; title: WrappedTopContent }[];
    formatWinners: WrappedTopContent[];
}

export interface WrappedCommentHighlight {
    id: number;
    content: string;
    createdAt: number;
    isSpoiler: boolean;
    reactions: number;
    replies: number;
    reason: 'reactions' | 'replies';
    type: 'movie' | 'tv' | 'anime';
    tmdbId: number;
    title: string;
    poster_path: string | null;
}
