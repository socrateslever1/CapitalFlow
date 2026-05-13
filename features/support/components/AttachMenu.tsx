
import React from 'react';
import { MapPin, Image as ImageIcon, FileText } from 'lucide-react';

interface AttachMenuProps {
  onSelect: (type: 'location' | 'image' | 'file') => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
}

export const AttachMenu: React.FC<AttachMenuProps> = ({ onSelect, fileInputRef }) => {
  return (
    <div className="absolute bottom-20 left-4 bg-slate-800 border border-slate-700 rounded-2xl p-2 shadow-2xl flex flex-col gap-1 animate-in slide-in-from-bottom-2 z-20 w-40">
      <button
        onClick={() => onSelect('location')}
        className="flex items-center gap-3 p-3 hover:bg-slate-700 rounded-xl text-xs text-white transition-colors text-left"
      >
        <MapPin size={16} className="text-rose-500" /> Localização
      </button>
      <button
        onClick={() => {
            if (fileInputRef.current) {
                fileInputRef.current.accept = "image/*";
                fileInputRef.current.click();
            }
        }}
        className="flex items-center gap-3 p-3 hover:bg-slate-700 rounded-xl text-xs text-white transition-colors text-left"
      >
        <ImageIcon size={16} className="text-blue-500" /> Galeria
      </button>
      <button
        onClick={() => {
            if (fileInputRef.current) {
                fileInputRef.current.accept = "*/*";
                fileInputRef.current.click();
            }
        }}
        className="flex items-center gap-3 p-3 hover:bg-slate-700 rounded-xl text-xs text-white transition-colors text-left"
      >
        <FileText size={16} className="text-emerald-500" /> Documento
      </button>
    </div>
  );
};
