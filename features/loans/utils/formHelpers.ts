
import { CapitalSource } from '../../../types';

/**
 * Retorna a data em formato YYYY-MM-DD respeitando o dia local do operador.
 */
export const safeIsoDateOnly = (val: string | undefined): string => {
    if (!val) {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    return val?.includes('T') ? val.split('T')[0] : val;
};

export const safeSourceId = (sources: CapitalSource[], requestedId?: string): string => {
    if (requestedId) return requestedId;
    if (sources && sources.length > 0) return sources[0].id;
    return '';
};

export const safeFileFirst = (files: FileList | null): File | null => {
    if (files && files.length > 0) {
        return files[0];
    }
    return null;
};
