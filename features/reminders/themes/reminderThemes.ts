export type ThemeSound = 'CHIME' | 'CASH_REGISTER' | 'SIREN' | 'RETRO_ALARM' | 'SUCCESS_FANFARE';

export interface ReminderTheme {
  id: string;
  name: string;
  tagline: string;
  category: 'MEME_CLASSICO' | 'COBRANCA' | 'URGENCIA' | 'CELEBRACAO';
  badge: string;
  imageUrl: string;
  soundEffect: ThemeSound;
  humorQuote: string;
  bgGradient: string;
  borderColor: string;
  glowColor: string;
  accentTextColor: string;
  buttonGradient: string;
}

export const REMINDER_THEMES: ReminderTheme[] = [
  {
    id: 'seu_madruga',
    name: 'Seu Madruga',
    tagline: 'Pague o Aluguel!',
    category: 'MEME_CLASSICO',
    badge: '👴 Pague o Aluguel',
    imageUrl: 'https://i.postimg.cc/mD8Z8sK1/seu-madruga.jpg',
    soundEffect: 'RETRO_ALARM',
    humorQuote: '"Só não te dou outra porque... o prazo dessa tarefa venceu agora!"',
    bgGradient: 'from-amber-950/70 via-slate-900 to-amber-950/90',
    borderColor: 'border-amber-500/80',
    glowColor: 'rgba(245, 158, 11, 0.45)',
    accentTextColor: 'text-amber-400',
    buttonGradient: 'from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500',
  },
  {
    id: 'julius_dinheiro',
    name: 'Julius (Pai do Chris)',
    tagline: 'Se não cobrar, o prejuízo é maior!',
    category: 'COBRANCA',
    badge: '💵 Julius Econômico',
    imageUrl: 'https://i.imgflip.com/1g8my4.jpg',
    soundEffect: 'CASH_REGISTER',
    humorQuote: '"Se você esquecer essa tarefa, você gastou R$ 0,00... mas o prejuízo é de 100%!"',
    bgGradient: 'from-emerald-950/80 via-slate-900 to-emerald-950/90',
    borderColor: 'border-emerald-500/80',
    glowColor: 'rgba(16, 185, 129, 0.45)',
    accentTextColor: 'text-emerald-400',
    buttonGradient: 'from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500',
  },
  {
    id: 'nazare_calculos',
    name: 'Nazaré Confusa',
    tagline: 'Calculando a Complexidade',
    category: 'MEME_CLASSICO',
    badge: '📐 Nazaré Cálculos',
    imageUrl: 'https://i.imgflip.com/1jwhww.jpg',
    soundEffect: 'CHIME',
    humorQuote: '"Tentando entender em qual dimensão esse prazo chegou tão rápido..."',
    bgGradient: 'from-purple-950/70 via-slate-900 to-purple-950/90',
    borderColor: 'border-purple-500/80',
    glowColor: 'rgba(168, 85, 247, 0.45)',
    accentTextColor: 'text-purple-400',
    buttonGradient: 'from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500',
  },
  {
    id: 'dicaprio_brinde',
    name: 'Gatsby / DiCaprio',
    tagline: 'Missão Cumprida & Sucesso',
    category: 'CELEBRACAO',
    badge: '🥂 Brinde ao Sucesso',
    imageUrl: 'https://i.imgflip.com/39t1o.jpg',
    soundEffect: 'SUCCESS_FANFARE',
    humorQuote: '"Um brinde aos que cumprem os compromissos exatamente no horário!"',
    bgGradient: 'from-yellow-950/60 via-slate-900 to-amber-950/80',
    borderColor: 'border-yellow-400/80',
    glowColor: 'rgba(250, 204, 21, 0.45)',
    accentTextColor: 'text-yellow-300',
    buttonGradient: 'from-yellow-500 to-amber-600 hover:from-yellow-400 hover:to-amber-500',
  },
  {
    id: 'michael_scott_calm',
    name: 'Michael Scott',
    tagline: 'EVERYBODY STAY CALM!',
    category: 'URGENCIA',
    badge: '🚨 Alerta Geral',
    imageUrl: 'https://i.imgflip.com/1bh3.jpg',
    soundEffect: 'SIREN',
    humorQuote: '"Oh my God! It is happening! Everybody stay calm, o alarme disparou!"',
    bgGradient: 'from-rose-950/80 via-slate-900 to-rose-950/90',
    borderColor: 'border-rose-500/90',
    glowColor: 'rgba(244, 63, 94, 0.5)',
    accentTextColor: 'text-rose-400',
    buttonGradient: 'from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500',
  },
  {
    id: 'poderoso_chefao',
    name: 'O Poderoso Chefão',
    tagline: 'Uma Proposta Irrecusável',
    category: 'COBRANCA',
    badge: '🌹 O Chefão',
    imageUrl: 'https://i.imgflip.com/1w7ygt.jpg',
    soundEffect: 'CASH_REGISTER',
    humorQuote: '"Você vem à minha presença no dia de hoje com um lembrete que não pode recusar."',
    bgGradient: 'from-zinc-950 via-slate-900 to-neutral-950',
    borderColor: 'border-red-600/70',
    glowColor: 'rgba(220, 38, 38, 0.4)',
    accentTextColor: 'text-red-400',
    buttonGradient: 'from-neutral-800 to-red-900 hover:from-neutral-700 hover:to-red-800',
  },
  {
    id: 'drake_aprovacao',
    name: 'Drake Approves',
    tagline: 'Pix Caiu > Desculpas',
    category: 'MEME_CLASSICO',
    badge: '👉 Drake Aprova',
    imageUrl: 'https://i.imgflip.com/30b1gx.jpg',
    soundEffect: 'SUCCESS_FANFARE',
    humorQuote: '"Deixar para amanhã: 🙅‍♂️ | Concluir essa tarefa agora: 👉"',
    bgGradient: 'from-orange-950/60 via-slate-900 to-amber-950/80',
    borderColor: 'border-orange-500/70',
    glowColor: 'rgba(249, 115, 22, 0.4)',
    accentTextColor: 'text-orange-400',
    buttonGradient: 'from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500',
  },
  {
    id: 'doge_wow',
    name: 'Doge / Cheems',
    tagline: 'Much Urgente, Very Prazo',
    category: 'MEME_CLASSICO',
    badge: '🐕 Doge Wow',
    imageUrl: 'https://i.imgflip.com/4t0m5.jpg',
    soundEffect: 'CHIME',
    humorQuote: '"Very compromisso. Much lembrete. So concluído. Wow!"',
    bgGradient: 'from-amber-950/50 via-slate-900 to-yellow-950/60',
    borderColor: 'border-yellow-500/70',
    glowColor: 'rgba(234, 179, 8, 0.4)',
    accentTextColor: 'text-yellow-400',
    buttonGradient: 'from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400',
  },
];

export const getThemeById = (id?: string): ReminderTheme | null => {
  if (!id) return null;
  return REMINDER_THEMES.find(t => t.id === id) || null;
};
