import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Power, Send, X } from 'lucide-react';
import { UserProfile } from '../../types';
import { askMasterAssistant, isMasterAssistantEnabled, loadMasterAssistantBriefing, loadMasterAssistantHistory } from '../../services/aiAssistant.service';
import { generateUUID } from '../../utils/generators';

interface MasterMascotProps {
  activeUser: UserProfile | null;
}

type Message = { id: string; role: 'user' | 'assistant'; text: string };

const FluxMark: React.FC<{ muted?: boolean; thinking?: boolean }> = ({ muted = false, thinking = false }) => (
  <svg viewBox="0 0 48 48" aria-hidden="true" className={`h-12 w-12 ${muted ? 'opacity-55' : ''}`}>
    <path d="M11 21 7 17l4-5 5 3c2-1 4-2 8-2s6 1 8 2l5-3 4 5-4 4v10c0 7-5 11-13 11S11 38 11 31V21Z" fill="#0f2748" stroke="#60a5fa" strokeWidth="1.8" />
    <path d="M15 17c2-5 5-7 9-7s7 2 9 7" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" />
    <circle cx="18" cy="25" r="2" fill="#e0f2fe" />
    <circle cx="30" cy="25" r="2" fill="#e0f2fe" />
    {thinking ? <path d="M20 33h8" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" /> : <path d="M19 32c2 2 8 2 10 0" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" />}
    <path d="M9 27 5 25M39 27l4-2" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const storageKey = (profileId: string) => `cf_master_mascot_enabled:${profileId}`;
const conversationKey = (profileId: string) => `cf_master_mascot_conversation:${profileId}`;

export const MasterMascot: React.FC<MasterMascotProps> = ({ activeUser }) => {
  const [authorized, setAuthorized] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [briefing, setBriefing] = useState<string[]>([]);
  const profileId = activeUser?.id || '';
  const conversationId = useMemo(() => {
    if (!profileId) return '';
    const existing = localStorage.getItem(conversationKey(profileId));
    if (existing) return existing;
    const next = generateUUID();
    localStorage.setItem(conversationKey(profileId), next);
    return next;
  }, [profileId]);

  useEffect(() => {
    let cancelled = false;
    if (!activeUser || activeUser.accessLevel !== 'ADMIN') {
      setAuthorized(false);
      return;
    }
    isMasterAssistantEnabled().then((result) => {
      if (cancelled) return;
      setAuthorized(result);
      setEnabled(result && localStorage.getItem(storageKey(activeUser.id)) !== 'off');
    });
    return () => { cancelled = true; };
  }, [activeUser]);

  useEffect(() => {
    if (!authorized || !conversationId) return;
    let cancelled = false;
    loadMasterAssistantHistory(conversationId).then((history) => {
      if (cancelled) return;
      setMessages(history.flatMap((item) => [
        { id: `${item.request_id}:user`, role: 'user' as const, text: item.request_text },
        ...(item.response_text ? [{ id: `${item.request_id}:assistant`, role: 'assistant' as const, text: item.response_text }] : []),
      ]));
    }).catch(() => {
      // O histórico é auxiliar; a conversa atual permanece utilizável se a leitura falhar.
    });
    return () => { cancelled = true; };
  }, [authorized, conversationId]);

  useEffect(() => {
    if (!authorized || !enabled) return;
    let cancelled = false;
    loadMasterAssistantBriefing().then((alerts) => {
      if (!cancelled) setBriefing(alerts.map((alert) => alert.text));
    }).catch(() => {
      if (!cancelled) setBriefing([]);
    });
    return () => { cancelled = true; };
  }, [authorized, enabled]);

  if (!authorized) return null;

  const lastMessage = messages[messages.length - 1];
  const fluxState = busy ? 'thinking' : lastMessage?.role === 'assistant' ? 'ready' : 'idle';
  const bubbleText = lastMessage?.role === 'assistant' ? lastMessage.text : briefing[0];

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    localStorage.setItem(storageKey(profileId), next ? 'on' : 'off');
    if (!next) setOpen(false);
  };

  const send = async () => {
    const text = message.trim();
    if (!text || busy || !conversationId) return;
    const requestId = generateUUID();
    setMessage('');
    setMessages((current) => [...current, { id: `${requestId}:user`, role: 'user', text }]);
    setBusy(true);
    try {
      const reply = await askMasterAssistant({ message: text, conversationId, requestId });
      setMessages((current) => [...current, { id: `${requestId}:assistant`, role: 'assistant', text: reply.response }]);
    } catch (error) {
      setMessages((current) => [...current, { id: `${requestId}:error`, role: 'assistant', text: error instanceof Error ? error.message : 'Não foi possível responder agora.' }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] left-4 z-[var(--z-fab,500)] md:bottom-6 md:left-6">
      {open && (
        <section className="absolute bottom-12 left-0 flex w-[min(20rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-blue-500/35 bg-slate-950 shadow-2xl shadow-black/50" aria-label="Mascote Flux do CapitalFlow">
          <header className="flex items-center justify-between border-b border-white/10 bg-slate-900 px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-blue-400/30 bg-blue-500/10 text-blue-300"><FluxMark muted={!enabled} /></span>
              <div className="min-w-0">
                <h2 className="truncate text-xs font-black uppercase tracking-[0.12em] text-white">Flux</h2>
                <p className="text-[10px] text-slate-400">{enabled ? 'Assistente master' : 'Desativado'}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={toggle} className="flex h-8 items-center gap-1 rounded-md px-2 text-[10px] font-bold text-slate-400 hover:bg-white/10 hover:text-white" aria-pressed={enabled}><Power size={13} /> {enabled ? 'Desativar' : 'Ativar'}</button>
              <button type="button" onClick={() => setOpen(false)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Fechar Flux"><X size={15} /></button>
            </div>
          </header>
          {!enabled ? <div className="p-3 text-xs leading-relaxed text-slate-300">Ative o Flux para consultar seus dados e registrar solicitações.</div> : <>
          <div className="max-h-64 space-y-2 overflow-y-auto p-3" aria-live="polite">
            {!messages.length && <p className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-2.5 text-xs leading-relaxed text-slate-300">Pergunte sobre vencimentos, cartões, contas ou solicitações registradas.</p>}
            {messages.map((item) => <div key={item.id} className={`max-w-[92%] rounded-lg px-2.5 py-2 text-xs leading-relaxed ${item.role === 'user' ? 'ml-auto bg-blue-600 text-white' : 'bg-slate-900 text-slate-200'}`}>{item.text}</div>)}
            {busy && <div className="flex items-center gap-2 text-[11px] text-blue-300"><Loader2 size={13} className="animate-spin" /> Consultando contexto seguro…</div>}
          </div>
          <div className="border-t border-white/10 p-2.5">
            <div className="flex items-end gap-2">
              <textarea value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }} rows={2} maxLength={12000} placeholder="Escreva uma solicitação…" className="min-h-10 flex-1 resize-none rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-white outline-none placeholder:text-slate-500 focus:border-blue-500" />
              <button type="button" onClick={() => void send()} disabled={busy || !message.trim()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50" aria-label="Enviar solicitação"><Send size={15} /></button>
            </div>
          </div>
          </>}
        </section>
      )}
      {!open && bubbleText && (
        <div className="absolute bottom-14 left-0 mb-2 max-w-[15rem] rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-[11px] leading-snug text-slate-200 shadow-lg" role="status">
          {bubbleText.length > 90 ? `${bubbleText.slice(0, 87)}…` : bubbleText}
        </div>
      )}
      <button type="button" onClick={() => setOpen((current) => !current)} className={`flux-mascot flux-mascot-${fluxState} flex h-14 w-14 items-center justify-center rounded-2xl border text-blue-200 shadow-lg transition hover:-translate-y-0.5 ${enabled ? 'border-blue-400/50 bg-slate-900' : 'border-slate-700 bg-slate-950'}`} aria-label={open ? 'Fechar Flux' : 'Abrir Flux'} aria-pressed={open} title="Flux"><FluxMark muted={!enabled} thinking={busy} /></button>
    </div>
  );
};
