import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Clock3, Loader2, MessageCircle, Power, RefreshCw, Send, X } from 'lucide-react';
import { useFinancialPrivacy } from '../../contexts/FinancialPrivacyContext';
import { loadFluxMemory, saveFluxMemory, clearFluxMemory, type FluxMemoryMessage } from '../../services/ai/fluxLocalMemory';
import { cueForNotification, mayShowFluxCue, type FinancialNotificationCue, type FluxCue } from './fluxCuePolicy';
import type { UserProfile } from '../../types';
import { askMasterAssistant, isMasterAssistantEnabled, loadMasterAssistantBriefing, loadMasterAssistantHistory, type AssistantTurn } from '../../services/aiAssistant.service';
import { generateUUID } from '../../utils/generators';
import { registerDialogBack } from '../../utils/dialogNavigation';
import { Capacitor } from '@capacitor/core';

interface MasterMascotProps {
  activeUser: UserProfile | null;
  notifications?: ReadonlyArray<FinancialNotificationCue>;
}
type Message = { id: string; role: 'user' | 'assistant'; text: string };
const storageKey = (profileId: string) => 'cf_master_mascot_enabled:' + profileId;
const conversationKey = (profileId: string) => 'cf_master_mascot_conversation:' + profileId;
const cuePreferenceKey = (profileId: string) => 'cf_flux_balloons_enabled:' + profileId;
const cueQuotaKey = (profileId: string) => 'cf_flux_balloon_quota:' + profileId;
const localDay = () => {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')].join('-');
};

const FluxMark: React.FC<{ thinking?: boolean }> = ({ thinking = false }) => (
  <svg viewBox="0 0 48 48" aria-hidden="true" className="h-6 w-6">
    <path d="M11 21 7 17l4-5 5 3c2-1 4-2 8-2s6 1 8 2l5-3 4 5-4 4v10c0 7-5 11-13 11S11 38 11 31V21Z" fill="#0f2748" stroke="#60a5fa" strokeWidth="1.8" />
    <path d="M15 17c2-5 5-7 9-7s7 2 9 7" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" />
    <circle cx="18" cy="25" r="2" fill="#e0f2fe" />
    <circle cx="30" cy="25" r="2" fill="#e0f2fe" />
    {thinking ? <path d="M20 33h8" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" /> : <path d="M19 32c2 2 8 2 10 0" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" />}
  </svg>
);

