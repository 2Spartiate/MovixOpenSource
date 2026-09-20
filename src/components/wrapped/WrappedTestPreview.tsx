import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { createWrappedTestData } from '@/data/wrappedTestData';
import type { WrappedVersion } from '@/types/wrapped';
import WrappedRenderer from './WrappedRenderer';

export default function WrappedTestPreview({ year, version, onClose }: { year: number; version: WrappedVersion; onClose: () => void }) {
    const { t, i18n } = useTranslation();
    const data = useMemo(() => createWrappedTestData(year, i18n.language, t), [year, i18n.language, t]);

    return <div className="contents" data-wrapped-test="true">
        <WrappedRenderer data={data} version={version} onClose={onClose} />
    </div>;
}
