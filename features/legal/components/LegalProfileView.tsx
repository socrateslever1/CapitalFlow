import React from 'react';
import { Building, ChevronLeft, FileText, Lock, Mail, MapPin, Phone, User } from 'lucide-react';
import { UserProfile } from '../../../types';

interface LegalProfileViewProps {
  activeUser: UserProfile | null;
  onBack: () => void;
}

const valueOrMissing = (value: unknown) => String(value || '').trim() || 'Não informado';

export const LegalProfileView: React.FC<LegalProfileViewProps> = ({ activeUser, onBack }) => {
  if (!activeUser) return null;

  const fullAddress = [
    (activeUser as any).address,
    (activeUser as any).addressNumber,
    (activeUser as any).neighborhood,
    (activeUser as any).zipCode,
  ].map((value) => String(value || '').trim()).filter(Boolean).join(', ');

  const cards = [
    { label: 'Nome jurídico / razão', value: activeUser.fullName || activeUser.businessName || activeUser.name, icon: Building, tone: 'bg-blue-500/10 text-blue-500' },
    { label: 'CPF / CNPJ', value: activeUser.document, icon: Lock, tone: 'bg-emerald-500/10 text-emerald-500' },
    { label: 'Endereço do credor', value: fullAddress, icon: MapPin, tone: 'bg-violet-500/10 text-violet-400' },
    { label: 'Praça de pagamento / foro', value: [activeUser.city, activeUser.state].filter(Boolean).join(' - '), icon: FileText, tone: 'bg-amber-500/10 text-amber-400' },
    { label: 'Telefone / WhatsApp', value: (activeUser as any).phone || (activeUser as any).whatsapp || (activeUser as any).contatoWhatsapp, icon: Phone, tone: 'bg-cyan-500/10 text-cyan-400' },
    { label: 'E-mail', value: (activeUser as any).email || (activeUser as any).usuarioEmail, icon: Mail, tone: 'bg-rose-500/10 text-rose-400' },
  ];

  return (
    <div className="relative z-10 w-full">
      <header className="sticky top-0 z-30 -mx-3 -mt-4 mb-8 border-b border-slate-800 bg-slate-900/80 px-3 py-6 backdrop-blur-md sm:-mx-6 sm:-mt-8 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="mx-auto flex max-w-[1800px] items-center gap-5">
          <button onClick={onBack} className="flex h-12 w-12 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 shadow-lg transition-all hover:border-indigo-500 hover:bg-slate-700"><ChevronLeft size={20} className="text-slate-300" /></button>
          <div className="hidden h-14 w-14 items-center justify-center rounded-lg bg-indigo-600 shadow-xl shadow-indigo-500/20 ring-1 ring-white/10 sm:flex"><User className="text-white" size={28} /></div>
          <div><h1 className="text-2xl font-black uppercase leading-none tracking-tighter text-white sm:text-3xl">Perfil <span className="text-indigo-500">jurídico</span></h1><p className="mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Dados do credor usados nos documentos</p></div>
        </div>
      </header>

      <div className="max-w-3xl rounded-lg border border-slate-800 bg-slate-900 p-5 sm:p-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {cards.map(({ label, value, icon: Icon, tone }) => (
            <div key={label} className="flex items-start gap-4 rounded-lg border border-slate-800 bg-slate-950 p-4">
              <div className={`rounded-full p-3 ${tone}`}><Icon size={20} /></div>
              <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p><p className="mt-1 break-words font-bold text-white">{valueOrMissing(value)}</p></div>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-lg border border-blue-500/20 bg-blue-900/10 p-4">
          <p className="text-xs font-medium leading-relaxed text-blue-300"><span className="mb-1 block text-[10px] font-black uppercase">Origem dos dados</span>Estas informações são carregadas do perfil autenticado na tabela <code>perfis</code>. Nome, documento, endereço e foro devem estar completos antes da emissão. O sistema não deve preencher Manaus/AM ou qualquer outro dado por padrão quando o cadastro estiver vazio.</p>
        </div>
      </div>
    </div>
  );
};
