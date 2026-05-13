
import { supabase } from '../../../lib/supabase';
import { UserProfile } from '../../../types';
import { generateUUID } from '../../../utils/generators';
import { onlyDigits, maskDocument, maskPhone } from '../../../utils/formatters';
import { asString, asNumber } from '../../../utils/safe';

type UpdatableProfileFields = Partial<Omit<UserProfile, 'id' | 'profile_id'>>;

interface ProfileUpdatePayload {
  nome_operador?: string;
  nome_completo?: string;
  nome_empresa?: string;
  document?: string;
  phone?: string;
  address?: string;
  address_number?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  pix_key?: string;
  avatar_url?: string;
  brand_color?: string;
  logo_url?: string;
  contato_whatsapp?: string;
  default_interest_rate?: number;
  default_fine_percent?: number;
  default_daily_interest_percent?: number;
  target_capital?: number;
  target_profit?: number;
  ui_nav_order?: string[];
  ui_hub_order?: string[];
  last_active_at?: string;
  senha_acesso?: string;
  recovery_phrase?: string;
  access_level?: 'ADMIN' | 'OPERATOR' | 'VIEWER';
}

export const operatorProfileService = {
    /**
     * Realiza o upload da foto do operador para o storage
     */
    async uploadAvatar(file: File, profileId: string): Promise<string> {
        if (!file) throw new Error("Arquivo inválido.");
        
        const fileExt = file.name.split('.').pop();
        const fileName = `${profileId}/avatar_${Date.now()}.${fileExt}`;
        const filePath = `profiles/${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('avatars')
            .upload(filePath, file, { upsert: true });

        if (uploadError) {
            throw new Error(`Erro no storage: ${uploadError.message}`);
        }

        const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
        return data.publicUrl;
    },

    async updateProfile(profileId: string, data: UpdatableProfileFields, origin: 'MANUAL' | 'IMPORT' | 'RESTORE' = 'MANUAL'): Promise<UserProfile | null> {
        if (!profileId) throw new Error("ID do perfil inválido.");

        const curatedData = this.curateProfileData(data);

        // Mapeamento explícito para o banco (snake_case)
        const updatePayload: ProfileUpdatePayload = {
            nome_operador: curatedData.name, // Nome Curto
            nome_completo: curatedData.fullName, // Nome Completo
            nome_empresa: curatedData.businessName,
            document: curatedData.document,
            phone: curatedData.phone,
            address: curatedData.address,
            address_number: curatedData.addressNumber,
            neighborhood: curatedData.neighborhood,
            city: curatedData.city,
            state: curatedData.state,
            zip_code: curatedData.zipCode,
            pix_key: curatedData.pixKey,
            avatar_url: curatedData.photo,
            brand_color: '#2563eb', // Força a cor padrão
            logo_url: curatedData.logoUrl,
            contato_whatsapp: curatedData.contato_whatsapp,
            default_interest_rate: curatedData.defaultInterestRate,
            default_fine_percent: curatedData.defaultFinePercent,
            default_daily_interest_percent: curatedData.defaultDailyInterestPercent,
            target_capital: curatedData.targetCapital,
            target_profit: curatedData.targetProfit,
            ui_nav_order: curatedData.ui_nav_order,
            ui_hub_order: curatedData.ui_hub_order,
            last_active_at: new Date().toISOString()
        };

        // Segurança: Senha e frase de recuperação não são mais tratadas no frontend
        // para evitar vazamento em cache local/state.

        const { data: updated, error } = await supabase
            .from('perfis')
            .update(updatePayload)
            .eq('id', profileId)
            .select()
            .single();

        if (error) {
            console.error("Erro ao atualizar perfil no banco:", error);
            throw new Error("Falha ao atualizar perfil: " + error.message);
        }
        
        await this.logAudit(profileId, `PROFILE_UPDATE_${origin}`, `Perfil atualizado via ${origin}.`);
        return this.mapToUserProfile(updated);
    },

    async restoreProfileFromSnapshot(snapshot: Partial<UserProfile>, profileId: string): Promise<UserProfile> {
        return this.updateProfile(profileId, snapshot, 'RESTORE') as Promise<UserProfile>;
    },

    async importProfileFromSheet(file: File, profileId: string): Promise<UserProfile> {
        const XLSX = await import('xlsx');
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const data = new Uint8Array(e.target?.result as ArrayBuffer);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheetName = workbook.SheetNames[0];
                    const sheet = workbook.Sheets[sheetName];
                    const json = XLSX.utils.sheet_to_json(sheet) as any[];

                    if (json.length === 0) throw new Error("Planilha vazia.");
                    const row = json[0];

                    const mappedData: UpdatableProfileFields = {
                        name: row['Nome'] || row['Operador'] || row['name'],
                        fullName: row['Nome Completo'] || row['fullName'],
                        businessName: row['Empresa'] || row['Negocio'] || row['businessName'],
                        document: row['CPF'] || row['CNPJ'] || row['Documento'] || row['document'],
                        phone: row['Telefone'] || row['Celular'] || row['phone'],
                        address: row['Endereco'] || row['address'],
                        addressNumber: row['Numero'] || row['Nº'] || row['addressNumber'],
                        pixKey: row['Pix'] || row['Chave Pix'] || row['pixKey'],
                        contato_whatsapp: row['Suporte'] || row['supportPhone'] || row['contato_whatsapp'],
                        defaultInterestRate: row['Taxa Padrão'] || row['defaultInterestRate'],
                        targetCapital: row['Meta Capital'] || row['targetCapital']
                    };

                    const updated = await this.updateProfile(profileId, mappedData, 'IMPORT');
                    if (!updated) throw new Error("Falha na atualização pós-importação.");
                    resolve(updated);
                } catch (err: any) {
                    reject(new Error("Erro ao processar arquivo: " + err.message));
                }
            };
            reader.onerror = (err) => reject(err);
            reader.readAsArrayBuffer(file);
        });
    },

    curateProfileData(raw: any): UpdatableProfileFields {
        const cleanDoc = onlyDigits(raw.document || '');
        const cleanPhone = onlyDigits(raw.phone || '');
        return {
            name: asString(raw.name, 'Operador').trim().substring(0, 100),
            fullName: asString(raw.fullName).trim().substring(0, 200),
            businessName: asString(raw.businessName, 'Minha Empresa').trim().substring(0, 100),
            document: cleanDoc ? maskDocument(cleanDoc) : '000.000.000-00',
            phone: cleanPhone ? maskPhone(cleanPhone) : '00000000000',
            address: asString(raw.address).substring(0, 200),
            addressNumber: asString(raw.addressNumber).substring(0, 20),
            pixKey: asString(raw.pixKey).substring(0, 100),
            photo: raw.photo,
            brandColor: '#2563eb', // Força a cor padrão
            logoUrl: raw.logoUrl,
            contato_whatsapp: raw.contato_whatsapp,
            defaultInterestRate: Math.abs(Number(raw.defaultInterestRate) || 30),
            defaultFinePercent: Math.abs(Number(raw.defaultFinePercent) || 2),
            defaultDailyInterestPercent: Math.abs(Number(raw.defaultDailyInterestPercent) || 1),
            targetCapital: Math.abs(Number(raw.targetCapital) || 0),
            targetProfit: Math.abs(Number(raw.targetProfit) || 0),
            ui_nav_order: raw.ui_nav_order,
            ui_hub_order: raw.ui_hub_order,
            neighborhood: asString(raw.neighborhood).substring(0, 100),
            city: asString(raw.city).substring(0, 100),
            state: asString(raw.state).substring(0, 2).toUpperCase(),
            zipCode: onlyDigits(asString(raw.zipCode)).substring(0, 8)
        };
    },

    mapToUserProfile(dbProfile: any): UserProfile {
        if (!dbProfile) throw new Error("Dados de perfil nulos no mapeamento.");
        return {
            id: asString(dbProfile.id),
            profile_id: asString(dbProfile.id),
            name: asString(dbProfile.nome_operador, 'Operador'),
            fullName: asString(dbProfile.nome_completo),
            email: asString(dbProfile.usuario_email),
            businessName: asString(dbProfile.nome_empresa),
            document: asString(dbProfile.document),
            phone: asString(dbProfile.phone),
            address: asString(dbProfile.address),
            addressNumber: asString(dbProfile.address_number),
            neighborhood: asString(dbProfile.neighborhood),
            city: asString(dbProfile.city),
            state: asString(dbProfile.state),
            zipCode: asString(dbProfile.zip_code),
            pixKey: asString(dbProfile.pix_key),
            photo: dbProfile.avatar_url,
            accessLevel: (() => {
                const level = String(dbProfile.access_level);
                if (level === '1' || level === 'ADMIN') return 'ADMIN';
                if (level === '2' || level === 'OPERATOR') return 'OPERATOR';
                if (level === '3' || level === 'VIEWER') return 'VIEWER';
                return 'OPERATOR';
            })() as 'ADMIN' | 'OPERATOR' | 'VIEWER',
            totalAvailableCapital: asNumber(dbProfile.total_available_capital),
            interestBalance: asNumber(dbProfile.interest_balance),
            createdAt: asString(dbProfile.created_at),
            brandColor: '#2563eb', // Cor original restaurada
            logoUrl: dbProfile.logo_url,
            contato_whatsapp: dbProfile.contato_whatsapp,
            defaultInterestRate: asNumber(dbProfile.default_interest_rate),
            defaultFinePercent: asNumber(dbProfile.default_fine_percent),
            defaultDailyInterestPercent: asNumber(dbProfile.default_daily_interest_percent),
            targetCapital: asNumber(dbProfile.target_capital),
            targetProfit: asNumber(dbProfile.target_profit),
            ui_nav_order: dbProfile.ui_nav_order,
            ui_hub_order: dbProfile.ui_hub_order
        };
    },

    async logAudit(profileId: string, type: string, notes: string) {
        await supabase.from('transacoes').insert({
            id: generateUUID(),
            profile_id: profileId,
            date: new Date().toISOString(),
            type: 'ADJUSTMENT', 
            amount: 0,
            principal_delta: 0,
            interest_delta: 0,
            late_fee_delta: 0,
            category: 'AUDIT',
            notes: `[${type}] ${notes}`
        });
    }
};
