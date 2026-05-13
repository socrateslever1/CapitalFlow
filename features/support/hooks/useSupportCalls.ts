import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabase';

type Role = 'CLIENT' | 'OPERATOR';
type CallType = 'VOICE' | 'VIDEO';
type UiCallStatus = 'IDLE' | 'RINGING' | 'ACTIVE';

type SupportCallRow = {
  id: string;
  loan_id: string;
  caller_profile_id: string;
  callee_role: Role;
  status: 'RINGING' | 'ACCEPTED' | 'REJECTED' | 'ENDED';
  call_type: CallType;
  offer_sdp: string | null;
  answer_sdp: string | null;
  ice_candidates: any[] | null;
  created_at: string;
  updated_at: string;
  ended_at: string | null;
};

const STUN = [{ urls: 'stun:stun.l.google.com:19302' }];

export const useSupportCalls = (params: { loanId: string; profileId: string; role: Role }) => {
  const { loanId, profileId, role } = params;

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const callIdRef = useRef<string | null>(null);

  const [uiStatus, setUiStatus] = useState<UiCallStatus>('IDLE');
  const [currentCall, setCurrentCall] = useState<SupportCallRow | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const cleanup = () => {
    try {
      pcRef.current?.close();
    } catch {}
    pcRef.current = null;

    try {
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {}
    localStreamRef.current = null;

    callIdRef.current = null;
    setRemoteStream(null);
    setCurrentCall(null);
    setUiStatus('IDLE');
  };

  const createPC = () => {
    const pc = new RTCPeerConnection({ iceServers: STUN });

    pc.ontrack = (event) => {
      // garante stream remoto para audio/video
      const stream = event.streams?.[0];
      if (stream) setRemoteStream(stream);
    };

    pc.onicecandidate = async (event) => {
      if (!event.candidate) return;
      const callId = callIdRef.current;
      if (!callId) return;

      // append seguro (simples): lê e atualiza array
      const { data: row } = await supabase
        .from('support_calls')
        .select('ice_candidates')
        .eq('id', callId)
        .maybeSingle();

      const list = Array.isArray((row as any)?.ice_candidates) ? (row as any).ice_candidates : [];
      list.push(event.candidate);

      await supabase.from('support_calls').update({ ice_candidates: list }).eq('id', callId);
    };

    pcRef.current = pc;
    return pc;
  };

  const startCall = async (type: CallType) => {
    if (!loanId || !profileId) throw new Error('Dados inválidos para iniciar chamada.');

    // evita iniciar 2 chamadas
    if (uiStatus !== 'IDLE') return;

    const pc = createPC();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: type === 'VIDEO',
    });

    localStreamRef.current = stream;
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const { data, error } = await supabase
      .from('support_calls')
      .insert({
        loan_id: loanId,
        caller_profile_id: profileId,
        callee_role: role === 'CLIENT' ? 'OPERATOR' : 'CLIENT',
        status: 'RINGING',
        call_type: type,
        offer_sdp: JSON.stringify(offer),
        ice_candidates: [],
      })
      .select('*')
      .single();

    if (error) throw error;

    callIdRef.current = (data as any).id;
    setCurrentCall(data as any);
    setUiStatus('RINGING');
  };

  const acceptIncoming = async () => {
    const call = currentCall;
    if (!call) throw new Error('Nenhuma chamada para aceitar.');
    if (!call.offer_sdp) throw new Error('Chamada sem offer SDP.');

    const pc = createPC();

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: call.call_type === 'VIDEO',
    });

    localStreamRef.current = stream;
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    await pc.setRemoteDescription(JSON.parse(call.offer_sdp));

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    await supabase
      .from('support_calls')
      .update({
        status: 'ACCEPTED',
        answer_sdp: JSON.stringify(answer),
        updated_at: new Date().toISOString(),
      })
      .eq('id', call.id);

    callIdRef.current = call.id;
    setUiStatus('ACTIVE');
  };

  const rejectIncoming = async () => {
    const call = currentCall;
    if (!call) return;

    await supabase
      .from('support_calls')
      .update({
        status: 'REJECTED',
        updated_at: new Date().toISOString(),
        ended_at: new Date().toISOString(),
      })
      .eq('id', call.id);

    cleanup();
  };

  const endCall = async () => {
    const callId = callIdRef.current || currentCall?.id;
    if (callId) {
      await supabase
        .from('support_calls')
        .update({
          status: 'ENDED',
          updated_at: new Date().toISOString(),
          ended_at: new Date().toISOString(),
        })
        .eq('id', callId);
    }
    cleanup();
  };

  // quando o caller recebe answer_sdp
  const applyAnswerIfNeeded = async (call: SupportCallRow) => {
    if (!pcRef.current) return;
    if (!call.answer_sdp) return;

    const pc = pcRef.current;
    if (pc.currentRemoteDescription) return;

    await pc.setRemoteDescription(JSON.parse(call.answer_sdp));
    setUiStatus('ACTIVE');
  };

  // aplica ICE candidates recebidos (caller ou callee)
  const applyIceCandidates = async (call: SupportCallRow) => {
    if (!pcRef.current) return;
    const pc = pcRef.current;

    const list = Array.isArray(call.ice_candidates) ? call.ice_candidates : [];
    // adiciona “best effort”
    for (const c of list) {
      try {
        if (c) await pc.addIceCandidate(c);
      } catch {}
    }
  };

  useEffect(() => {
    if (!loanId) return;

    const channel = supabase
      .channel(`support-calls-${loanId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'support_calls', filter: `loan_id=eq.${loanId}` },
        async (payload) => {
          const call = payload.new as SupportCallRow;
          if (!call) return;

          // se a chamada é para mim e está tocando
          if (call.status === 'RINGING' && call.callee_role === role) {
            setCurrentCall(call);
            setUiStatus('RINGING');
            return;
          }

          // se sou o caller e a chamada foi aceita
          if (call.status === 'ACCEPTED' && call.caller_profile_id === profileId) {
            setCurrentCall(call);
            await applyAnswerIfNeeded(call);
            await applyIceCandidates(call);
            return;
          }

          // se a chamada terminou/rejeitou
          if (call.status === 'ENDED' || call.status === 'REJECTED') {
            cleanup();
            return;
          }

          // atualizações de ICE
          if ((call.id && (callIdRef.current === call.id || currentCall?.id === call.id))) {
            setCurrentCall(call);
            await applyIceCandidates(call);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loanId, role, profileId]);

  return {
    uiStatus,
    currentCall,
    remoteStream,
    localStream: localStreamRef.current,
    startCall,
    acceptIncoming,
    rejectIncoming,
    endCall,
  };
};