
export const generateSHA256 = async (message: string): Promise<string> => {
  // Encoder para converter string em Uint8Array
  const msgBuffer = new TextEncoder().encode(message);

  // Hashing usando API nativa do navegador (SubtleCrypto)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);

  // Converter ArrayBuffer para Array de bytes
  const hashArray = Array.from(new Uint8Array(hashBuffer));

  // Converter bytes para string hex
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return hashHex;
};

export const createLegalSnapshot = (data: any) => {
    // Cria uma versão determinística do objeto para garantir que o hash seja sempre o mesmo para os mesmos dados
    return JSON.stringify(data, Object.keys(data).sort());
};