export const MasterMascot: React.FC<MasterMascotProps> = ({ activeUser, notifications = [] }) => {
  const privacyHidden = useFinancialPrivacy();
  const profileId = activeUser?.id || '';
  const profileRef = useRef(profileId);
  profileRef.current = profileId;
  const authorizedProfileRef = useRef<string | null>(null);
  const seenNotificationIds = useRef(new Set<string>());
  const notificationListReady = useRef(false);
  const cueStartedAt = useRef(Date.now());
  const [authorized, setAuthorized] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [balloonsEnabled, setBalloonsEnabled] = useState(true);
  const [cue, setCue] = useState<FluxCue | null>(null);
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
    const user = activeUser;
    authorizedProfileRef.current = null;
    notificationListReady.current = false;
    cueStartedAt.current = Date.now();
    seenNotificationIds.current.clear();
    setOpen(false);
    setMessages([]);
    setMessage('');
    setNotice('');
    setCue(null);
    setHydrated(false);
    setAuthorized(false);
    if (!user || user.accessLevel !== 'ADMIN') return;
    const existing = localStorage.getItem(conversationKey(user.id));
    const id = existing && /^[a-f0-9-]{36}$/i.test(existing) ? existing : generateUUID();
    localStorage.setItem(conversationKey(user.id), id);
    setConversationId(id);
    setBalloonsEnabled(localStorage.getItem(cuePreferenceKey(user.id)) !== 'off');
    void isMasterAssistantEnabled().then(async allowed => {
      if (cancelled || !allowed) return;
      authorizedProfileRef.current = user.id;
      setAuthorized(true);
      setEnabled(localStorage.getItem(storageKey(user.id)) !== 'off');
      try {
        const remembered = await loadFluxMemory(user.id, id);
        if (!cancelled && profileRef.current === user.id) {
          setMessages(remembered);
          setHydrated(true);
        }
      } catch {
        if (!cancelled && profileRef.current === user.id) {
          setNotice('Memória local indisponível; esta conversa funciona apenas nesta sessão.');
          setHydrated(true);
        }
      }
    }).catch(() => {
      if (!cancelled) setAuthorized(false);
    });
    return () => { cancelled = true; };
  }, [activeUser?.id, activeUser?.accessLevel]);

  // Only authenticated, hydrated conversations are saved. IndexedDB encrypts at rest.
  useEffect(() => {
    if (!hydrated || !authorized || authorizedProfileRef.current !== profileId) return;
    void saveFluxMemory(profileId, conversationId, messages as FluxMemoryMessage[])
      .catch(() => setNotice('Não foi possível atualizar a memória neste aparelho.'));
  }, [hydrated, authorized, profileId, conversationId, messages]);

  useEffect(() => {
    if (!cue) return;
    const expiry = window.setTimeout(() => setCue(null), 8_000);
    return () => window.clearTimeout(expiry);
  }, [cue]);

  useEffect(() => {
    if (!notificationListReady.current) {
      seenNotificationIds.current = new Set(notifications.map(item => item.id));
      notificationListReady.current = true;
      return;
    }
    const fresh = notifications.filter(item => !seenNotificationIds.current.has(item.id) && item.createdAt >= cueStartedAt.current);
    for (const item of fresh) seenNotificationIds.current.add(item.id);
    if (seenNotificationIds.current.size > 250) {
      seenNotificationIds.current = new Set(notifications.map(item => item.id));
    }
    if (!authorized || !hydrated || !enabled || authorizedProfileRef.current !== profileId || !fresh.length) return;
    let quota: { day: string; count: number; last: number } = { day: localDay(), count: 0, last: 0 };
    try {
      const raw = JSON.parse(localStorage.getItem(cueQuotaKey(profileId)) || 'null') as Partial<typeof quota> | null;
      if (raw?.day === quota.day) quota = {
        day: quota.day,
        count: Number.isFinite(raw.count) ? Math.max(0, Number(raw.count)) : 0,
        last: Number.isFinite(raw.last) ? Math.max(0, Number(raw.last)) : 0,
      };
    } catch { /* Invalid preference is ignored, not displayed. */ }
    const active = document.activeElement;
    const editorOpen = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement ||
      Boolean(document.querySelector('[role="dialog"]:not([aria-label="Conversa com o Flux"])'));
    if (!mayShowFluxCue({
      now: Date.now(), lastShownAt: quota.last, shownToday: quota.count,
      enabled: balloonsEnabled && authorized && enabled,
      panelOpen: open, privacyHidden, pageVisible: !document.hidden, editorOpen,
    })) return;
    const candidate = fresh.map(cueForNotification).find((item): item is FluxCue => Boolean(item));
    if (!candidate) return;
    setCue(candidate);
    try {
      localStorage.setItem(cueQuotaKey(profileId), JSON.stringify({
        day: localDay(), count: quota.count + 1, last: Date.now(),
      }));
    } catch { /* Quota is a convenience; no financial data is stored. */ }
  }, [notifications, authorized, hydrated, enabled, profileId, open, privacyHidden, balloonsEnabled]);

  useEffect(() => {
    if (privacyHidden) { setCue(null); setOpen(false); }
  }, [privacyHidden]);

  useEffect(() => {
    if (open) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [open, messages, notice]);

  // Flux is the topmost navigable surface. Android native back, the PWA
  // back dispatcher and ordinary browser history must close it before the
  // application can navigate or offer to exit.
  useEffect(() => {
    if (!open) return;
    const registration = registerDialogBack(() => setOpen(false));
    const onAppBack = (event: Event) => {
      event.preventDefault();
      setOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setOpen(false);
    };
    const isOrdinaryBrowser = !Capacitor.isNativePlatform() &&
      !window.matchMedia('(display-mode: standalone)').matches;
    // A same-URL history entry lets Chrome's Back gesture dismiss the panel.
    // It is not a page exit and never invokes the browser leave-site dialog.
    const overlayMarker = generateUUID();
    if (isOrdinaryBrowser) {
      window.history.pushState(
        { ...window.history.state, cfFluxOverlay: overlayMarker },
        '', window.location.href,
      );
    }
    const onPopState = () => {
      if (isOrdinaryBrowser) setOpen(false);
    };
    window.addEventListener('capitalflow:back', onAppBack);
    window.addEventListener('keydown', onEscape, true);
    if (isOrdinaryBrowser) window.addEventListener('popstate', onPopState);
    return () => {
      registration.dispose();
      window.removeEventListener('capitalflow:back', onAppBack);
      window.removeEventListener('keydown', onEscape, true);
      if (isOrdinaryBrowser) {
        window.removeEventListener('popstate', onPopState);
        // X, avatar, disabling Flux or a privacy toggle closes the synthetic
        // entry too; browser Back has already consumed it in the other case.
        if (window.history.state?.cfFluxOverlay === overlayMarker) {
          window.history.back();
        }
      }
    };
  }, [open]);

  const turns = useMemo<AssistantTurn[]>(() => messages
    .filter(item => !item.id.endsWith(':error') &&
      !/^(Os provedores de IA estão indisponíveis|O Flux não conseguiu se conectar|O serviço do Flux respondeu com erro)/.test(item.text))
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
    if (busy || !hydrated) return;
    const previous = conversationId;
    const next = generateUUID();
    setHydrated(false);
    localStorage.setItem(conversationKey(profileId), next);
    setConversationId(next);
    setMessages([]);
    setNotice('');
    setMessage('');
    void clearFluxMemory(profileId, previous).catch(() => {})
      .finally(() => { if (profileRef.current === profileId) setHydrated(true); });
  };

  const toggleBalloons = () => {
    const next = !balloonsEnabled;
    setBalloonsEnabled(next);
    if (!next) setCue(null);
    localStorage.setItem(cuePreferenceKey(profileId), next ? 'on' : 'off');
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
    if (!enabled || !hydrated || !value || busy || !conversationId) return;
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
      if (profileRef.current !== userAtStart || conversationId !== localStorage.getItem(conversationKey(userAtStart))) return;
      const isFailureReply = reply.model === 'transport-fallback' || reply.model === 'unavailable';
      setMessages(current => [...current, { id: requestId + (isFailureReply ? ':error' : ':assistant'), role: 'assistant' as const, text: reply.response }].slice(-50));
    } catch {
      if (profileRef.current === userAtStart) {
        setMessages(current => [...current, { id: requestId + ':error', role: 'assistant' as const, text: 'Não foi possível responder agora.' }].slice(-50));
      }
    } finally {
      if (profileRef.current === userAtStart) setBusy(false);
    }
  };

  return (
    <div className="fab-mascot fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-3 z-[var(--z-fab,500)] md:bottom-6 md:left-6">
      {open && (
        <section role="dialog" aria-label="Conversa com o Flux" aria-modal="false"
          className="absolute bottom-12 left-0 flex h-[min(68dvh,33rem)] w-[min(25rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-slate-700/90 bg-slate-950 shadow-2xl shadow-black/70">
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
            <button type="button" onClick={toggleBalloons}
              aria-pressed={balloonsEnabled} className="rounded-lg px-2 py-1.5 text-[11px] text-slate-300 hover:bg-slate-800">
              Balões: {balloonsEnabled ? 'ligados' : 'desligados'}
            </button>
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
            <p className="mt-2 text-[10px] text-slate-500">Conversa cifrada neste aparelho por até 30 dias. Sem sincronização entre dispositivos.</p>
          </div>
        </section>
      )}
      {cue && balloonsEnabled && !privacyHidden && !open && <div
        role="status" className="absolute bottom-12 left-0 w-52 rounded-xl border border-slate-700 bg-slate-900 p-2.5 shadow-xl">
        <button type="button" onClick={() => { setCue(null); setOpen(true); }}
          className="block w-full text-left text-xs leading-snug text-slate-100">{cue.text}</button>
        <button type="button" aria-label="Dispensar aviso do Flux" onClick={() => setCue(null)}
          className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full border border-slate-700 bg-slate-900 text-slate-300"><X size={12}/></button>
      </div>}
      <button type="button" disabled={privacyHidden} onClick={() => { setCue(null); setOpen(current => !current); }}
        className={'flux-mascot grid h-11 w-11 place-items-center rounded-xl border border-blue-500/40 bg-slate-900 text-blue-200 shadow-lg shadow-black/40 transition hover:bg-slate-800 ' +
          (busy ? 'flux-mascot-thinking' : 'flux-mascot-idle')}
        aria-label={privacyHidden ? 'Mostre os valores para conversar com Flux' : open ? 'Fechar Flux' : 'Conversar com Flux'} aria-expanded={open} title="Flux">
        {busy ? <Loader2 size={23} className="animate-spin"/> : open ? <MessageCircle size={23}/> : <FluxMark/>}
      </button>
    </div>
  );
};
