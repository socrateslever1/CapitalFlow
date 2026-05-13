import React, { useState } from 'react';
import { MapPin, Loader2 } from 'lucide-react';

interface Props {
  onSendLocation: (lat: number, lng: number) => Promise<void>;
}

export const LocationButton: React.FC<Props> = ({ onSendLocation }) => {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (!navigator.geolocation) {
      alert('Geolocalização não suportada neste dispositivo.');
      return;
    }

    setLoading(true);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          await onSendLocation(latitude, longitude);
        } catch (e) {
          alert('Erro ao enviar localização.');
        } finally {
          setLoading(false);
        }
      },
      (err) => {
        setLoading(false);
        alert('Permissão de localização negada ou indisponível.');
        console.error(`Geolocation error (${err.code}): ${err.message}`);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-white disabled:opacity-50"
      title="Enviar localização"
    >
      {loading ? <Loader2 size={18} className="animate-spin" /> : <MapPin size={18} />}
    </button>
  );
};