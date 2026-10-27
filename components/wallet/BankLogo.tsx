import React, { useState } from 'react';
import { Landmark } from 'lucide-react';
import { resolveBankLogo } from '../../utils/bankLogoRegistry';

type Props = {
  name?: string | null;
  alternateName?: string | null;
  customImage?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  style?: React.CSSProperties;
};
const sizes = { sm: 'h-8 w-8', md: 'h-11 w-11', lg: 'h-14 w-14' };
export const BankLogo: React.FC<Props> = ({ name, alternateName, customImage, size = 'md', className = '', style }) => {
  const [failed, setFailed] = useState(false);
  const localLogo = resolveBankLogo(name === 'Bradescard' ? 'Bradesco' : name, alternateName);
  const url = customImage || localLogo;
  const fallbackName = String(name || alternateName || 'Banco').trim();
  const initials = fallbackName.split(/\s+/).filter(Boolean).slice(0, 2).map(t => t[0]).join('').toUpperCase();
  return (
    <div
      style={style}
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-700/60 bg-slate-800 ${sizes[size]} ${className}`}
    >
      {url && !failed ? (
        <img
          src={url}
          alt={`Logo de ${fallbackName}`}
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-contain p-0.5"
        />
      ) : initials ? (
        <span className="text-xs font-extrabold text-emerald-200">{initials}</span>
      ) : (
        <Landmark size={18} className="text-emerald-400" />
      )}
    </div>
  );
};
