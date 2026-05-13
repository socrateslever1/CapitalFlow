
import React from 'react';
import { ShieldCheck, Camera, Loader2, Upload, FileText, Eye, EyeOff, Trash2 } from 'lucide-react';
import { LoanDocument } from '../../types';

interface LoanFormDocumentsSectionProps {
  formData: any;
  setFormData: any;
  attachments: string[];
  customDocuments: LoanDocument[];
  startCamera: (type: 'guarantee' | 'document') => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  isUploading: boolean;
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  toggleDocVisibility: (id: string) => void;
  removeDoc: (id: string) => void;
}

export const LoanFormDocumentsSection: React.FC<LoanFormDocumentsSectionProps> = ({
  formData, setFormData, attachments, customDocuments, startCamera, fileInputRef, 
  isUploading, handleFileUpload, toggleDocVisibility, removeDoc
}) => {
  return (
    <div className="space-y-4 sm:space-y-6">
      <h3 className="text-[10px] font-black uppercase tracking-widest text-emerald-500 flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> Garantias e Docs</h3>
      <div className="space-y-4">
        <textarea placeholder="Descrição da garantia..." value={formData.guaranteeDescription || ''} onChange={e => setFormData({...formData, guaranteeDescription: e.target.value})} className="w-full bg-slate-950/50 border border-slate-800/80 rounded-2xl px-5 py-4 text-white min-h-[100px] text-xs resize-none outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 transition-all" />
        
        {/* Upload Section */}
        <div className="bg-slate-950/50 border border-slate-800/80 rounded-2xl p-4">
            <p className="text-[9px] font-black uppercase text-slate-500 mb-2">Documentos e Fotos</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
                <button type="button" onClick={() => startCamera('guarantee')} className="flex items-center justify-center gap-2 bg-slate-800/50 border border-slate-700/50 p-3 rounded-xl text-[9px] font-black uppercase text-slate-400 hover:text-white border-dashed hover:bg-slate-800 hover:border-slate-600 transition-all"><Camera size={14}/> Foto Garantia</button>
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="flex items-center justify-center gap-2 bg-slate-800/50 border border-slate-700/50 p-3 rounded-xl text-[9px] font-black uppercase text-slate-400 hover:text-white border-dashed hover:bg-slate-800 hover:border-slate-600 transition-all">
                    {isUploading ? <Loader2 size={14} className="animate-spin"/> : <Upload size={14}/>} Upload Doc/PDF
                </button>
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*,application/pdf" onChange={handleFileUpload} />
            </div>

            <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1 custom-scrollbar">
                {customDocuments.map((doc, i) => (
                    <div key={doc.id} className="flex justify-between items-center bg-slate-900/50 border border-slate-800/50 p-2 rounded-xl">
                        <div className="flex items-center gap-2 overflow-hidden">
                            <div className="w-8 h-8 rounded-lg bg-slate-800/50 flex items-center justify-center text-slate-500">
                                <FileText size={16}/>
                            </div>
                            <span className="text-[10px] text-white truncate max-w-[100px]">{doc.name}</span>
                        </div>
                        <div className="flex gap-1">
                            <button 
                                type="button" 
                                onClick={() => toggleDocVisibility(doc.id)} 
                                className={`p-2 rounded-lg transition-colors ${doc.visibleToClient ? 'bg-emerald-500/20 text-emerald-500' : 'bg-slate-800/50 text-slate-500'}`}
                                title={doc.visibleToClient ? "Visível para o cliente" : "Oculto do cliente"}
                            >
                                {doc.visibleToClient ? <Eye size={14}/> : <EyeOff size={14}/>}
                            </button>
                            <button 
                                type="button" 
                                onClick={() => removeDoc(doc.id)} 
                                className="p-2 bg-rose-500/10 text-rose-500 rounded-lg hover:bg-rose-500 hover:text-white transition-all"
                            >
                                <Trash2 size={14}/>
                            </button>
                        </div>
                    </div>
                ))}
                {attachments.map((img, i) => (
                    <div key={`att-${i}`} className="flex justify-between items-center bg-slate-900/50 border border-slate-800/50 p-2 rounded-xl">
                        <div className="flex items-center gap-2">
                            <img src={img} className="w-8 h-8 rounded-lg object-cover" referrerPolicy="no-referrer"/>
                            <span className="text-[10px] text-white">Foto Garantia {i+1}</span>
                        </div>
                        <span className="text-[9px] bg-slate-800/50 px-2 py-1 rounded text-slate-500">Local</span>
                    </div>
                ))}
            </div>
        </div>
      </div>
    </div>
  );
};
