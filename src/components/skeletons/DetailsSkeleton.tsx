import React from 'react';
import { Skeleton } from '@/components/ui/Skeleton';
import { useLightMode } from '@/context/LightModeContext';
import { LightweightLoading } from '@/components/LightweightLoading';
import ContentRowSkeleton from './ContentRowSkeleton';

const DetailsSkeleton: React.FC = () => {
  const { isLightMode } = useLightMode();
  if (isLightMode) return <LightweightLoading className="min-h-[50vh]" />;
  return (
    <div className="min-h-screen bg-black text-white px-4 md:px-8 lg:px-16 py-6 animate-skeleton-fade">
      {/* Title block (matches h1.section-title text-4xl md:text-5xl + Released badge) */}
      <div className="mb-8 flex items-center gap-3">
        <Skeleton width="55%" height={48} />
        <Skeleton variant="pill" width={80} height={28} />
      </div>

      {/* Main content grid: 1 col left (poster) + 2 cols right (tabs/content) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Left column: Poster + WatchButtons stack */}
        <div className="space-y-6">
          <Skeleton variant="poster" width="100%" />
          <div className="space-y-3">
            <Skeleton variant="button" width="100%" height={48} />
            <Skeleton variant="button" width="100%" height={48} />
          </div>
        </div>

        {/* Right column (md:col-span-2): Tabs + content */}
        <div className="md:col-span-2 space-y-6">
          {/* Tabs row (overview / cast / similar / etc.) */}
          <div className="flex gap-6 border-b border-gray-700/40 pb-3">
            <Skeleton width={80} height={20} />
            <Skeleton width={70} height={20} />
            <Skeleton width={90} height={20} />
            <Skeleton width={60} height={20} />
          </div>

          {/* Overview text area */}
          <div className="space-y-3">
            <Skeleton variant="text" height={14} width="100%" />
            <Skeleton variant="text" height={14} width="100%" />
            <Skeleton variant="text" height={14} width="100%" />
            <Skeleton variant="text" height={14} width="70%" />
          </div>

          {/* Meta info pills (genres, runtime, rating, etc.) */}
          <div className="flex flex-wrap gap-3 pt-2">
            <Skeleton variant="pill" width={80} height={28} />
            <Skeleton variant="pill" width={100} height={28} />
            <Skeleton variant="pill" width={70} height={28} />
            <Skeleton variant="pill" width={90} height={28} />
          </div>

          {/* Director / cast brief block */}
          <div className="space-y-2 pt-2">
            <Skeleton width="40%" height={16} />
            <Skeleton width="60%" height={16} />
          </div>
        </div>
      </div>

      {/* Below-fold: Cast row + Recommendations row */}
      <div className="mt-12 space-y-8">
        <ContentRowSkeleton />
        <ContentRowSkeleton />
      </div>
    </div>
  );
};

export default DetailsSkeleton;
