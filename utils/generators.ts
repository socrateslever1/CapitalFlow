
// Gera código de acesso (4 dígitos) evitando colisão dentro do mesmo perfil no estado atual
export const generateUniqueAccessCode = (existingCodes: Set<string>) => {
  for (let i = 0; i < 300; i++) {
    const code = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    if (code === '0000') continue; // opcional
    if (!existingCodes.has(code)) return code;
  }
  // fallback (muito improvável)
  return String(Math.floor(1000 + Math.random() * 9000));
};

// Gera número do cliente (6 dígitos) evitando colisão no estado atual
export const generateUniqueClientNumber = (existingNums: Set<string>) => {
  for (let i = 0; i < 300; i++) {
    const num = String(Math.floor(100000 + Math.random() * 900000));
    if (!existingNums.has(num)) return num;
  }
  return String(Math.floor(100000 + Math.random() * 900000));
};

export const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    try { return crypto.randomUUID(); } catch (e) {}
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};
