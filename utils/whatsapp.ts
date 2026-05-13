export const buildWhatsAppLink = (phone: string, message?: string) => {
  const cleanPhone = phone.replace(/\D/g, '');
  let finalPhone = cleanPhone;
  if (!finalPhone.startsWith('55') && finalPhone.length >= 10) {
    finalPhone = `55${finalPhone}`;
  }
  
  const baseUrl = `https://wa.me/${finalPhone}`;
  if (message) {
    return `${baseUrl}?text=${encodeURIComponent(message)}`;
  }
  return baseUrl;
};
