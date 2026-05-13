import React, { useState } from 'react';
import { Send, Loader2, Bot, X } from 'lucide-react';
import { getExtratoAIResponse } from '../services/extratoAIService';
import { ActionType } from '../ai/promptResolver';

export const ExtratoAIPanel = ({ onClose, context }: { onClose: () => void, context: any }) => {
    const [messages, setMessages] = useState<{ role: 'user' | 'ai', content: string }[]>([
        { role: 'ai', content: 'Olá! Como posso ajudar a analisar os dados financeiros deste período?' }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSend = async (action: ActionType = 'FREE_CHAT') => {
        if (!input && action === 'FREE_CHAT') return;
        
        const userMsg = input || (action !== 'FREE_CHAT' ? `Execute: ${action}` : '');
        setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setInput('');
        setIsLoading(true);

        try {
            const response = await getExtratoAIResponse(action, context, input);
            setMessages(prev => [...prev, { role: 'ai', content: response }]);
        } catch (error: any) {
            setMessages(prev => [...prev, { role: 'ai', content: `Erro: ${error.message}` }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="bg-slate-900 border border-slate-700 p-6 rounded-xl flex flex-col h-full">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-white flex items-center gap-2"><Bot /> Análise com IA</h3>
                <button onClick={onClose} className="text-slate-400 hover:text-white"><X /></button>
            </div>
            
            <div className="flex-1 overflow-y-auto mb-4 space-y-4 custom-scrollbar">
                {messages.map((m, i) => (
                    <div key={i} className={`p-3 rounded-lg ${m.role === 'user' ? 'bg-blue-900/50 text-white ml-auto' : 'bg-slate-800 text-slate-300'}`}>
                        {m.content}
                    </div>
                ))}
                {isLoading && <div className="text-slate-400 flex items-center gap-2"><Loader2 className="animate-spin" /> Analisando...</div>}
            </div>

            <div className="grid grid-cols-2 gap-2 mb-4">
                <button onClick={() => handleSend('EXPLAIN_RESULT')} className="text-[10px] bg-slate-800 p-2 rounded text-slate-300 hover:bg-slate-700">Explicar resultado</button>
                <button onClick={() => handleSend('EXECUTIVE_SUMMARY')} className="text-[10px] bg-slate-800 p-2 rounded text-slate-300 hover:bg-slate-700">Resumo executivo</button>
                <button onClick={() => handleSend('CASH_ANALYSIS')} className="text-[10px] bg-slate-800 p-2 rounded text-slate-300 hover:bg-slate-700">Analisar caixa</button>
                <button onClick={() => handleSend('FINANCIAL_ADVICE')} className="text-[10px] bg-slate-800 p-2 rounded text-slate-300 hover:bg-slate-700">Conselho financeiro</button>
            </div>

            <div className="flex gap-2">
                <input 
                    value={input} 
                    onChange={(e) => setInput(e.target.value)}
                    className="flex-1 bg-slate-800 text-white p-2 rounded-lg"
                    placeholder="Pergunte algo..."
                />
                <button onClick={() => handleSend('FREE_CHAT')} className="bg-blue-600 p-2 rounded-lg text-white"><Send size={20}/></button>
            </div>
        </div>
    );
};
