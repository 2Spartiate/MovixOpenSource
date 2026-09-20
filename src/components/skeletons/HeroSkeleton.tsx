import React from 'react';
import { Skeleton } from '@/components/ui/Skeleton';
import { useLightMode } from '@/context/LightModeContext';
import { LightweightLoading } from '@/components/LightweightLoading';

const HeroSkeleton: React.FC = () => {
  const { isLightMode } = useLightMode();
  if (isLightMode) return <LightweightLoading className="min-h-[340px] sm:min-h-[400px] md:min-h-[480px]" />;
  return (
    <div className="embla relative w-full select-none px-3 sm:px-6 md:px-12 lg:px-20 mx-auto max-w-[1920px] animate-skeleton-fade">
      <div
        className="relative w-full rounded-2xl sm:rounded-3xl overflow-hidden border border-white/10 shadow-2xl min-h-[340px] sm:min-h-[400px] md:min-h-[480px]"
        style={{ height: 'min(55svh, 620px)' }}
      >
        {/* Backdrop skeleton */}
        <div className="absolute inset-0 z-0">
          <Skeleton width="100%" height="100%" />
        </div>

        {/* Static gradient overlays (chrome reproduced) */}
        <div
          className="absolute inset-0 z-10 pointer-events-none"
          style={{
            background: `
              linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.55) 35%, rgba(0,0,0,0.15) 65%, transparent 100%),
              linear-gradient(to right, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.35) 30%, rgba(0,0,0,0.05) 60%, transparent 100%)
            `,
          }}
        />

        {/* Content block */}
        <div className="absolute inset-0 flex items-end md:items-center z-20">
          <div className="w-full md:max-w-2xl px-4 sm:px-6 md:px-12 pb-20 md:pb-16">
            <div className="space-y-3 sm:space-y-5">
              {/* Badges (2 pills) */}
              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                <Skeleton variant="pill" width={80} height={28} />
                <Skeleton variant="pill" width={70} height={28} />
              </div>

              {/* Logo / title placeholder (block matching min-h responsive) */}
              <div className="min-h-[56px] sm:min-h-[80px] md:min-h-[110px] flex items-end">
                <div className="w-2/3 h-[56px] sm:h-[80px] md:h-[110px]">
                  <Skeleton width="100%" height="100%" />
                </div>
              </div>

              {/* Overview (1 line) */}
              <div className="max-w-xl space-y-2">
                <Skeleton variant="text" height={14} width="75%" />
              </div>

              {/* Buttons (1 CTA) */}
              <div className="flex flex-wrap gap-2 sm:gap-3 pt-1">
                <Skeleton variant="button" width={144} height={48} />
              </div>
            </div>
          </div>
        </div>

        {/* Bottom controls (dots + progress bar pill) */}
        <div className="absolute bottom-3 sm:bottom-4 md:bottom-6 left-0 right-0 z-30 flex items-center justify-center gap-4 px-3 sm:px-6 pointer-events-none">
          <div className="flex items-center gap-2 sm:gap-3 bg-black/40 backdrop-blur-xl border border-white/10 rounded-full px-3 sm:px-4 py-1.5 sm:py-2">
            {/* Progress bar (empty container, no skeleton inside) */}
            <div className="w-12 sm:w-20 h-1 bg-white/15 rounded-full overflow-hidden" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default HeroSkeleton;
