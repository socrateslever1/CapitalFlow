import React, { useState } from 'react';
import { Sparkles, Volume2, Check, X, Smile, Flame, DollarSign, AlertTriangle } from 'lucide-react';
import { REMINDER_THEMES, ReminderTheme, getThemeById } from '../themes/reminderThemes';
import { playThemeSound } from '../services/reminder.service';

interface ThemeSelectorProps {
  selectedThemeId?: string;
  onSelectTheme: (themeId?: string) => void;
}

export const ThemeSelector: React.FC<ThemeSelectorProps> = ({
  selectedThemeId,
  onSelectTheme,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('TODOS');

  const selectedTheme = getThemeById(selectedThemeId);

  const categories = [
    { id: 'TODOS', label: 'Todos os Memes' },
    { id: 'MEME_CLASSICO', label: '😂 Clássicos' },
    { id: 'COBRANCA', label: '💰 Cobrança' },
    { id: 'URGENCIA', label: '🚨 Urgência' },
    { id: 'CELEBRACAO', label: '🥂 Celebração' },
  ];

  const filteredThemes = REMINDER_THEMES.filter(t => {
    if (activeCategory === 'TODOS') return true;
    return t.category === activeCategory;
  });

  const handleTestSound = (e: React.MouseEvent, theme: ReminderTheme) => {
    e.stopPropagation();
    playThemeSound(theme.soundEffect);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
          <Sparkles size={14} className="text-amber-400" />
          <span>Tema & Meme de Alerta</span>
        </label>
        {selectedTheme && (
          <button
            type="button"
            onClick={() => onSelectTheme(undefined)}
            className="text-[10px] text-slate-400 hover:text-rose-400 font-bold uppercase tracking-wider transition-colors"
          >
            Remover Tema
          </button>
        )}
      </div>

      {/* Botão de Exibição / Seletor Ativo */}
      {selectedTheme ? (
        <div
          onClick={() => setIsOpen(!isOpen)}
          className={`cursor-pointer p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 bg-gradient-to-r ${selectedTheme.bgGradient} ${selectedTheme.borderColor}`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={selectedTheme.imageUrl}
              alt={selectedTheme.name}
              className="w-12 h-12 rounded-xl object-cover border border-white/20 shrink-0 shadow-md"
              onError={(e) => {
                // Fallback gracioso se a imagem não carregar
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
            <div className="min-w-0">
              <span className={`text-[10px] font-black uppercase tracking-wider block ${selectedTheme.accentTextColor}`}>
                {selectedTheme.badge}
              </span>
              <h4 className="text-sm font-black text-white truncate">
                {selectedTheme.name}
              </h4>
              <p className="text-[11px] text-slate-300 truncate italic">
                {selectedTheme.tagline}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={(e) => handleTestSound(e, selectedTheme)}
              className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-white border border-slate-700/80 transition-colors"
              title="Ouvir som do tema"
            >
              <Volume2 size={15} />
            </button>
            <span className="text-xs font-bold text-white bg-slate-900/60 px-2.5 py-1 rounded-lg border border-white/10">
              Trocar
            </span>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full py-2.5 px-3 rounded-2xl bg-slate-950 hover:bg-slate-800/80 border border-slate-800 hover:border-amber-500/50 text-slate-300 text-xs font-bold flex items-center justify-between transition-colors group"
        >
          <div className="flex items-center gap-2">
            <span className="text-base">🎭</span>
            <span>Escolher Meme ou Tema de Alerta</span>
          </div>
          <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider group-hover:underline">
            Ver Opções (+{REMINDER_THEMES.length})
          </span>
        </button>
      )}

      {/* Galeria de Temas Expansível */}
      {isOpen && (
        <div className="p-3 bg-slate-950 border border-slate-800 rounded-2xl space-y-3 animate-in fade-in duration-150">
          {/* Categorias */}
          <div className="flex items-center gap-1 overflow-x-auto hide-scrollbar pb-1">
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`px-2.5 py-1 rounded-xl text-[10px] font-bold whitespace-nowrap transition-colors ${
                  activeCategory === cat.id
                    ? 'bg-amber-500 text-slate-950 font-black'
                    : 'bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Grid de Memes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-64 overflow-y-auto pr-1">
            {filteredThemes.map((theme) => {
              const isSelected = selectedThemeId === theme.id;

              return (
                <div
                  key={theme.id}
                  onClick={() => {
                    onSelectTheme(theme.id);
                    setIsOpen(false);
                    playThemeSound(theme.soundEffect);
                  }}
                  className={`group relative cursor-pointer p-2.5 rounded-2xl border transition-all flex items-center gap-2.5 ${
                    isSelected
                      ? `bg-slate-900 ${theme.borderColor} shadow-lg ring-1 ring-amber-500`
                      : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                  }`}
                >
                  <img
                    src={theme.imageUrl}
                    alt={theme.name}
                    className="w-12 h-12 rounded-xl object-cover shrink-0 border border-slate-800 group-hover:scale-105 transition-transform"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 truncate">
                        {theme.badge}
                      </span>
                      {isSelected && (
                        <span className="w-4 h-4 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center shrink-0">
                          <Check size={10} className="stroke-[3]" />
                        </span>
                      )}
                    </div>
                    <h5 className="text-xs font-black text-white truncate">
                      {theme.name}
                    </h5>
                    <p className="text-[10px] text-slate-400 truncate">
                      {theme.tagline}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => handleTestSound(e, theme)}
                    className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors shrink-0"
                    title="Testar áudio do tema"
                  >
                    <Volume2 size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
