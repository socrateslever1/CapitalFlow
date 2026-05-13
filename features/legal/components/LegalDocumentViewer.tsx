import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Download, CheckCircle, AlertCircle, Printer, Shield, Info, X } from 'lucide-react';
import { legalService } from '../services/legalService';
import { LegalDocumentRecord } from '../../../types';
import { supabase } from '../../../lib/supabase';
import { QRCodeSVG } from 'qrcode.react';

interface LegalDocumentViewerProps {
  documentId: string;
  onClose?: () => void;
  onSigned?: () => void;
  profileId: string;
  signerName: string;
  signerDoc: string;
}

export const LegalDocumentViewer: React.FC<LegalDocumentViewerProps> = ({
  documentId,
  onClose,
  onSigned,
  profileId,
  signerName,
  signerDoc
}) => {
  const [doc, setDoc] = useState<LegalDocumentRecord | null>(null);
  const [html, setHtml] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSignModal, setShowSignModal] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadDocument();
  }, [documentId]);

  const loadDocument = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Busca o HTML renderizado
      const renderedHtml = await legalService.getRenderedHTML(documentId);
      setHtml(renderedHtml);

      // Busca os dados do documento para o cabeçalho/status
      const { data: docData, error: docError } = await supabase
        .from('documentos_juridicos')
        .select('*')
        .eq('id', documentId)
        .single();

      if (docError) throw docError;
      
      setDoc({
        id: docData.id,
        loanId: docData.loan_id,
        agreementId: docData.agreement_id,
        type: docData.type,
        status: docData.status_assinatura === 'ASSINADO' ? 'SIGNED' : 'PENDING',
        snapshot: docData.snapshot,
        hashSHA256: docData.hash_sha256,
        created_at: docData.created_at
      });
    } catch (err: any) {
      console.error('Erro ao carregar documento:', err);
      setError(err.message || 'Falha ao carregar o documento jurídico.');
    } finally {
      setLoading(false);
    }
  };

  const handleSign = async () => {
    if (!agreeTerms) return;
    
    try {
      setSigning(true);
      await legalService.signDocument(
        documentId,
        profileId,
        { name: signerName, doc: signerDoc },
        'DEVEDOR'
      );
      
      setShowSignModal(false);
      await loadDocument();
      if (onSigned) onSigned();
    } catch (err: any) {
      console.error('Erro ao assinar:', err);
      alert('Erro ao processar assinatura digital: ' + err.message);
    } finally {
      setSigning(false);
    }
  };

  const handleDownloadPDF = async () => {
    try {
      const filename = `Confissao_Divida_${doc?.snapshot.codigo_contrato || documentId}`;
      await legalService.generatePDF('legal-document-content', filename);
    } catch (err) {
      console.error('Erro ao gerar PDF:', err);
      alert('Não foi possível gerar o PDF no momento.');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-4">
        <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-zinc-400 font-medium">Processando documento jurídico...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center space-y-4">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
        <p className="text-red-400">{error}</p>
        <button 
          onClick={loadDocument}
          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors"
        >
          Tentar Novamente
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-zinc-950 rounded-xl overflow-hidden border border-white/10 shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/5 bg-zinc-900/50">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/10 rounded-lg">
            <FileText className="w-5 h-5 text-emerald-500" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">
              Confissão de Dívida
            </h3>
            <p className="text-xs text-zinc-500 font-mono">
              ID: {doc?.snapshot.codigo_contrato || documentId.substring(0, 8)}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {doc?.status === 'SIGNED' ? (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 text-emerald-500 rounded-full text-xs font-medium border border-emerald-500/20">
              <CheckCircle className="w-3.5 h-3.5" />
              Assinado Digitalmente
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 text-amber-500 rounded-full text-xs font-medium border border-amber-500/20">
              <Shield className="w-3.5 h-3.5" />
              Aguardando Assinatura
            </div>
          )}
          
          <button 
            onClick={handleDownloadPDF}
            className="p-2 hover:bg-white/5 text-zinc-400 hover:text-white rounded-lg transition-colors"
            title="Baixar PDF"
          >
            <Download className="w-5 h-5" />
          </button>
          
          {onClose && (
            <button 
              onClick={onClose}
              className="p-2 hover:bg-white/5 text-zinc-400 hover:text-white rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto bg-zinc-900/30 p-4 md:p-8 custom-scrollbar">
        <div className="max-w-4xl mx-auto">
          {/* Document Content */}
          <div 
            id="legal-document-content"
            className="bg-white text-black p-8 md:p-16 shadow-xl rounded-sm min-h-[1000px] legal-print-container"
            dangerouslySetInnerHTML={{ __html: html }}
          />
          
          {/* Integrity Info (Outside Print) */}
          <div className="mt-8 p-4 bg-zinc-900 border border-white/5 rounded-xl space-y-4">
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-emerald-500 mt-0.5" />
              <div className="flex-1">
                <h4 className="text-sm font-medium text-white">Integridade do Documento</h4>
                <p className="text-xs text-zinc-400 mt-1">
                  Este documento possui validade jurídica como título executivo extrajudicial (Art. 784, CPC). 
                  A integridade é garantida via hash SHA-256 e registro de auditoria.
                </p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Hash SHA-256 do Documento</span>
                <div className="p-2 bg-black rounded border border-white/5 font-mono text-[10px] text-emerald-500 break-all">
                  {doc?.hashSHA256}
                </div>
              </div>
              
              <div className="flex items-center gap-4 p-3 bg-white/5 rounded-lg border border-white/5">
                <div className="bg-white p-1 rounded">
                  <QRCodeSVG 
                    value={`${window.location.origin}/verify/${documentId}`}
                    size={64}
                    level="H"
                  />
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold block mb-1">Verificação QR</span>
                  <p className="text-[10px] text-zinc-400 leading-tight">
                    Aponte a câmera para validar a autenticidade deste título no portal CapitalFlow.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      {doc?.status !== 'SIGNED' && (
        <div className="p-4 border-t border-white/5 bg-zinc-900/80 backdrop-blur-md flex justify-center">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowSignModal(true)}
            className="px-8 py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-xl shadow-lg shadow-emerald-500/20 transition-colors flex items-center gap-2"
          >
            <Shield className="w-5 h-5" />
            Assinar Documento Agora
          </motion.button>
        </div>
      )}

      {/* Signature Modal */}
      <AnimatePresence>
        {showSignModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-white/5">
                <h3 className="text-xl font-bold text-white">Assinatura Digital</h3>
                <p className="text-sm text-zinc-400 mt-1">
                  Você está prestes a assinar um documento com validade jurídica.
                </p>
              </div>
              
              <div className="p-6 space-y-6">
                <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-xl space-y-3">
                  <div className="flex items-center gap-2 text-emerald-500">
                    <Info className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">Dados do Signatário</span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-white font-medium">{signerName}</p>
                    <p className="text-xs text-zinc-500">CPF: {signerDoc}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <div className="relative flex items-center mt-1">
                      <input 
                        type="checkbox" 
                        checked={agreeTerms}
                        onChange={(e) => setAgreeTerms(e.target.checked)}
                        className="peer h-5 w-5 cursor-pointer appearance-none rounded border border-white/20 bg-zinc-800 checked:bg-emerald-500 transition-all"
                      />
                      <CheckCircle className="absolute h-5 w-5 text-black opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity p-0.5" />
                    </div>
                    <span className="text-xs text-zinc-400 leading-relaxed group-hover:text-zinc-300 transition-colors">
                      Declaro que li e concordo com todos os termos da Confissão de Dívida e autorizo o registro da minha assinatura digital vinculada ao meu CPF, IP e dispositivo.
                    </span>
                  </label>
                </div>
              </div>

              <div className="p-6 bg-black/20 flex gap-3">
                <button
                  onClick={() => setShowSignModal(false)}
                  className="flex-1 px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-medium rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button
                  disabled={!agreeTerms || signing}
                  onClick={handleSign}
                  className="flex-1 px-4 py-3 bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-emerald-400 text-black font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  {signing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                      Assinando...
                    </>
                  ) : (
                    <>
                      <Shield className="w-4 h-4" />
                      Confirmar
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
