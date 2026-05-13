// pages/Portal/DocumentViewer.tsx
import React, { useEffect, useState } from 'react';
import { legalDocumentService } from '../../services/legalDocument.service';
import { DocumentRenderer } from '../../components/DocumentRenderer';
import {
  Loader2,
  AlertTriangle,
  CheckCircle2,
  FileSignature,
  ArrowLeft,
} from 'lucide-react';
import { maskDocument } from '../../utils/formatters';

interface DocumentViewerProps {
  token: string;
  code: string;
  docId: string;
  onBack: () => void;
  onSigned: () => void;
}

export const DocumentViewer: React.FC<DocumentViewerProps> = ({
  token,
  code,
  docId,
  onBack,
  onSigned,
}) => {
  const [document, setDocument] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [canSign, setCanSign] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [role, setRole] = useState('DEVEDOR');
  const [signerName, setSignerName] = useState('');
  const [signerDoc, setSignerDoc] = useState('');
  const [missingValues, setMissingValues] = useState<any>({});

  const isSigned =
    document?.status_assinatura?.toUpperCase?.() === 'ASSINADO';

  useEffect(() => {
    loadDocument();
    // eslint-disable-next-line
  }, [docId, token]);

  const loadDocument = async () => {
    try {
      setLoading(true);
      setError(null);

      const doc = await legalDocumentService.getDoc(token, code, docId);
      setDocument(doc);

      const check = await legalDocumentService.missingFields(docId);
      setMissingFields(check?.missing || []);
      setCanSign(!!check?.can_sign);
    } catch (err: any) {
      setError(err?.message || 'Erro ao carregar documento.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateFields = async () => {
    try {
      setSigning(true);

      await legalDocumentService.updateFields(docId, missingValues);

      await loadDocument();

      alert('Dados atualizados com sucesso.');
    } catch (err: any) {
      alert(err?.message || 'Erro ao atualizar dados.');
    } finally {
      setSigning(false);
    }
  };

  const handleSign = async () => {
    if (!signerName || !signerDoc) {
      alert('Preencha nome e CPF.');
      return;
    }

    if (!confirm('Confirmar assinatura digital do documento?')) return;

    try {
      setSigning(true);

      await legalDocumentService.signDoc({
        token,
        code,
        docId,
        role,
        name: signerName,
        cpf: signerDoc.replace(/\D/g, ''),
        ip: '127.0.0.1',
        userAgent: navigator.userAgent,
      });

      await loadDocument();

      alert('Documento assinado com sucesso!');
      onSigned();
    } catch (err: any) {
      alert(err?.message || 'Erro ao assinar.');
    } finally {
      setSigning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <AlertTriangle className="mx-auto text-rose-500 mb-4" />
        <p className="text-white">{error}</p>
        <button
          onClick={onBack}
          className="mt-4 px-4 py-2 bg-slate-800 rounded-lg text-white"
        >
          Voltar
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-950">
      {/* Header */}
      <div className="flex justify-between items-center p-4 border-b border-slate-800 bg-slate-900">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-slate-400">
            <ArrowLeft />
          </button>
          <div>
            <h2 className="text-white font-bold text-sm uppercase">
              {document?.tipo}
            </h2>
            <p className="text-xs text-slate-500">
              ID: {docId.substring(0, 8)}
            </p>
          </div>
        </div>

        {isSigned ? (
          <span className="text-emerald-500 flex items-center gap-1 text-xs font-bold">
            <CheckCircle2 size={14} /> Assinado
          </span>
        ) : (
          <span className="text-amber-500 flex items-center gap-1 text-xs font-bold">
            <FileSignature size={14} /> Pendente
          </span>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Preview */}
        <div className="flex-1 bg-slate-200 p-4 overflow-y-auto">
          <div className="max-w-4xl mx-auto bg-white shadow-xl min-h-[800px]">
            <DocumentRenderer
              htmlContent={document?.snapshot_rendered_html}
            />
          </div>
        </div>

        {/* Sidebar */}
        {!isSigned && (
          <div className="w-80 bg-slate-900 p-6 border-l border-slate-800 overflow-y-auto">
            <h3 className="text-white text-xs font-bold uppercase mb-4">
              Assinatura Digital
            </h3>

            {missingFields.length > 0 && (
              <div className="mb-6">
                <p className="text-rose-400 text-xs mb-2">
                  Campos pendentes:
                </p>

                {missingFields.map((field) => (
                  <input
                    key={field}
                    type="text"
                    placeholder={field}
                    className="w-full mb-2 p-2 bg-slate-800 text-white text-xs rounded"
                    onChange={(e) =>
                      setMissingValues({
                        ...missingValues,
                        [field]: e.target.value,
                      })
                    }
                  />
                ))}

                <button
                  onClick={handleUpdateFields}
                  className="w-full py-2 bg-slate-700 text-white text-xs rounded"
                >
                  Salvar Dados
                </button>
              </div>
            )}

            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full mb-2 p-2 bg-slate-800 text-white text-xs rounded"
            >
              <option value="DEVEDOR">Devedor</option>
              <option value="TESTEMUNHA_1">Testemunha 1</option>
              <option value="TESTEMUNHA_2">Testemunha 2</option>
              <option value="AVALISTA">Avalista</option>
              <option value="CREDOR">Credor</option>
            </select>

            <input
              type="text"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="Nome completo"
              className="w-full mb-2 p-2 bg-slate-800 text-white text-xs rounded"
            />

            <input
              type="text"
              value={signerDoc}
              onChange={(e) => setSignerDoc(maskDocument(e.target.value))}
              placeholder="CPF"
              className="w-full mb-4 p-2 bg-slate-800 text-white text-xs rounded"
            />

            <button
              onClick={handleSign}
              disabled={!canSign || signing}
              className={`w-full py-3 rounded text-xs font-bold ${
                !canSign
                  ? 'bg-slate-700 text-slate-500'
                  : 'bg-blue-600 text-white'
              }`}
            >
              {signing ? 'Assinando...' : 'Assinar Documento'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};