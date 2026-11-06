import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Clock3, Loader2, MessageCircle, Power, RefreshCw, Send, X } from 'lucide-react';
import type { UserProfile } from '../../types';
import { askMasterAssistant, isMasterAssistantEnabled, loadMasterAssistantBriefing, loadMasterAssistantHistory, type AssistantTurn } from '../../services/aiAssistant.service';
import { generateUUID } from '../../utils/generators';

interface MasterMascotProps {
  activeUser: UserProfile | null;
}
type Message = { id: string; role: 'user' | 'assistant'; text: string };
const storageKey = (profileId: string) => 'cf_master_mascot_enabled:' + profileId;
const conversationKey = (profileId: string) => 'cf_master_mascot_conversation:' + profileId;

const FluxMark: React.FC<{ thinking?: boolean }> = ({ thinking = false }) => (
  <svg viewBox="0 0 48 48" aria-hidden="true" className="h-8 w-8">
    <path d="M11 21 7 17l4-5 5 3c2-1 4-2 8-2s6 1 8 2l5-3 4 5-4 4v10c0 7-5 11-13 11S11 38 11 31V21Z" fill="#0f2748" stroke="#60a5fa" strokeWidth="1.8" />
    <path d="M15 17c2-5 5-7 9-7s7 2 9 7" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" />
    <circle cx="18" cy="25" r="2" fill="#e0f2fe" />
    <circle cx="30" cy="25" r="2" fill="#e0f2fe" />
    {thinking ? <path d="M20 33h8" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" /> : <path d="M19 32c2 2 8 2 10 0" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" />}
  </svg>
);

