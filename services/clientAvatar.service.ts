
import { supabase } from '../lib/supabase';

export const clientAvatarService = {
  /**
   * Realiza upload da imagem para o bucket 'avatars'
   */
  async uploadAvatar(file: File, clientId: string): Promise<string> {
    if (!file) throw new Error("Arquivo inválido.");
    
    // Caminho organizado: clientes/ID_DO_CLIENTE/timestamp_nome.ext
    const fileExt = file.name.split('.').pop();
    const fileName = `${clientId}/${Date.now()}.${fileExt}`;
    const filePath = `clientes/${fileName}`;

    // Tenta o upload
    const { error: uploadError, data } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, { 
          upsert: true,
          contentType: file.type || 'image/jpeg'
      });

    if (uploadError) {
      console.error("Erro detalhado do Storage:", uploadError);
      if (uploadError.message?.includes("security policy")) {
        throw new Error("Erro de Permissão: O banco de dados bloqueou o upload. Certifique-se de executar o script SQL de políticas de Storage.");
      }
      throw new Error(`Erro no upload: ${uploadError.message}`);
    }

    // Obtém a URL pública após o sucesso
    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
    
    if (!urlData.publicUrl) {
        throw new Error("Falha ao gerar URL pública da imagem.");
    }

    return urlData.publicUrl;
  },

  /**
   * Atualiza a URL do cliente e propaga para os contratos (snapshot visual)
   */
  async updateClientPhoto(clientId: string, photoUrl: string) {
    if (!clientId || !photoUrl) return false;

    // 1. Atualizar Tabela Clientes
    const { error: clientError } = await supabase
      .from('clientes')
      .update({ foto_url: photoUrl })
      .eq('id', clientId);

    if (clientError) {
        console.error("Erro ao salvar foto no cliente:", clientError);
        throw new Error(`Erro ao salvar no cliente: ${clientError.message}`);
    }

    // 2. Propagar para Contratos (Snapshot) para manter visualização rápida
    // Isso garante que ao abrir o dashboard, a foto apareça sem join extra
    const { error: loanError } = await supabase
      .from('contratos')
      .update({ cliente_foto_url: photoUrl })
      .eq('client_id', clientId);

    if (loanError) {
        console.warn("Aviso: Falha ao propagar foto para contratos.", loanError);
    }
    
    return true;
  }
};
