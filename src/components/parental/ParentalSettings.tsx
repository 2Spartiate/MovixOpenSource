import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LockKeyhole, Minus, Plus } from 'lucide-react';
import { ParentalPinForm } from './ParentalPinForm';
import { getParentalPreferences, hasParentalPin, MAX_PARENTAL_AGE, MIN_PARENTAL_AGE, setParentalPreferences, type ParentalPreferences } from '@/utils/parentalControls';

export function ParentalSettings({ active, onCancel }: { active: boolean; onCancel: () => void }) {
  const { t } = useTranslation();
  const [hasPin, setHasPin] = useState(() => hasParentalPin());
  const [unlocked, setUnlocked] = useState(false);
  const [changing, setChanging] = useState(false);
  const [prefs, setPrefs] = useState<ParentalPreferences>(() => getParentalPreferences());
  const [error, setError] = useState('');

  useEffect(() => { if (!active) { setUnlocked(false); setChanging(false); } }, [active]);
  const save = (next: ParentalPreferences) => {
    try { setParentalPreferences(next); setPrefs(getParentalPreferences()); setError(''); }
    catch { setError(t('settings.parental.pinStorageError')); }
  };
  const signedIn = () => {
    setHasPin(true);
    setPrefs(getParentalPreferences());
    setUnlocked(true);
    setChanging(false);
  };
  const toggle = (name: 'enabled' | 'lockHorror' | 'animeHome') => save({ ...prefs, [name]: !prefs[name] });

  return (
    <div className="rounded-xl border border-gray-700/40 bg-gray-800/30 p-4 sm:p-6">
      {!unlocked ? (
        <ParentalPinForm key={hasPin ? 'unlock' : 'create'} mode={hasPin ? 'unlock' : 'create'} onSuccess={signedIn} onCancel={onCancel} handleTvBack={active} />
      ) : changing ? (
        <ParentalPinForm mode="change" onSuccess={() => setChanging(false)} onCancel={() => setChanging(false)} handleTvBack={active} />
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">{t('settings.parental.deviceOnly')}</p>
          <label className="flex items-center justify-between gap-4 rounded-xl border border-gray-700/40 bg-black/20 p-4 text-sm text-white">
            <span>{t('settings.parental.enabled')}</span>
            <input type="checkbox" checked={prefs.enabled} onChange={() => toggle('enabled')} className="h-5 w-5 accent-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400" />
          </label>
          <div className={`rounded-xl border border-gray-700/40 bg-black/20 p-4 ${!prefs.enabled ? 'opacity-50' : ''}`}>
            <span className="text-sm text-white">{t('settings.parental.ageLimit', { age: prefs.maximumAge })}</span>
            <div className="mt-3 flex items-center gap-3">
              <button type="button" aria-label={t('settings.parental.decreaseAge')} disabled={!prefs.enabled || prefs.maximumAge === MIN_PARENTAL_AGE}
                onClick={() => save({ ...prefs, maximumAge: prefs.maximumAge - 1 })}
                className="rounded-lg border border-gray-600 p-3 text-white disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400"><Minus className="h-4 w-4" /></button>
              <output className="min-w-12 text-center font-semibold text-white" aria-live="polite">{prefs.maximumAge}</output>
              <button type="button" aria-label={t('settings.parental.increaseAge')} disabled={!prefs.enabled || prefs.maximumAge === MAX_PARENTAL_AGE}
                onClick={() => save({ ...prefs, maximumAge: prefs.maximumAge + 1 })}
                className="rounded-lg border border-gray-600 p-3 text-white disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400"><Plus className="h-4 w-4" /></button>
              <span className="text-xs text-gray-400">{MIN_PARENTAL_AGE}–{MAX_PARENTAL_AGE} {t('settings.parental.years')}</span>
            </div>
          </div>
          {(['lockHorror', 'animeHome'] as const).map(name => (
            <label key={name} className={`flex items-center justify-between gap-4 rounded-xl border border-gray-700/40 bg-black/20 p-4 text-sm text-white ${!prefs.enabled ? 'opacity-50' : ''}`}>
              <span>{t(`settings.parental.${name}`)}</span>
              <input type="checkbox" disabled={!prefs.enabled} checked={prefs[name]} onChange={() => toggle(name)} className="h-5 w-5 accent-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400" />
            </label>
          ))}
          <button type="button" onClick={() => setChanging(true)} className="flex items-center gap-2 rounded-xl border border-gray-600 px-4 py-3 text-sm text-white hover:bg-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400">
            <LockKeyhole className="h-4 w-4" />{t('settings.parental.changePin')}
          </button>
          {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        </div>
      )}
    </div>
  );
}