export const MasterMascot: React.FC<MasterMascotProps> = ({ activeUser }) => {
  const profileId = activeUser?.id || '';
  const profileRef = useRef(profileId);
  profileRef.current = profileId;
  const [authorized, setAuthorized] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [auxBusy, setAuxBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [conversationId, setConversationId] = useState(() => generateUUID());
  const scrollRef = useRef<HTMLDivElement>(null);
  const financialGeneration = useRef(0);
  const lastFinancialReadGeneration = useRef(0);

  useEffect(() => {
    const invalidate = () => { financialGeneration.current += 1; };
    window.addEventListener('capitalflow:wallet-updated', invalidate);
    return () => window.removeEventListener('capitalflow:wallet-updated', invalidate);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setOpen(false);
    setMessages([]);
    setMessage('');
    setNotice('');
    setAuthorized(false);
    if (!activeUser || activeUser.accessLevel !== 'ADMIN') return;
    const existing = localStorage.getItem(conversationKey(activeUser.id));
    const id = existing || generateUUID();
    localStorage.setItem(conversationKey(activeUser.id), id);
    setConversationId(id);
    isMasterAssistantEnabled().then(result => {
      if (cancelled) return;
      setAuthorized(result);
      setEnabled(result && localStorage.getItem(storageKey(activeUser.id)) !== 'off');
    }).catch(() => {
      if (!cancelled) setAuthorized(false);
    });
    return () => { cancelled = true; };
  }, [activeUser?.id, activeUser?.accessLevel]);

  useEffect(() => {
    if (open) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [open, messages, notice]);

  useEffect(() => {
    if (!open) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [open]);

  const turns = useMemo<AssistantTurn[]>(() => messages
    .filter(item => !item.id.endsWith(':error'))
    .slice(-10)
    .map(item => ({ role: item.role, content: item.text.slice(0, 1500) })), [messages]);

  if (!authorized) return null;

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    localStorage.setItem(storageKey(profileId), next ? 'on' : 'off');
    if (!next) setOpen(false);
  };

  const newConversation = () => {
    if (busy) return;
    const next = generateUUID();
    localStorage.setItem(conversationKey(profileId), next);
    setConversationId(next);
    setMessages([]);
    setNotice('');
    setMessage('');
  };

  const requestHistory = async () => {
    if (auxBusy || busy) return;
    setAuxBusy(true);
    const userAtStart = profileId;
    try {
      const history = await loadMasterAssistantHistory(conversationId);
      if (profileRef.current !== userAtStart) return;
      const records: Message[] = history.flatMap(item => [
        { id: item.request_id + ':user', role: 'user' as const, text: item.request_text },
        ...(item.response_text ? [{ id: item.request_id + ':assistant', role: 'assistant' as const, text: item.response_text }] : []),
      ]);
      setMessages(current => current.length ? current : records.slice(-30));
      setNotice(records.length ? 'Histórico antigo carregado.' : 'Nenhum histórico persistido para esta conversa.');
    } catch {
      if (profileRef.current === userAtStart) setNotice('Não foi possível carregar o histórico antigo.');
    } finally {
      if (profileRef.current === userAtStart) setAuxBusy(false);
    }
  };

  const requestAlerts = async () => {
    if (auxBusy || busy) return;
    setAuxBusy(true);
    const userAtStart = profileId;
    try {
      const alerts = await loadMasterAssistantBriefing();
      if (profileRef.current === userAtStart) {
        setNotice(alerts.length ? alerts.map(alert => alert.text).join(' • ') : 'Nenhum alerta imediato.');
      }
    } catch {
      if (profileRef.current === userAtStart) setNotice('Não foi possível consultar os alertas.');
    } finally {
      if (profileRef.current === userAtStart) setAuxBusy(false);
    }
  };

  const send = async () => {
    const value = message.trim();
    if (!enabled || !value || busy || !conversationId) return;
    const requestId = generateUUID();
    const userAtStart = profileId;
    const turnsAtRequest = turns;
    const requestedGeneration = financialGeneration.current;
    const mustRefreshFinancialData = requestedGeneration !== lastFinancialReadGeneration.current;
    setMessage('');
    setMessages(current => [...current, { id: requestId + ':user', role: 'user' as const, text: value }].slice(-50));
    setBusy(true);
    setNotice('');
    try {
      const reply = await askMasterAssistant({
        message: value, conversationId, requestId, turns: turnsAtRequest,
        fresh: mustRefreshFinancialData,
      });
      if (reply.consultedFinancialData && financialGeneration.current === requestedGeneration) {
        lastFinancialReadGeneration.current = requestedGeneration;
      }
      if (profileRef.current !== userAtStart) return;
      setMessages(current => [...current, { id: requestId + ':assistant', role: 'assistant' as const, text: reply.response }].slice(-50));
    } catch {
      if (profileRef.current === userAtStart) {
        setMessages(current => [...current, { id: requestId + ':error', role: 'assistant' as const, text: 'Não foi possível responder agora.' }].slice(-50));
      }
    } finally {
      if (profileRef.current === userAtStart) setBusy(false);
    }
  };

  return (
    <div className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-3 z-[var(--z-fab,500)] md:bottom-6 md:left-6">
      {open && (
        <section role="dialog" aria-label="Conversa com o Flux" aria-modal="false"
          className="absolute bottom-14 left-0 flex h-[min(68dvh,33rem)] w-[min(25rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-slate-700/90 bg-slate-950 shadow-2xl shadow-black/70">
          <header className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-800 bg-slate-900 px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-800"><FluxMark thinking={busy}/></span>
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-white">Flux</h2>
                <p className="text-[11px] text-slate-400">Conversas rápidas e consultas autorizadas</p>
              </div>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Fechar conversa"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-300 hover:bg-slate-800"><X size={18}/></button>
          </header>
          <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-slate-800 px-3 py-2">
            <button type="button" onClick={newConversation} disabled={busy} className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200 disabled:opacity-50">Nova conversa</button>
            <button type="button" onClick={() => void requestHistory()} disabled={busy || auxBusy} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] text-slate-400 hover:bg-slate-800 disabled:opacity-50"><Clock3 size={13}/> Histórico</button>
            <button type="button" onClick={() => void requestAlerts()} disabled={busy || auxBusy} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] text-slate-400 hover:bg-slate-800 disabled:opacity-50"><RefreshCw size={13}/> Alertas</button>
            <button type="button" onClick={toggle} className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] text-slate-400 hover:bg-slate-800"><Power size={13}/> {enabled ? 'Desativar' : 'Ativar'}</button>
          </div>
          <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-3" aria-live="polite">
            {!messages.length && <div className="rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-4">
              <p className="text-sm font-semibold text-slate-100">Como posso ajudar?</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">Converse normalmente. Consultas de saldos, cartões e contratos são realizadas apenas quando necessárias.</p>
            </div>}
            {messages.map(item => <article key={item.id}
              className={'max-w-[94%] whitespace-pre-wrap break-words rounded-xl px-3 py-2.5 text-xs leading-relaxed ' +
              (item.role === 'user' ? 'ml-auto bg-blue-600 text-white' : 'border border-slate-800 bg-slate-900 text-slate-100')}>
              {item.text}
            </article>)}
            {busy && <p className="flex items-center gap-2 text-xs text-slate-400"><Loader2 size={14} className="animate-spin"/> Respondendo…</p>}
            {auxBusy && <p className="flex items-center gap-2 text-xs text-slate-400"><Loader2 size={14} className="animate-spin"/> Consultando…</p>}
            {notice && <p role="status" className="rounded-lg bg-slate-900 px-3 py-2 text-xs leading-relaxed text-slate-300">{notice}</p>}
          </div>
          <div className="shrink-0 border-t border-slate-800 bg-slate-950 p-3">
            <div className="flex items-end gap-2 rounded-xl border border-slate-700 bg-slate-900 p-1.5 focus-within:border-blue-500">
              <textarea value={message} onChange={event => setMessage(event.target.value)}
                onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }}
                rows={2} maxLength={12000} placeholder={enabled ? 'Mensagem para o Flux…' : 'Ative o Flux para conversar'}
                disabled={!enabled} aria-label="Mensagem para o Flux"
                className="min-h-10 min-w-0 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-white outline-none placeholder:text-slate-500 disabled:opacity-50"/>
              <button type="button" onClick={() => void send()} disabled={busy || !enabled || !message.trim()}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-blue-600 text-white disabled:cursor-not-allowed disabled:opacity-40" aria-label="Enviar mensagem">
                <Send size={16}/>
              </button>
            </div>
            <p className="mt-2 text-[10px] text-slate-500">Memória desta sessão. Dados financeiros não são gravados no navegador.</p>
          </div>
        </section>
      )}
      <button type="button" onClick={() => setOpen(current => !current)}
        className={'flux-mascot grid h-12 w-12 place-items-center rounded-2xl border border-blue-500/40 bg-slate-900 text-blue-200 shadow-lg shadow-black/40 transition hover:bg-slate-800 ' +
          (busy ? 'flux-mascot-thinking' : 'flux-mascot-idle')}
        aria-label={open ? 'Fechar Flux' : 'Conversar com Flux'} aria-expanded={open} title="Flux">
        {busy ? <Loader2 size={23} className="animate-spin"/> : open ? <MessageCircle size={23}/> : <FluxMark/>}
      </button>
    </div>
  );
};
