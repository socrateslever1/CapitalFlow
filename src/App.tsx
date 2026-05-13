/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';

export default function App() {
  // Mantemos a verificação de saúde apenas no console para debug, sem mostrar na tela
  useEffect(() => {
    fetch('/api/health')
      .then(res => res.json())
      .then(data => console.log('Server status:', data.status))
      .catch(err => console.error('Server connection error:', err));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Seu Novo App</h1>
        <p className="text-gray-600 mb-6">
          O ambiente está configurado e pronto. O que você gostaria de construir hoje?
        </p>
        <div className="p-4 bg-blue-50 text-blue-700 rounded-lg text-sm">
          Diga-me o que criar e eu escreverei o código para você.
        </div>
      </div>
    </div>
  );
}
