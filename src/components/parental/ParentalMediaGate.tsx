import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LockKeyhole } from 'lucide-react';
import { useProfile } from '@/context/ProfileContext';
import { getTmdbId } from '@/utils/idEncoder';
import { getParentalPreferences, isMediaUnlocked, PARENTAL_CHANGED_EVENT, unlockMedia } from '@/utils/parentalControls';
import { getParentalMediaMetadata } from '@/utils/parentalMedia';
import { decideMediaAccess, type ParentalMediaMetadata, type ParentalMediaType } from '@/utils/parentalPolicy';
import { ParentalPinForm } from './ParentalPinForm';

export function ParentalMediaGate({ mediaType, children }: { mediaType: ParentalMediaType; children: ReactNode }) {
  const params = useParams();
  const rawId = params.id || params.tmdbid || '';
  const tmdbId = getTmdbId(rawId);
  const mediaId = tmdbId ? Number(tmdbId) : NaN;
  const mediaKey = `${mediaType}:${tmdbId}`;
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { currentProfile } = useProfile();
  const profileAge = currentProfile?.ageRestriction ?? 0;
  const [prefs, setPrefs] = useState(getParentalPreferences);
  const [metadata, setMetadata] = useState<ParentalMediaMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [unlocked, setUnlocked] = useState(() => isMediaUnlocked(mediaKey));

  useEffect(() => {
    const refresh = () => setPrefs(getParentalPreferences());
    window.addEventListener(PARENTAL_CHANGED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener(PARENTAL_CHANGED_EVENT, refresh); window.removeEventListener('storage', refresh); };
  }, []);

  useEffect(() => {
    if (!prefs.enabled && profileAge <= 0) { setLoading(false); return; }
    if (!Number.isSafeInteger(mediaId) || mediaId <= 0) { setLoading(false); return; }
    let live = true;
    setLoading(true);
    getParentalMediaMetadata(mediaType, mediaId).then(value => {
      if (live) { setMetadata(value); setLoading(false); }
    }, () => {
      if (live) { setMetadata(null); setLoading(false); }
    });
    return () => { live = false; };
  }, [prefs.enabled, profileAge, mediaId, mediaType]);

  const back = useCallback(() => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/', { replace: true });
  }, [navigate]);

  if (!prefs.enabled && profileAge <= 0) return <>{children}</>;
  if (loading) return <div className="flex min-h-[70vh] items-center justify-center text-gray-300" role="status">{t('settings.parental.checkingMedia')}</div>;

  const decision = decideMediaAccess(prefs, metadata ?? { mediaType, id: mediaId, age: null, genres: null, keywords: null }, profileAge);
  // Profile restrictions always win; a parental PIN cannot override them.
  if (decision.kind === 'profile') {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-5 px-4 text-center text-white">
        <LockKeyhole className="h-12 w-12 text-red-400" />
        <h2 className="text-2xl font-bold">{t('details.contentBlocked')}</h2>
        <p className="text-gray-400">{t('settings.parental.profileRestriction')}</p>
        <button onClick={back} className="rounded-xl bg-red-600 px-5 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">{t('details.goBack')}</button>
      </div>
    );
  }

  if (decision.kind === 'allowed' || unlocked) return <>{children}</>;

  return (
    <div className="relative flex min-h-[75vh] items-center justify-center overflow-hidden bg-black px-4 py-12 text-white">
      {metadata?.backdropPath && <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-20 blur-sm" style={{ backgroundImage: `url(https://image.tmdb.org/t/p/w1280${metadata.backdropPath})` }} />}
      <div role="dialog" aria-modal="true" aria-labelledby="parental-media-title" data-tv-manage-autofocus
        className="relative z-10 w-full max-w-md rounded-2xl border border-red-500/30 bg-gray-900 p-5 shadow-2xl sm:p-7">
        <LockKeyhole className="mb-4 h-9 w-9 text-red-400" />
        <h2 id="parental-media-title" className="mb-2 text-2xl font-bold">{t('settings.parental.agreementRequired')}</h2>
        {metadata?.title && <p className="mb-3 text-sm text-gray-300">{metadata.title}</p>}
        <ParentalPinForm mode="unlock" onCancel={back} onSuccess={() => { unlockMedia(mediaKey); setUnlocked(true); }} />
      </div>
    </div>
  );
}
