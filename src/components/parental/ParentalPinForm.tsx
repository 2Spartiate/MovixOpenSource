import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { changeParentalPin, createParentalPin, isValidParentalPin, verifyParentalPin } from '@/utils/parentalControls';

type PinMode = 'create' | 'unlock' | 'change';
interface Props { mode: PinMode; onSuccess: () => void; onCancel: () => void; handleTvBack?: boolean }
type PinField = 'current' | 'next' | 'confirm';

export function ParentalPinForm({ mode, onSuccess, onCancel, handleTvBack = true }: Props) {
  const { t } = useTranslation();
  const [values, setValues] = useState<Record<PinField, string>>({ current: '', next: '', confirm: '' });
  const [activeField, setActiveField] = useState<PinField>(mode === 'create' ? 'next' : 'current');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isTV = typeof window !== 'undefined' && Boolean((window as Window & { MOVIX_TV?: boolean }).MOVIX_TV);

  useEffect(() => {
    if (isTV && handleTvBack) inputRef.current?.focus();
  }, [isTV, handleTvBack, mode]);

  useEffect(() => {
    if (!isTV || !handleTvBack) return;
    const back = (event: Event) => { event.preventDefault(); onCancel(); };
    window.addEventListener('movix-tv-back', back);
    return () => window.removeEventListener('movix-tv-back', back);
  }, [isTV, handleTvBack, onCancel]);

  const update = (field: PinField, value: string) => {
    setValues(previous => ({ ...previous, [field]: value.replace(/\D/g, '').slice(0, 8) }));
    setError('');
  };
  const keypad = (digit: string) => {
    update(activeField, digit === 'backspace' ? values[activeField].slice(0, -1) : values[activeField] + digit);
  };
  const handleKeys = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); onCancel(); }
    if (isTV && event.target instanceof HTMLButtonElement && /^\d$/.test(event.key)) {
      event.preventDefault(); keypad(event.key);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if ((mode === 'create' || mode === 'change') && !isValidParentalPin(values.next)) {
      setError(t('settings.parental.pinLength')); return;
    }
    if (mode !== 'unlock' && values.next !== values.confirm) {
      setError(t('settings.parental.pinMismatch')); return;
    }
    setBusy(true);
    try {
      const success = mode === 'create'
        ? await createParentalPin(values.next, values.confirm)
        : mode === 'change'
          ? await changeParentalPin(values.current, values.next, values.confirm)
          : await verifyParentalPin(values.current);
      if (success) {
        setValues({ current: '', next: '', confirm: '' });
        onSuccess();
      } else {
        setError(t(mode === 'create' ? 'settings.parental.pinCreateError' : 'settings.parental.pinWrong'));
        setValues({ current: '', next: '', confirm: '' });
      }
    } catch {
      setError(t('settings.parental.pinStorageError'));
    } finally { setBusy(false); }
  };

  const fields: Array<{ key: PinField; label: string }> = mode === 'create'
    ? [{ key: 'next', label: t('settings.parental.newPin') }, { key: 'confirm', label: t('settings.parental.confirmPin') }]
    : mode === 'change'
      ? [{ key: 'current', label: t('settings.parental.currentPin') }, { key: 'next', label: t('settings.parental.newPin') }, { key: 'confirm', label: t('settings.parental.confirmPin') }]
      : [{ key: 'current', label: t('settings.parental.enterPin') }];

  return (
    <form data-parental-pin-keypad onSubmit={submit} onKeyDown={handleKeys} className="space-y-4">
      <p className="text-sm text-gray-400">{t(mode === 'create' ? 'settings.parental.createHint' : mode === 'change' ? 'settings.parental.changeHint' : 'settings.parental.unlockHint')}</p>
      {fields.map(({ key, label }, index) => (
        <label key={key} className="block text-sm font-medium text-gray-200">
          {label}
          <input
            ref={index === 0 ? inputRef : undefined}
            data-tv-parental-pin-input=""
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            maxLength={8}
            value={values[key]}
            onChange={event => update(key, event.target.value)}
            onFocus={() => setActiveField(key)}
            className="mt-1 block w-full rounded-xl border border-gray-600 bg-gray-950 px-4 py-3 text-white outline-none focus-visible:border-red-400 focus-visible:ring-2 focus-visible:ring-red-400"
          />
        </label>
      ))}
      {isTV && (
        <div className="grid max-w-xs grid-cols-3 gap-2" aria-label={t('settings.parental.keypad')}>
          {'123456789'.split('').concat(['', '0', 'backspace']).map((digit, index) => digit ? (
            <button key={digit} type="button" onClick={() => keypad(digit)} aria-label={digit === 'backspace' ? t('settings.parental.erase') : digit}
              className="rounded-lg border border-gray-600 bg-gray-800 p-3 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400">
              {digit === 'backspace' ? '⌫' : digit}
            </button>
          ) : <span key={index} />)}
        </div>
      )}
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={busy} className="rounded-xl bg-red-600 px-5 py-3 font-semibold text-white hover:bg-red-500 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
          {busy ? t('settings.parental.checking') : t('settings.parental.confirm')}
        </button>
        <button type="button" onClick={onCancel} className="rounded-xl border border-gray-600 px-5 py-3 text-gray-200 hover:bg-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400">
          {t('settings.parental.cancel')}
        </button>
      </div>
    </form>
  );
}
