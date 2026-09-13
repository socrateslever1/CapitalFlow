import React from 'react';
import { SystemBackButton } from '../components/ui/SystemBackButton';
import { usePageBack } from '../contexts/PageBackContext';
import { isAppleMobile } from '../utils/appleMobile';

export function ApplePageBackBar({ onBack, isHome }: { onBack?: () => void; isHome: boolean }) {
  const pageBack = usePageBack();
  if (!isAppleMobile() || (!pageBack?.action && (isHome || !onBack))) return null;
  return (
    <nav aria-label="Retorno da página" className="shrink-0 border-b border-slate-800 bg-slate-950 px-4 py-2">
      <SystemBackButton local onClick={pageBack?.action?.onClick || onBack} disabled={pageBack?.action?.disabled} />
    </nav>
  );
}
