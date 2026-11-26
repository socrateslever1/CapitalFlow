import React, { useEffect, useState } from 'react';
import { Landmark } from 'lucide-react';
import { resolveBankLogoDisplay } from '../../utils/bankLogoRegistry';

type Props = {
  name?: string | null;
  alternateName?: string | null;
  customImage?: string | null;
  size?: 'xs' | 'sm' | 'card' | 'md' | 'lg';
  /** emblem: selo pequeno e discreto sobre a cor do cartão. */
  variant?: 'default' | 'card' | 'emblem';
  className?: string;
  style?: React.CSSProperties;
};
const sizes = { xs: 'h-7 w-7', sm: 'h-8 w-8', card: 'h-9 w-9', md: 'h-11 w-11', lg: 'h-14 w-14' };
export const BankLogo: React.FC<Props> = ({ name, alternateName, customImage, size = 'md', variant = 'default', className = '', style }) => {
  const [customFailed, setCustomFailed] = useState(false);
  const [localFailed, setLocalFailed] = useState(false);
  const display = resolveBankLogoDisplay(name === 'Bradescard' ? 'Bradesco' : name, alternateName);
  const localLogo = display?.url || null;

  useEffect(() => { setCustomFailed(false); }, [customImage]);
  useEffect(() => { setLocalFailed(false); }, [localLogo]);

  const usingCustom = Boolean(customImage && !customFailed);
  const url = usingCustom ? customImage! : (!localFailed ? localLogo : null);
  const fallbackName = String(name || alternateName || 'Banco').trim();
  const initials = fallbackName.split(/\s+/).filter(Boolean).slice(0, 2).map(t => t[0]).join('').toUpperCase();
  const isCard = variant === 'card';
  // Logo em bloco preenche o quadro; logo só com símbolo vai sobre fundo claro (o C6 e o Nubank somem no escuro).
  const localTile = !usingCustom && Boolean(url) && display?.tile !== false;
  const localGlyph = !usingCustom && Boolean(url) && display?.tile === false;
  const frame = variant === 'emblem' ? 'rounded-md bg-white/95 shadow-sm'
    : isCard ? `rounded-lg border-2 border-white ${localGlyph ? 'bg-white' : 'bg-slate-950'}`
      : localGlyph ? 'rounded-xl bg-white shadow-sm ring-1 ring-black/5'
        : localTile ? 'rounded-xl shadow-sm' : 'rounded-xl border border-slate-700/60 bg-slate-800';
  return (
    <div
      style={style}
      className={`relative flex shrink-0 items-center justify-center overflow-hidden ${frame} ${sizes[size]} ${className}`}
    >
      {url ? (
        <img
          src={url}
          alt={`Logo de ${fallbackName}`}
          loading="lazy"
          onError={() => {
            if (usingCustom) setCustomFailed(true);
            else setLocalFailed(true);
          }}
          className={`h-full w-full ${localTile && variant !== 'emblem' ? 'object-cover' : 'object-contain'} ${usingCustom ? (variant === 'emblem' ? 'p-0.5' : 'p-1') : variant === 'emblem' ? 'p-0.5' : ''}`}
        />
      ) : initials ? (
        <span className="text-xs font-extrabold text-emerald-200">{initials}</span>
      ) : (
        <Landmark size={18} className="text-emerald-400" />
      )}
    </div>
  );
};
