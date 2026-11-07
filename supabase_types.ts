export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      acordo_assinaturas: {
        Row: {
          documento_id: string | null
          email: string | null
          id: string
          ip_address: string | null
          nome: string
          provider_signer_id: string | null
          role: string
          signed_at: string | null
          status: string
          telefone: string | null
        }
        Insert: {
          documento_id?: string | null
          email?: string | null
          id?: string
          ip_address?: string | null
          nome: string
          provider_signer_id?: string | null
          role: string
          signed_at?: string | null
          status: string
          telefone?: string | null
        }
        Update: {
          documento_id?: string | null
          email?: string | null
          id?: string
          ip_address?: string | null
          nome?: string
          provider_signer_id?: string | null
          role?: string
          signed_at?: string | null
          status?: string
          telefone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "acordo_assinaturas_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "acordo_documentos"
            referencedColumns: ["id"]
          },
        ]
      }
      acordo_documentos: {
        Row: {
          acordo_id: string | null
          assinatura_envelope_id: string | null
          assinatura_provider: string | null
          created_at: string | null
          id: string
          loan_id: string | null
          payload: Json
          pdf_hash: string | null
          pdf_url: string | null
          profile_id: string | null
          status: string
          template_version: string
          tipo: string
          updated_at: string | null
        }
        Insert: {
          acordo_id?: string | null
          assinatura_envelope_id?: string | null
          assinatura_provider?: string | null
          created_at?: string | null
          id?: string
          loan_id?: string | null
          payload: Json
          pdf_hash?: string | null
          pdf_url?: string | null
          profile_id?: string | null
          status: string
          template_version: string
          tipo: string
          updated_at?: string | null
        }
        Update: {
          acordo_id?: string | null
          assinatura_envelope_id?: string | null
          assinatura_provider?: string | null
          created_at?: string | null
          id?: string
          loan_id?: string | null
          payload?: Json
          pdf_hash?: string | null
          pdf_url?: string | null
          profile_id?: string | null
          status?: string
          template_version?: string
          tipo?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "acordo_documentos_acordo_id_fkey"
            columns: ["acordo_id"]
            isOneToOne: false
            referencedRelation: "acordos_inadimplencia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acordo_documentos_acordo_id_fkey"
            columns: ["acordo_id"]
            isOneToOne: false
            referencedRelation: "vw_acordos_com_parcelas"
            referencedColumns: ["acordo_id"]
          },
          {
            foreignKeyName: "acordo_documentos_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "contratos_old"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acordo_documentos_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      acordo_pagamentos: {
        Row: {
          acordo_id: string
          amount: number
          created_at: string
          id: string
          notes: string | null
          paid_at: string
          parcela_id: string | null
          profile_id: string
          source_id: string | null
        }
        Insert: {
          acordo_id: string
          amount: number
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string
          parcela_id?: string | null
          profile_id: string
          source_id?: string | null
        }
        Update: {
          acordo_id?: string
          amount?: number
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string
          parcela_id?: string | null
          profile_id?: string
          source_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "acordo_pagamentos_acordo_id_fkey"
            columns: ["acordo_id"]
            isOneToOne: false
            referencedRelation: "acordos_inadimplencia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acordo_pagamentos_acordo_id_fkey"
            columns: ["acordo_id"]
            isOneToOne: false
            referencedRelation: "vw_acordos_com_parcelas"
            referencedColumns: ["acordo_id"]
          },
          {
            foreignKeyName: "acordo_pagamentos_parcela_id_fkey"
            columns: ["parcela_id"]
            isOneToOne: false
            referencedRelation: "acordo_parcelas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acordo_pagamentos_parcela_id_fkey"
            columns: ["parcela_id"]
            isOneToOne: false
            referencedRelation: "vw_acordos_com_parcelas"
            referencedColumns: ["parcela_id"]
          },
          {
            foreignKeyName: "acordo_pagamentos_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acordo_pagamentos_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "fontes"
            referencedColumns: ["id"]
          },
        ]
      }
      acordo_parcelas: {
        Row: {
          acordo_id: string
          amount: number
          created_at: string
          data_pagamento: string | null
          data_vencimento: string | null
          due_date: string | null
          id: string
          numero: number
          paid_amount: number
          paid_at: string | null
          profile_id: string | null
          status: string
          valor: number | null
          valor_pago: number | null
        }
        Insert: {
          acordo_id: string
          amount?: number
          created_at?: string
          data_pagamento?: string | null
          data_vencimento?: string | null
          due_date?: string | null
          id?: string
          numero: number
          paid_amount?: number
          paid_at?: string | null
          profile_id?: string | null
          status?: string
          valor?: number | null
          valor_pago?: number | null
        }
        Update: {
          acordo_id?: string
          amount?: number
          created_at?: string
          data_pagamento?: string | null
          data_vencimento?: string | null
          due_date?: string | null
          id?: string
          numero?: number
          paid_amount?: number
          paid_at?: string | null
          profile_id?: string | null
          status?: string
          valor?: number | null
          valor_pago?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "acordo_parcelas_acordo_id_fkey"
            columns: ["acordo_id"]
            isOneToOne: false
            referencedRelation: "acordos_inadimplencia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acordo_parcelas_acordo_id_fkey"
            columns: ["acordo_id"]
            isOneToOne: false
            referencedRelation: "vw_acordos_com_parcelas"
            referencedColumns: ["acordo_id"]
          },
          {
            foreignKeyName: "acordo_parcelas_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      acordos_inadimplencia: {
        Row: {
          calculation_mode: string | null
          calculation_result: string | null
          created_at: string
          discount: number | null
          down_payment: number | null
          first_due_date: string
          grace_days: number | null
          grace_period: number | null
          id: string
          installment_value: number | null
          installments: number
          interest_base: number
          interest_rate: number
          juros_aplicado: number | null
          juros_mensal_percent: number | null
          juros_modo: string
          late_fee_base: number
          legal_document_id: string | null
          loan_id: string
          notes: string | null
          num_parcelas: number
          periodicidade: string
          principal_base: number
          profile_id: string
          qtd_parcelas: number | null
          signature_status: string | null
          signature_token: string | null
          status: string
          tipo: string
          tipo_acordo: string | null
          total_amount: number
          total_base: number
          total_divida_base: number | null
          total_negociado: number
          updated_at: string
          valor_parcela: number
        }
        Insert: {
          calculation_mode?: string | null
          calculation_result?: string | null
          created_at?: string
          discount?: number | null
          down_payment?: number | null
          first_due_date?: string
          grace_days?: number | null
          grace_period?: number | null
          id?: string
          installment_value?: number | null
          installments?: number
          interest_base?: number
          interest_rate?: number
          juros_aplicado?: number | null
          juros_mensal_percent?: number | null
          juros_modo?: string
          late_fee_base?: number
          legal_document_id?: string | null
          loan_id: string
          notes?: string | null
          num_parcelas?: number
          periodicidade?: string
          principal_base?: number
          profile_id: string
          qtd_parcelas?: number | null
          signature_status?: string | null
          signature_token?: string | null
          status?: string
          tipo?: string
          tipo_acordo?: string | null
          total_amount?: number
          total_base?: number
          total_divida_base?: number | null
          total_negociado?: number
          updated_at?: string
          valor_parcela?: number
        }
        Update: {
          calculation_mode?: string | null
          calculation_result?: string | null
          created_at?: string
          discount?: number | null
          down_payment?: number | null
          first_due_date?: string
          grace_days?: number | null
          grace_period?: number | null
          id?: string
          installment_value?: number | null
          installments?: number
          interest_base?: number
          interest_rate?: number
          juros_aplicado?: number | null
          juros_mensal_percent?: number | null
          juros_modo?: string
          late_fee_base?: number
          legal_document_id?: string | null
          loan_id?: string
          notes?: string | null
          num_parcelas?: number
          periodicidade?: string
          principal_base?: number
          profile_id?: string
          qtd_parcelas?: number | null
          signature_status?: string | null
          signature_token?: string | null
          status?: string
          tipo?: string
          tipo_acordo?: string | null
          total_amount?: number
          total_base?: number
          total_divida_base?: number | null
          total_negociado?: number
          updated_at?: string
          valor_parcela?: number
        }
        Relationships: [
          {
            foreignKeyName: "acordos_inadimplencia_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acordos_inadimplencia_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_acordo_documento_juridico"
            columns: ["legal_document_id"]
            isOneToOne: false
            referencedRelation: "documentos_juridicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_acordo_documento_juridico"
            columns: ["legal_document_id"]
            isOneToOne: false
            referencedRelation: "vw_documento_juridico_vigente_por_acordo"
            referencedColumns: ["id"]
          },
        ]
      }
      agenda: {
        Row: {
          categoria: string | null
          concluido: boolean | null
          created_at: string | null
          data_hora: string
          descricao: string | null
          id: string
          profile_id: string | null
          status_cor: string | null
          titulo: string
        }
        Insert: {
          categoria?: string | null
          concluido?: boolean | null
          created_at?: string | null
          data_hora: string
          descricao?: string | null
          id?: string
          profile_id?: string | null
          status_cor?: string | null
          titulo: string
        }
        Update: {
          categoria?: string | null
          concluido?: boolean | null
          created_at?: string | null
          data_hora?: string
          descricao?: string | null
          id?: string
          profile_id?: string | null
          status_cor?: string | null
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "agenda_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      assinaturas_documento: {
        Row: {
          aceitou: boolean | null
          assinatura_hash: string | null
          assinatura_imagem: string | null
          cpf: string | null
          created_at: string | null
          dispositivo_info: Json | null
          document_id: string
          hash_assinado: string
          id: string
          ip: string | null
          ip_origem: string | null
          nome: string
          papel: string
          profile_id: string | null
          role: string | null
          signed_at: string | null
          signer_document: string | null
          signer_email: string | null
          signer_name: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          aceitou?: boolean | null
          assinatura_hash?: string | null
          assinatura_imagem?: string | null
          cpf?: string | null
          created_at?: string | null
          dispositivo_info?: Json | null
          document_id: string
          hash_assinado: string
          id?: string
          ip?: string | null
          ip_origem?: string | null
          nome: string
          papel: string
          profile_id?: string | null
          role?: string | null
          signed_at?: string | null
          signer_document?: string | null
          signer_email?: string | null
          signer_name?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          aceitou?: boolean | null
          assinatura_hash?: string | null
          assinatura_imagem?: string | null
          cpf?: string | null
          created_at?: string | null
          dispositivo_info?: Json | null
          document_id?: string
          hash_assinado?: string
          id?: string
          ip?: string | null
          ip_origem?: string | null
          nome?: string
          papel?: string
          profile_id?: string | null
          role?: string | null
          signed_at?: string | null
          signer_document?: string | null
          signer_email?: string | null
          signer_name?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assinaturas_documento_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documentos_juridicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assinaturas_documento_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "vw_documento_juridico_vigente_por_acordo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assinaturas_documento_documento_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documentos_juridicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assinaturas_documento_documento_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "vw_documento_juridico_vigente_por_acordo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assinaturas_documento_profile_fk"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_perfis_sensiveis: {
        Row: {
          actor_uid: string | null
          created_at: string | null
          evento: string
          id: string
          new_row: Json | null
          old_row: Json | null
          perfil_id: string | null
        }
        Insert: {
          actor_uid?: string | null
          created_at?: string | null
          evento: string
          id?: string
          new_row?: Json | null
          old_row?: Json | null
          perfil_id?: string | null
        }
        Update: {
          actor_uid?: string | null
          created_at?: string | null
          evento?: string
          id?: string
          new_row?: Json | null
          old_row?: Json | null
          perfil_id?: string | null
        }
        Relationships: []
      }
      backups: {
        Row: {
          backup_version: number
          created_at: string
          id: string
          payload: Json
          profile_id: string
        }
        Insert: {
          backup_version?: number
          created_at?: string
          id?: string
          payload: Json
          profile_id: string
        }
        Update: {
          backup_version?: number
          created_at?: string
          id?: string
          payload?: Json
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "backups_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      balance_adjustments: {
        Row: {
          created_at: string
          created_by: string
          id: string
          principal_amount: number
          profile_id: string
          profit_amount: number
          reason: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          principal_amount?: number
          profile_id: string
          profit_amount?: number
          reason: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          principal_amount?: number
          profile_id?: string
          profit_amount?: number
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "balance_adjustments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      bkp_pf_cartoes: {
        Row: {
          created_at: string | null
          dia_fechamento: number | null
          dia_vencimento: number | null
          id: string | null
          limite: number | null
          nome: string | null
          profile_id: string | null
        }
        Insert: {
          created_at?: string | null
          dia_fechamento?: number | null
          dia_vencimento?: number | null
          id?: string | null
          limite?: number | null
          nome?: string | null
          profile_id?: string | null
        }
        Update: {
          created_at?: string | null
          dia_fechamento?: number | null
          dia_vencimento?: number | null
          id?: string | null
          limite?: number | null
          nome?: string | null
          profile_id?: string | null
        }
        Relationships: []
      }
      bkp_pf_categorias: {
        Row: {
          created_at: string | null
          icone: string | null
          id: string | null
          nome: string | null
          profile_id: string | null
          tipo: string | null
        }
        Insert: {
          created_at?: string | null
          icone?: string | null
          id?: string | null
          nome?: string | null
          profile_id?: string | null
          tipo?: string | null
        }
        Update: {
          created_at?: string | null
          icone?: string | null
          id?: string | null
          nome?: string | null
          profile_id?: string | null
          tipo?: string | null
        }
        Relationships: []
      }
      bkp_pf_contas: {
        Row: {
          created_at: string | null
          id: string | null
          nome: string | null
          profile_id: string | null
          saldo: number | null
          tipo: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          nome?: string | null
          profile_id?: string | null
          saldo?: number | null
          tipo?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          nome?: string | null
          profile_id?: string | null
          saldo?: number | null
          tipo?: string | null
        }
        Relationships: []
      }
      bkp_pf_objetivos: {
        Row: {
          cor: string | null
          created_at: string | null
          data_meta: string | null
          descricao: string | null
          icone: string | null
          id: string | null
          profile_id: string | null
          status: string | null
          titulo: string | null
          updated_at: string | null
          valor_alvo: number | null
          valor_atual: number | null
        }
        Insert: {
          cor?: string | null
          created_at?: string | null
          data_meta?: string | null
          descricao?: string | null
          icone?: string | null
          id?: string | null
          profile_id?: string | null
          status?: string | null
          titulo?: string | null
          updated_at?: string | null
          valor_alvo?: number | null
          valor_atual?: number | null
        }
        Update: {
          cor?: string | null
          created_at?: string | null
          data_meta?: string | null
          descricao?: string | null
          icone?: string | null
          id?: string | null
          profile_id?: string | null
          status?: string | null
          titulo?: string | null
          updated_at?: string | null
          valor_alvo?: number | null
          valor_atual?: number | null
        }
        Relationships: []
      }
      bkp_pf_transacoes: {
        Row: {
          cartao_id: string | null
          categoria_id: string | null
          conta_destino_id: string | null
          conta_id: string | null
          created_at: string | null
          data: string | null
          data_pagamento: string | null
          descricao: string | null
          fixo: boolean | null
          id: string | null
          installment_number: number | null
          is_operation_transfer: boolean | null
          observacoes: string | null
          operation_source_id: string | null
          profile_id: string | null
          status: string | null
          tipo: string | null
          total_installments: number | null
          valor: number | null
        }
        Insert: {
          cartao_id?: string | null
          categoria_id?: string | null
          conta_destino_id?: string | null
          conta_id?: string | null
          created_at?: string | null
          data?: string | null
          data_pagamento?: string | null
          descricao?: string | null
          fixo?: boolean | null
          id?: string | null
          installment_number?: number | null
          is_operation_transfer?: boolean | null
          observacoes?: string | null
          operation_source_id?: string | null
          profile_id?: string | null
          status?: string | null
          tipo?: string | null
          total_installments?: number | null
          valor?: number | null
        }
        Update: {
          cartao_id?: string | null
          categoria_id?: string | null
          conta_destino_id?: string | null
          conta_id?: string | null
          created_at?: string | null
          data?: string | null
          data_pagamento?: string | null
          descricao?: string | null
          fixo?: boolean | null
          id?: string | null
          installment_number?: number | null
          is_operation_transfer?: boolean | null
          observacoes?: string | null
          operation_source_id?: string | null
          profile_id?: string | null
          status?: string | null
          tipo?: string | null
          total_installments?: number | null
          valor?: number | null
        }
        Relationships: []
      }
      calendar_events: {
        Row: {
          created_at: string | null
          description: string | null
          end_time: string
          google_event_id: string | null
          id: string
          is_all_day: boolean | null
          priority: string | null
          profile_id: string
          recurrence: string | null
          related_client_id: string | null
          related_loan_id: string | null
          start_time: string
          status: string | null
          title: string
          type: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          end_time: string
          google_event_id?: string | null
          id?: string
          is_all_day?: boolean | null
          priority?: string | null
          profile_id: string
          recurrence?: string | null
          related_client_id?: string | null
          related_loan_id?: string | null
          start_time: string
          status?: string | null
          title: string
          type?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          end_time?: string
          google_event_id?: string | null
          id?: string
          is_all_day?: boolean | null
          priority?: string | null
          profile_id?: string
          recurrence?: string | null
          related_client_id?: string | null
          related_loan_id?: string | null
          start_time?: string
          status?: string | null
          title?: string
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_leads: {
        Row: {
          campaign_id: string
          cpf: string
          created_at: string
          id: string
          ip: string | null
          nome: string
          owner_id: string
          session_token: string
          user_agent: string | null
          valor_escolhido: number
          whatsapp: string
        }
        Insert: {
          campaign_id: string
          cpf: string
          created_at?: string
          id?: string
          ip?: string | null
          nome: string
          owner_id: string
          session_token: string
          user_agent?: string | null
          valor_escolhido: number
          whatsapp: string
        }
        Update: {
          campaign_id?: string
          cpf?: string
          created_at?: string
          id?: string
          ip?: string | null
          nome?: string
          owner_id?: string
          session_token?: string
          user_agent?: string | null
          valor_escolhido?: number
          whatsapp?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_leads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_messages: {
        Row: {
          created_at: string
          id: string
          message: string
          sender: string
          session_token: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          sender: string
          session_token: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          sender?: string
          session_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_messages_session_token_fk"
            columns: ["session_token"]
            isOneToOne: false
            referencedRelation: "campaign_leads"
            referencedColumns: ["session_token"]
          },
          {
            foreignKeyName: "campaign_messages_session_token_fk"
            columns: ["session_token"]
            isOneToOne: false
            referencedRelation: "v_captacao_inbox"
            referencedColumns: ["session_token"]
          },
        ]
      }
      campaigns: {
        Row: {
          ativa: boolean
          created_at: string
          descricao: string | null
          id: string
          nome: string
          owner_id: string
        }
        Insert: {
          ativa?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          owner_id: string
        }
        Update: {
          ativa?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          owner_id?: string
        }
        Relationships: []
      }
      categorias_financeiras: {
        Row: {
          cor: string | null
          created_at: string | null
          icone: string | null
          id: string
          nome: string
          owner_profile_id: string
          tipo: string
          updated_at: string | null
        }
        Insert: {
          cor?: string | null
          created_at?: string | null
          icone?: string | null
          id?: string
          nome: string
          owner_profile_id: string
          tipo: string
          updated_at?: string | null
        }
        Update: {
          cor?: string | null
          created_at?: string | null
          icone?: string | null
          id?: string
          nome?: string
          owner_profile_id?: string
          tipo?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      clientes: {
        Row: {
          access_code: string | null
          address: string | null
          city: string | null
          client_number: string | null
          cnpj: string | null
          cpf: string | null
          created_at: string | null
          document: string | null
          email: string | null
          foto_url: string | null
          gender: string | null
          id: string
          name: string
          notes: string | null
          owner_id: string
          phone: string | null
          photo: string | null
          portal_token: string | null
          state: string | null
        }
        Insert: {
          access_code?: string | null
          address?: string | null
          city?: string | null
          client_number?: string | null
          cnpj?: string | null
          cpf?: string | null
          created_at?: string | null
          document?: string | null
          email?: string | null
          foto_url?: string | null
          gender?: string | null
          id?: string
          name: string
          notes?: string | null
          owner_id: string
          phone?: string | null
          photo?: string | null
          portal_token?: string | null
          state?: string | null
        }
        Update: {
          access_code?: string | null
          address?: string | null
          city?: string | null
          client_number?: string | null
          cnpj?: string | null
          cpf?: string | null
          created_at?: string | null
          document?: string | null
          email?: string | null
          foto_url?: string | null
          gender?: string | null
          id?: string
          name?: string
          notes?: string | null
          owner_id?: string
          phone?: string | null
          photo?: string | null
          portal_token?: string | null
          state?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_owner_fk"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes_financeiro: {
        Row: {
          cpf: string | null
          created_at: string | null
          email: string | null
          id: string
          nome: string
          owner_profile_id: string
          telefone: string | null
          updated_at: string | null
        }
        Insert: {
          cpf?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          nome: string
          owner_profile_id: string
          telefone?: string | null
          updated_at?: string | null
        }
        Update: {
          cpf?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          nome?: string
          owner_profile_id?: string
          telefone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      clientes_old: {
        Row: {
          access_code: string | null
          access_level: number | null
          address: string | null
          city: string | null
          client_number: string | null
          cnpj: string | null
          cpf: string | null
          created_at: string | null
          document: string | null
          email: string | null
          foto_url: string | null
          gender: string | null
          id: string
          name: string
          nome_operador: string | null
          notes: string | null
          phone: string | null
          photo: string | null
          portal_token: string | null
          profile_id: string | null
          state: string | null
          usuario_email: string | null
        }
        Insert: {
          access_code?: string | null
          access_level?: number | null
          address?: string | null
          city?: string | null
          client_number?: string | null
          cnpj?: string | null
          cpf?: string | null
          created_at?: string | null
          document?: string | null
          email?: string | null
          foto_url?: string | null
          gender?: string | null
          id?: string
          name: string
          nome_operador?: string | null
          notes?: string | null
          phone?: string | null
          photo?: string | null
          portal_token?: string | null
          profile_id?: string | null
          state?: string | null
          usuario_email?: string | null
        }
        Update: {
          access_code?: string | null
          access_level?: number | null
          address?: string | null
          city?: string | null
          client_number?: string | null
          cnpj?: string | null
          cpf?: string | null
          created_at?: string | null
          document?: string | null
          email?: string | null
          foto_url?: string | null
          gender?: string | null
          id?: string
          name?: string
          nome_operador?: string | null
          notes?: string | null
          phone?: string | null
          photo?: string | null
          portal_token?: string | null
          profile_id?: string | null
          state?: string | null
          usuario_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      contas_caixa: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          id: string
          nome: string
          owner_profile_id: string
          saldo_inicial: number | null
          tipo: string
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          id?: string
          nome: string
          owner_profile_id: string
          saldo_inicial?: number | null
          tipo: string
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          id?: string
          nome?: string
          owner_profile_id?: string
          saldo_inicial?: number | null
          tipo?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      contratos: {
        Row: {
          acordo_ativo_id: string | null
          amortization_type: string | null
          billing_cycle: string | null
          client_id: string | null
          cliente_foto_url: string | null
          confissao_divida_url: string | null
          cor_alerta: string | null
          created_at: string | null
          custom_documents: Json | null
          daily_interest_percent: number | null
          debtor_address: string | null
          debtor_document: string | null
          debtor_name: string | null
          debtor_phone: string | null
          documentos: Json | null
          fine_percent: number | null
          funding_cost: number | null
          funding_fee_percent: number | null
          funding_provider: string | null
          funding_total_payable: number | null
          guarantee_description: string | null
          id: string
          interest_rate: number | null
          is_archived: boolean | null
          is_daily: boolean | null
          loan_mode: string | null
          modalidade: string | null
          mode: string | null
          next_due_date: string | null
          notes: string | null
          observacoes: string | null
          operador_responsavel_id: string | null
          owner_id: string
          payment_signals: Json | null
          payment_type: string | null
          pix_key: string | null
          policies_snapshot: Json | null
          portal_shortcode: string | null
          portal_token: string | null
          preferred_payment_method: string | null
          principal: number | null
          promissoria_url: string | null
          source_id: string | null
          start_date: string | null
          status: string | null
          total_to_receive: number | null
        }
        Insert: {
          acordo_ativo_id?: string | null
          amortization_type?: string | null
          billing_cycle?: string | null
          client_id?: string | null
          cliente_foto_url?: string | null
          confissao_divida_url?: string | null
          cor_alerta?: string | null
          created_at?: string | null
          custom_documents?: Json | null
          daily_interest_percent?: number | null
          debtor_address?: string | null
          debtor_document?: string | null
          debtor_name?: string | null
          debtor_phone?: string | null
          documentos?: Json | null
          fine_percent?: number | null
          funding_cost?: number | null
          funding_fee_percent?: number | null
          funding_provider?: string | null
          funding_total_payable?: number | null
          guarantee_description?: string | null
          id?: string
          interest_rate?: number | null
          is_archived?: boolean | null
          is_daily?: boolean | null
          loan_mode?: string | null
          modalidade?: string | null
          mode?: string | null
          next_due_date?: string | null
          notes?: string | null
          observacoes?: string | null
          operador_responsavel_id?: string | null
          owner_id: string
          payment_signals?: Json | null
          payment_type?: string | null
          pix_key?: string | null
          policies_snapshot?: Json | null
          portal_shortcode?: string | null
          portal_token?: string | null
          preferred_payment_method?: string | null
          principal?: number | null
          promissoria_url?: string | null
          source_id?: string | null
          start_date?: string | null
          status?: string | null
          total_to_receive?: number | null
        }
        Update: {
          acordo_ativo_id?: string | null
          amortization_type?: string | null
          billing_cycle?: string | null
          client_id?: string | null
          cliente_foto_url?: string | null
          confissao_divida_url?: string | null
          cor_alerta?: string | null
          created_at?: string | null
          custom_documents?: Json | null
          daily_interest_percent?: number | null
          debtor_address?: string | null
          debtor_document?: string | null
          debtor_name?: string | null
          debtor_phone?: string | null
          documentos?: Json | null
          fine_percent?: number | null
          funding_cost?: number | null
          funding_fee_percent?: number | null
          funding_provider?: string | null
          funding_total_payable?: number | null
          guarantee_description?: string | null
          id?: string
          interest_rate?: number | null
          is_archived?: boolean | null
          is_daily?: boolean | null
          loan_mode?: string | null
          modalidade?: string | null
          mode?: string | null
          next_due_date?: string | null
          notes?: string | null
          observacoes?: string | null
          operador_responsavel_id?: string | null
          owner_id?: string
          payment_signals?: Json | null
          payment_type?: string | null
          pix_key?: string | null
          policies_snapshot?: Json | null
          portal_shortcode?: string | null
          portal_token?: string | null
          preferred_payment_method?: string | null
          principal?: number | null
          promissoria_url?: string | null
          source_id?: string | null
          start_date?: string | null
          status?: string | null
          total_to_receive?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contratos_acordo_ativo_id_fkey"
            columns: ["acordo_ativo_id"]
            isOneToOne: false
            referencedRelation: "acordos_inadimplencia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_acordo_ativo_id_fkey"
            columns: ["acordo_ativo_id"]
            isOneToOne: false
            referencedRelation: "vw_acordos_com_parcelas"
            referencedColumns: ["acordo_id"]
          },
        ]
      }
      contratos_credito: {
        Row: {
          cliente_id: string
          created_at: string | null
          data_inicio: string
          data_vencimento: string
          id: string
          juros_total: number
          owner_profile_id: string
          prazo_parcelas: number
          saldo_devedor_atual: number
          status: string
          taxa_aplicada: number
          updated_at: string | null
          valor_principal: number
          valor_total: number
        }
        Insert: {
          cliente_id: string
          created_at?: string | null
          data_inicio: string
          data_vencimento: string
          id?: string
          juros_total: number
          owner_profile_id: string
          prazo_parcelas: number
          saldo_devedor_atual: number
          status?: string
          taxa_aplicada: number
          updated_at?: string | null
          valor_principal: number
          valor_total: number
        }
        Update: {
          cliente_id?: string
          created_at?: string | null
          data_inicio?: string
          data_vencimento?: string
          id?: string
          juros_total?: number
          owner_profile_id?: string
          prazo_parcelas?: number
          saldo_devedor_atual?: number
          status?: string
          taxa_aplicada?: number
          updated_at?: string | null
          valor_principal?: number
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "contratos_credito_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes_financeiro"
            referencedColumns: ["id"]
          },
        ]
      }
      contratos_old: {
        Row: {
          amortization_type: string | null
          billing_cycle: string | null
          client_id: string | null
          cliente_foto_url: string | null
          confissao_divida_url: string | null
          cor_alerta: string | null
          created_at: string | null
          custom_documents: Json | null
          daily_interest_percent: number | null
          debtor_address: string | null
          debtor_document: string | null
          debtor_name: string | null
          debtor_phone: string | null
          documentos: Json | null
          fine_percent: number | null
          funding_cost: number | null
          funding_fee_percent: number | null
          funding_provider: string | null
          funding_total_payable: number | null
          guarantee_description: string | null
          id: string
          interest_rate: number | null
          is_archived: boolean | null
          is_daily: boolean | null
          loan_mode: string | null
          modalidade: string | null
          mode: string | null
          next_due_date: string | null
          notes: string | null
          observacoes: string | null
          operador_responsavel_id: string | null
          payment_signals: Json | null
          payment_type: string | null
          pix_key: string | null
          policies_snapshot: Json | null
          portal_token: string
          preferred_payment_method: string | null
          principal: number
          profile_id: string
          promissoria_url: string | null
          source_id: string | null
          start_date: string | null
          total_to_receive: number | null
        }
        Insert: {
          amortization_type?: string | null
          billing_cycle?: string | null
          client_id?: string | null
          cliente_foto_url?: string | null
          confissao_divida_url?: string | null
          cor_alerta?: string | null
          created_at?: string | null
          custom_documents?: Json | null
          daily_interest_percent?: number | null
          debtor_address?: string | null
          debtor_document?: string | null
          debtor_name?: string | null
          debtor_phone?: string | null
          documentos?: Json | null
          fine_percent?: number | null
          funding_cost?: number | null
          funding_fee_percent?: number | null
          funding_provider?: string | null
          funding_total_payable?: number | null
          guarantee_description?: string | null
          id?: string
          interest_rate?: number | null
          is_archived?: boolean | null
          is_daily?: boolean | null
          loan_mode?: string | null
          modalidade?: string | null
          mode?: string | null
          next_due_date?: string | null
          notes?: string | null
          observacoes?: string | null
          operador_responsavel_id?: string | null
          payment_signals?: Json | null
          payment_type?: string | null
          pix_key?: string | null
          policies_snapshot?: Json | null
          portal_token?: string
          preferred_payment_method?: string | null
          principal: number
          profile_id: string
          promissoria_url?: string | null
          source_id?: string | null
          start_date?: string | null
          total_to_receive?: number | null
        }
        Update: {
          amortization_type?: string | null
          billing_cycle?: string | null
          client_id?: string | null
          cliente_foto_url?: string | null
          confissao_divida_url?: string | null
          cor_alerta?: string | null
          created_at?: string | null
          custom_documents?: Json | null
          daily_interest_percent?: number | null
          debtor_address?: string | null
          debtor_document?: string | null
          debtor_name?: string | null
          debtor_phone?: string | null
          documentos?: Json | null
          fine_percent?: number | null
          funding_cost?: number | null
          funding_fee_percent?: number | null
          funding_provider?: string | null
          funding_total_payable?: number | null
          guarantee_description?: string | null
          id?: string
          interest_rate?: number | null
          is_archived?: boolean | null
          is_daily?: boolean | null
          loan_mode?: string | null
          modalidade?: string | null
          mode?: string | null
          next_due_date?: string | null
          notes?: string | null
          observacoes?: string | null
          operador_responsavel_id?: string | null
          payment_signals?: Json | null
          payment_type?: string | null
          pix_key?: string | null
          policies_snapshot?: Json | null
          portal_token?: string
          preferred_payment_method?: string | null
          principal?: number
          profile_id?: string
          promissoria_url?: string | null
          source_id?: string | null
          start_date?: string | null
          total_to_receive?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contratos_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes_old"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_operador_responsavel_id_fkey"
            columns: ["operador_responsavel_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "fontes"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos_juridicos: {
        Row: {
          acordo_id: string | null
          client_id: string | null
          codigo_cliente: string | null
          created_at: string | null
          dono_id: string | null
          hash_sha256: string
          id: string
          ip_origem: string | null
          loan_id: string | null
          metadata_assinatura: Json | null
          numero_cliente: string | null
          profile_id: string | null
          public_access_token: string | null
          signed_at: string | null
          snapshot: Json | null
          snapshot_json: Json
          snapshot_rendered_html: string | null
          status: string | null
          status_assinatura: string | null
          template_version: string | null
          testemunhas: Json
          tipo: string | null
          tipo_documento: string | null
          token_expires_at: string | null
          updated_at: string | null
          url_storage: string | null
          user_agent: string | null
          view_token: string | null
        }
        Insert: {
          acordo_id?: string | null
          client_id?: string | null
          codigo_cliente?: string | null
          created_at?: string | null
          dono_id?: string | null
          hash_sha256: string
          id?: string
          ip_origem?: string | null
          loan_id?: string | null
          metadata_assinatura?: Json | null
          numero_cliente?: string | null
          profile_id?: string | null
          public_access_token?: string | null
          signed_at?: string | null
          snapshot?: Json | null
          snapshot_json: Json
          snapshot_rendered_html?: string | null
          status?: string | null
          status_assinatura?: string | null
          template_version?: string | null
          testemunhas?: Json
          tipo?: string | null
          tipo_documento?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          url_storage?: string | null
          user_agent?: string | null
          view_token?: string | null
        }
        Update: {
          acordo_id?: string | null
          client_id?: string | null
          codigo_cliente?: string | null
          created_at?: string | null
          dono_id?: string | null
          hash_sha256?: string
          id?: string
          ip_origem?: string | null
          loan_id?: string | null
          metadata_assinatura?: Json | null
          numero_cliente?: string | null
          profile_id?: string | null
          public_access_token?: string | null
          signed_at?: string | null
          snapshot?: Json | null
          snapshot_json?: Json
          snapshot_rendered_html?: string | null
          status?: string | null
          status_assinatura?: string | null
          template_version?: string | null
          testemunhas?: Json
          tipo?: string | null
          tipo_documento?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          url_storage?: string | null
          user_agent?: string | null
          view_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documentos_juridicos_acordo_id_fkey"
            columns: ["acordo_id"]
            isOneToOne: false
            referencedRelation: "acordos_inadimplencia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_juridicos_acordo_id_fkey"
            columns: ["acordo_id"]
            isOneToOne: false
            referencedRelation: "vw_acordos_com_parcelas"
            referencedColumns: ["acordo_id"]
          },
          {
            foreignKeyName: "documentos_juridicos_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes_old"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_juridicos_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_juridicos_profile_fk"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_juridicos_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_documentos_acordo"
            columns: ["acordo_id"]
            isOneToOne: false
            referencedRelation: "acordos_inadimplencia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_documentos_acordo"
            columns: ["acordo_id"]
            isOneToOne: false
            referencedRelation: "vw_acordos_com_parcelas"
            referencedColumns: ["acordo_id"]
          },
        ]
      }
      emprestimos: {
        Row: {
          cliente_nome: string
          data_inicio: string | null
          id: string
          parcelas: number | null
          status: string | null
          valor_total: number
        }
        Insert: {
          cliente_nome: string
          data_inicio?: string | null
          id?: string
          parcelas?: number | null
          status?: string | null
          valor_total: number
        }
        Update: {
          cliente_nome?: string
          data_inicio?: string | null
          id?: string
          parcelas?: number | null
          status?: string | null
          valor_total?: number
        }
        Relationships: []
      }
      equipes: {
        Row: {
          created_at: string | null
          id: string
          nome: string
          profile_id: string
        }
        Insert: {
          created_at?: string | null
          id: string
          nome: string
          profile_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          nome?: string
          profile_id?: string
        }
        Relationships: []
      }
      fontes: {
        Row: {
          balance: number | null
          created_at: string | null
          id: string
          logo_url: string | null
          name: string
          operador_permitido_id: string | null
          profile_id: string | null
          type: string | null
        }
        Insert: {
          balance?: number | null
          created_at?: string | null
          id?: string
          logo_url?: string | null
          name: string
          operador_permitido_id?: string | null
          profile_id?: string | null
          type?: string | null
        }
        Update: {
          balance?: number | null
          created_at?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          operador_permitido_id?: string | null
          profile_id?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fontes_operador_permitido_id_fkey"
            columns: ["operador_permitido_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fontes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      fontes_capital: {
        Row: {
          created_at: string | null
          id: string
          nome: string
          profile_id: string | null
          saldo_atual: number | null
          saldo_inicial: number | null
          tipo: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          nome: string
          profile_id?: string | null
          saldo_atual?: number | null
          saldo_inicial?: number | null
          tipo?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          nome?: string
          profile_id?: string | null
          saldo_atual?: number | null
          saldo_inicial?: number | null
          tipo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fontes_capital_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batches: {
        Row: {
          created_at: string
          filename: string | null
          id: string
          kind: string
          profile_id: string
          status: string
        }
        Insert: {
          created_at?: string
          filename?: string | null
          id?: string
          kind?: string
          profile_id: string
          status?: string
        }
        Update: {
          created_at?: string
          filename?: string | null
          id?: string
          kind?: string
          profile_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      import_rows: {
        Row: {
          batch_id: string
          created_at: string
          id: string
          normalized: Json | null
          profile_id: string
          raw: Json
          row_number: number
          sheet_name: string | null
          status: string
          validation_errors: Json | null
        }
        Insert: {
          batch_id: string
          created_at?: string
          id?: string
          normalized?: Json | null
          profile_id: string
          raw: Json
          row_number: number
          sheet_name?: string | null
          status?: string
          validation_errors?: Json | null
        }
        Update: {
          batch_id?: string
          created_at?: string
          id?: string
          normalized?: Json | null
          profile_id?: string
          raw?: Json
          row_number?: number
          sheet_name?: string | null
          status?: string
          validation_errors?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "import_rows_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      importacoes_funcionarios: {
        Row: {
          arquivo_nome: string | null
          created_at: string | null
          erros: Json | null
          id: string
          operador_id: string | null
          preview: Json | null
          status: string | null
        }
        Insert: {
          arquivo_nome?: string | null
          created_at?: string | null
          erros?: Json | null
          id?: string
          operador_id?: string | null
          preview?: Json | null
          status?: string | null
        }
        Update: {
          arquivo_nome?: string | null
          created_at?: string | null
          erros?: Json | null
          id?: string
          operador_id?: string | null
          preview?: Json | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "importacoes_funcionarios_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_entries: {
        Row: {
          amount: number
          category: string
          created_at: string
          id: string
          idempotency_key: string | null
          installment_id: string | null
          loan_id: string | null
          operator_id: string | null
          profile_id: string
          source_id: string
          type: string
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          id?: string
          idempotency_key?: string | null
          installment_id?: string | null
          loan_id?: string | null
          operator_id?: string | null
          profile_id: string
          source_id: string
          type: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          id?: string
          idempotency_key?: string | null
          installment_id?: string | null
          loan_id?: string | null
          operator_id?: string | null
          profile_id?: string
          source_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "parcelas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "fontes"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_document_templates: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          estrutura_json: Json
          html_base: string
          id: string
          tipo: string
          versao: string
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          estrutura_json: Json
          html_base: string
          id?: string
          tipo: string
          versao: string
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          estrutura_json?: Json
          html_base?: string
          id?: string
          tipo?: string
          versao?: string
        }
        Relationships: []
      }
      loan_events: {
        Row: {
          created_at: string | null
          effective_date: string | null
          event_type: string
          id: string
          loan_id: string
          payload: Json | null
          profile_id: string
        }
        Insert: {
          created_at?: string | null
          effective_date?: string | null
          event_type: string
          id?: string
          loan_id: string
          payload?: Json | null
          profile_id: string
        }
        Update: {
          created_at?: string | null
          effective_date?: string | null
          event_type?: string
          id?: string
          loan_id?: string
          payload?: Json | null
          profile_id?: string
        }
        Relationships: []
      }
      logs_acesso_cliente: {
        Row: {
          client_id: string | null
          data_acesso: string | null
          id: string
          ip_address: string | null
        }
        Insert: {
          client_id?: string | null
          data_acesso?: string | null
          id?: string
          ip_address?: string | null
        }
        Update: {
          client_id?: string | null
          data_acesso?: string | null
          id?: string
          ip_address?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "logs_acesso_cliente_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes_old"
            referencedColumns: ["id"]
          },
        ]
      }
      logs_assinatura: {
        Row: {
          action: string | null
          actor_role: string | null
          documento_id: string
          hash_no_momento: string
          id: string
          ip_address: string | null
          ip_origem: string | null
          metadata_extra: Json | null
          metodo_assinatura: string | null
          profile_id: string | null
          timestamp_assinatura: string | null
          user_agent: string | null
        }
        Insert: {
          action?: string | null
          actor_role?: string | null
          documento_id: string
          hash_no_momento: string
          id?: string
          ip_address?: string | null
          ip_origem?: string | null
          metadata_extra?: Json | null
          metodo_assinatura?: string | null
          profile_id?: string | null
          timestamp_assinatura?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string | null
          actor_role?: string | null
          documento_id?: string
          hash_no_momento?: string
          id?: string
          ip_address?: string | null
          ip_origem?: string | null
          metadata_extra?: Json | null
          metodo_assinatura?: string | null
          profile_id?: string | null
          timestamp_assinatura?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "logs_assinatura_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos_juridicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "logs_assinatura_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "vw_documento_juridico_vigente_por_acordo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "logs_assinatura_profile_fk"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      logs_sistema: {
        Row: {
          action_type: string | null
          actor_id: string | null
          created_at: string | null
          details: string | null
          id: string
          target_id: string | null
        }
        Insert: {
          action_type?: string | null
          actor_id?: string | null
          created_at?: string | null
          details?: string | null
          id?: string
          target_id?: string | null
        }
        Update: {
          action_type?: string | null
          actor_id?: string | null
          created_at?: string | null
          details?: string | null
          id?: string
          target_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "logs_sistema_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      mensagens_internas: {
        Row: {
          created_at: string | null
          id: string
          read: boolean | null
          receiver_id: string | null
          sender_id: string | null
          text: string | null
        }
        Insert: {
          created_at?: string | null
          id: string
          read?: boolean | null
          receiver_id?: string | null
          sender_id?: string | null
          text?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          read?: boolean | null
          receiver_id?: string | null
          sender_id?: string | null
          text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mensagens_internas_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagens_internas_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      mensagens_suporte: {
        Row: {
          content: string | null
          created_at: string | null
          file_url: string | null
          id: string
          loan_id: string
          metadata: Json | null
          operator_id: string | null
          profile_id: string | null
          read: boolean | null
          read_at: string | null
          read_by: string | null
          sender: string | null
          sender_type: string | null
          sender_user_id: string | null
          text: string | null
          type: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          file_url?: string | null
          id?: string
          loan_id: string
          metadata?: Json | null
          operator_id?: string | null
          profile_id?: string | null
          read?: boolean | null
          read_at?: string | null
          read_by?: string | null
          sender?: string | null
          sender_type?: string | null
          sender_user_id?: string | null
          text?: string | null
          type?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string | null
          file_url?: string | null
          id?: string
          loan_id?: string
          metadata?: Json | null
          operator_id?: string | null
          profile_id?: string | null
          read?: boolean | null
          read_at?: string | null
          read_by?: string | null
          sender?: string | null
          sender_type?: string | null
          sender_user_id?: string | null
          text?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mensagens_suporte_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagens_suporte_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagens_suporte_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      notificacoes: {
        Row: {
          action_url: string | null
          created_at: string | null
          id: string
          item_id: string | null
          item_type: string | null
          mensagem: string
          metadata: Json | null
          profile_id: string
          read_at: string | null
          titulo: string
        }
        Insert: {
          action_url?: string | null
          created_at?: string | null
          id?: string
          item_id?: string | null
          item_type?: string | null
          mensagem: string
          metadata?: Json | null
          profile_id: string
          read_at?: string | null
          titulo: string
        }
        Update: {
          action_url?: string | null
          created_at?: string | null
          id?: string
          item_id?: string | null
          item_type?: string | null
          mensagem?: string
          metadata?: Json | null
          profile_id?: string
          read_at?: string | null
          titulo?: string
        }
        Relationships: []
      }
      pagamentos: {
        Row: {
          conta_caixa_id: string
          created_at: string | null
          data_pagamento: string
          forma_pagamento: string | null
          id: string
          juros_pago: number
          observacao: string | null
          owner_profile_id: string
          parcela_id: string
          principal_pago: number
          updated_at: string | null
          valor_pago: number
        }
        Insert: {
          conta_caixa_id: string
          created_at?: string | null
          data_pagamento: string
          forma_pagamento?: string | null
          id?: string
          juros_pago: number
          observacao?: string | null
          owner_profile_id: string
          parcela_id: string
          principal_pago: number
          updated_at?: string | null
          valor_pago: number
        }
        Update: {
          conta_caixa_id?: string
          created_at?: string | null
          data_pagamento?: string
          forma_pagamento?: string | null
          id?: string
          juros_pago?: number
          observacao?: string | null
          owner_profile_id?: string
          parcela_id?: string
          principal_pago?: number
          updated_at?: string | null
          valor_pago?: number
        }
        Relationships: [
          {
            foreignKeyName: "pagamentos_conta_caixa_id_fkey"
            columns: ["conta_caixa_id"]
            isOneToOne: false
            referencedRelation: "contas_caixa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_parcela_id_fkey"
            columns: ["parcela_id"]
            isOneToOne: false
            referencedRelation: "parcelas_contrato"
            referencedColumns: ["id"]
          },
        ]
      }
      parcelas: {
        Row: {
          amount: number | null
          av_applied: number | null
          data_vencimento: string | null
          due_date: string | null
          id: string
          interest_remaining: number | null
          last_payment_date: string | null
          late_fee_accrued: number | null
          loan_id: string | null
          logs: Json | null
          numero_parcela: number | null
          paid_date: string | null
          paid_interest: number | null
          paid_late_fee: number | null
          paid_principal: number | null
          paid_total: number | null
          principal_remaining: number | null
          profile_id: string | null
          renewal_count: number
          scheduled_interest: number | null
          scheduled_principal: number | null
          start_date: string | null
          status: string | null
          valor_parcela: number | null
        }
        Insert: {
          amount?: number | null
          av_applied?: number | null
          data_vencimento?: string | null
          due_date?: string | null
          id?: string
          interest_remaining?: number | null
          last_payment_date?: string | null
          late_fee_accrued?: number | null
          loan_id?: string | null
          logs?: Json | null
          numero_parcela?: number | null
          paid_date?: string | null
          paid_interest?: number | null
          paid_late_fee?: number | null
          paid_principal?: number | null
          paid_total?: number | null
          principal_remaining?: number | null
          profile_id?: string | null
          renewal_count?: number
          scheduled_interest?: number | null
          scheduled_principal?: number | null
          start_date?: string | null
          status?: string | null
          valor_parcela?: number | null
        }
        Update: {
          amount?: number | null
          av_applied?: number | null
          data_vencimento?: string | null
          due_date?: string | null
          id?: string
          interest_remaining?: number | null
          last_payment_date?: string | null
          late_fee_accrued?: number | null
          loan_id?: string | null
          logs?: Json | null
          numero_parcela?: number | null
          paid_date?: string | null
          paid_interest?: number | null
          paid_late_fee?: number | null
          paid_principal?: number | null
          paid_total?: number | null
          principal_remaining?: number | null
          profile_id?: string | null
          renewal_count?: number
          scheduled_interest?: number | null
          scheduled_principal?: number | null
          start_date?: string | null
          status?: string | null
          valor_parcela?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "parcelas_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcelas_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      parcelas_contrato: {
        Row: {
          contrato_id: string
          created_at: string | null
          id: string
          juros_pago: number | null
          juros_previsto: number
          numero_parcela: number
          owner_profile_id: string
          principal_pago: number | null
          principal_previsto: number
          saldo_restante: number
          status: string
          updated_at: string | null
          valor_parcela: number
          vencimento: string
        }
        Insert: {
          contrato_id: string
          created_at?: string | null
          id?: string
          juros_pago?: number | null
          juros_previsto: number
          numero_parcela: number
          owner_profile_id: string
          principal_pago?: number | null
          principal_previsto: number
          saldo_restante: number
          status?: string
          updated_at?: string | null
          valor_parcela: number
          vencimento: string
        }
        Update: {
          contrato_id?: string
          created_at?: string | null
          id?: string
          juros_pago?: number | null
          juros_previsto?: number
          numero_parcela?: number
          owner_profile_id?: string
          principal_pago?: number | null
          principal_previsto?: number
          saldo_restante?: number
          status?: string
          updated_at?: string | null
          valor_parcela?: number
          vencimento?: string
        }
        Relationships: [
          {
            foreignKeyName: "parcelas_contrato_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos_credito"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_charges: {
        Row: {
          acordo_id: string | null
          acordo_parcela_id: string | null
          amount: number
          created_at: string
          currency: string
          external_reference: string
          id: string
          installment_id: string | null
          loan_id: string | null
          paid_at: string | null
          payer_doc: string | null
          payer_email: string | null
          payer_name: string | null
          provider: string
          provider_payload: Json | null
          provider_payment_id: string | null
          provider_status: string | null
          qr_code: string | null
          qr_code_base64: string | null
          status: string
          updated_at: string
        }
        Insert: {
          acordo_id?: string | null
          acordo_parcela_id?: string | null
          amount: number
          created_at?: string
          currency?: string
          external_reference: string
          id?: string
          installment_id?: string | null
          loan_id?: string | null
          paid_at?: string | null
          payer_doc?: string | null
          payer_email?: string | null
          payer_name?: string | null
          provider: string
          provider_payload?: Json | null
          provider_payment_id?: string | null
          provider_status?: string | null
          qr_code?: string | null
          qr_code_base64?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          acordo_id?: string | null
          acordo_parcela_id?: string | null
          amount?: number
          created_at?: string
          currency?: string
          external_reference?: string
          id?: string
          installment_id?: string | null
          loan_id?: string | null
          paid_at?: string | null
          payer_doc?: string | null
          payer_email?: string | null
          payer_name?: string | null
          provider?: string
          provider_payload?: Json | null
          provider_payment_id?: string | null
          provider_status?: string | null
          qr_code?: string | null
          qr_code_base64?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      payment_events: {
        Row: {
          acordo_id: string | null
          acordo_parcela_id: string | null
          amount: number | null
          currency: string | null
          event_id: string
          event_type: string
          id: string
          installment_id: string | null
          loan_id: string | null
          payload: Json
          process_result: Json | null
          provider: string
          received_at: string
          status: string
        }
        Insert: {
          acordo_id?: string | null
          acordo_parcela_id?: string | null
          amount?: number | null
          currency?: string | null
          event_id: string
          event_type: string
          id?: string
          installment_id?: string | null
          loan_id?: string | null
          payload: Json
          process_result?: Json | null
          provider: string
          received_at?: string
          status?: string
        }
        Update: {
          acordo_id?: string | null
          acordo_parcela_id?: string | null
          amount?: number | null
          currency?: string | null
          event_id?: string
          event_type?: string
          id?: string
          installment_id?: string | null
          loan_id?: string | null
          payload?: Json
          process_result?: Json | null
          provider?: string
          received_at?: string
          status?: string
        }
        Relationships: []
      }
      payment_idempotency: {
        Row: {
          action: string
          created_at: string
          id: string
          installment_id: string | null
          loan_id: string
          profile_id: string
        }
        Insert: {
          action?: string
          created_at?: string
          id: string
          installment_id?: string | null
          loan_id: string
          profile_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          installment_id?: string | null
          loan_id?: string
          profile_id?: string
        }
        Relationships: []
      }
      payment_intents: {
        Row: {
          client_id: string
          client_viewed_at: string | null
          comprovante_url: string | null
          created_at: string
          id: string
          loan_id: string
          profile_id: string
          review_note: string | null
          reviewed_at: string | null
          status: string
          tipo: string
        }
        Insert: {
          client_id: string
          client_viewed_at?: string | null
          comprovante_url?: string | null
          created_at?: string
          id?: string
          loan_id: string
          profile_id: string
          review_note?: string | null
          reviewed_at?: string | null
          status?: string
          tipo: string
        }
        Update: {
          client_id?: string
          client_viewed_at?: string | null
          comprovante_url?: string | null
          created_at?: string
          id?: string
          loan_id?: string
          profile_id?: string
          review_note?: string | null
          reviewed_at?: string | null
          status?: string
          tipo?: string
        }
        Relationships: []
      }
      payment_reversals: {
        Row: {
          id: string
          installment_id: string
          payment_id: string
          reversal_reason: string | null
          reversed_at: string | null
          reversed_by: string
        }
        Insert: {
          id?: string
          installment_id: string
          payment_id: string
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by: string
        }
        Update: {
          id?: string
          installment_id?: string
          payment_id?: string
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_reversals_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "parcelas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_reversals_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payment_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_reversals_reversed_by_fkey"
            columns: ["reversed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_transactions: {
        Row: {
          amount: number
          contract_id: string
          created_at: string | null
          id: string
          idempotency_key: string | null
          installment_id: string
          operator_profile_id: string | null
          paid_at: string | null
          payment_method: string | null
          status: string
        }
        Insert: {
          amount: number
          contract_id: string
          created_at?: string | null
          id?: string
          idempotency_key?: string | null
          installment_id: string
          operator_profile_id?: string | null
          paid_at?: string | null
          payment_method?: string | null
          status?: string
        }
        Update: {
          amount?: number
          contract_id?: string
          created_at?: string | null
          id?: string
          idempotency_key?: string | null
          installment_id?: string
          operator_profile_id?: string | null
          paid_at?: string | null
          payment_method?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_transactions_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "parcelas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_operator_profile_id_fkey"
            columns: ["operator_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      perfis: {
        Row: {
          access_code: string | null
          access_level: number | null
          address: string | null
          address_number: string | null
          avatar_url: string | null
          brand_color: string | null
          city: string | null
          contato_whatsapp: string | null
          created_at: string | null
          default_daily_interest_percent: number | null
          default_fine_percent: number | null
          default_interest_rate: number | null
          document: string | null
          dono_id: string | null
          email: string | null
          escola_id: string | null
          id: string
          interest_balance: number | null
          last_active_at: string | null
          logo_url: string | null
          mp_access_token: string | null
          neighborhood: string | null
          nome_completo: string | null
          nome_empresa: string | null
          nome_exibicao: string | null
          nome_operador: string | null
          owner_profile_id: string | null
          perfil: string
          phone: string | null
          photo: string | null
          pix_key: string | null
          recovery_phrase: string | null
          senha_acesso: string | null
          state: string | null
          supervisor_id: string | null
          target_capital: number | null
          target_profit: number | null
          total_available_capital: number | null
          ui_hub_order: Json | null
          ui_nav_order: Json | null
          ui_mobile_nav_order: Json | null
          updated_at: string | null
          user_id: string | null
          usuario_email: string
          zip_code: string | null
        }
        Insert: {
          access_code?: string | null
          access_level?: number | null
          address?: string | null
          address_number?: string | null
          avatar_url?: string | null
          brand_color?: string | null
          city?: string | null
          contato_whatsapp?: string | null
          created_at?: string | null
          default_daily_interest_percent?: number | null
          default_fine_percent?: number | null
          default_interest_rate?: number | null
          document?: string | null
          dono_id?: string | null
          email?: string | null
          escola_id?: string | null
          id?: string
          interest_balance?: number | null
          last_active_at?: string | null
          logo_url?: string | null
          mp_access_token?: string | null
          neighborhood?: string | null
          nome_completo?: string | null
          nome_empresa?: string | null
          nome_exibicao?: string | null
          nome_operador?: string | null
          owner_profile_id?: string | null
          perfil?: string
          phone?: string | null
          photo?: string | null
          pix_key?: string | null
          recovery_phrase?: string | null
          senha_acesso?: string | null
          state?: string | null
          supervisor_id?: string | null
          target_capital?: number | null
          target_profit?: number | null
          total_available_capital?: number | null
          ui_hub_order?: Json | null
          ui_nav_order?: Json | null
          ui_mobile_nav_order?: Json | null
          updated_at?: string | null
          user_id?: string | null
          usuario_email: string
          zip_code?: string | null
        }
        Update: {
          access_code?: string | null
          access_level?: number | null
          address?: string | null
          address_number?: string | null
          avatar_url?: string | null
          brand_color?: string | null
          city?: string | null
          contato_whatsapp?: string | null
          created_at?: string | null
          default_daily_interest_percent?: number | null
          default_fine_percent?: number | null
          default_interest_rate?: number | null
          document?: string | null
          dono_id?: string | null
          email?: string | null
          escola_id?: string | null
          id?: string
          interest_balance?: number | null
          last_active_at?: string | null
          logo_url?: string | null
          mp_access_token?: string | null
          neighborhood?: string | null
          nome_completo?: string | null
          nome_empresa?: string | null
          nome_exibicao?: string | null
          nome_operador?: string | null
          owner_profile_id?: string | null
          perfil?: string
          phone?: string | null
          photo?: string | null
          pix_key?: string | null
          recovery_phrase?: string | null
          senha_acesso?: string | null
          state?: string | null
          supervisor_id?: string | null
          target_capital?: number | null
          target_profit?: number | null
          total_available_capital?: number | null
          ui_hub_order?: Json | null
          ui_nav_order?: Json | null
          ui_mobile_nav_order?: Json | null
          updated_at?: string | null
          user_id?: string | null
          usuario_email?: string
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "perfis_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      perfis_config_asaas: {
        Row: {
          asaas_api_key: string
          created_at: string | null
          profile_id: string
          updated_at: string | null
        }
        Insert: {
          asaas_api_key: string
          created_at?: string | null
          profile_id: string
          updated_at?: string | null
        }
        Update: {
          asaas_api_key?: string
          created_at?: string | null
          profile_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "perfis_config_asaas_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      perfis_config_mp: {
        Row: {
          created_at: string | null
          id: string
          mp_access_token: string
          mp_public_key: string | null
          mp_webhook_secret: string | null
          profile_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          mp_access_token: string
          mp_public_key?: string | null
          mp_webhook_secret?: string | null
          profile_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          mp_access_token?: string
          mp_public_key?: string | null
          mp_webhook_secret?: string | null
          profile_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "perfis_config_mp_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      pf_accounts: {
        Row: {
          created_at: string | null
          id: string
          nome: string
          profile_id: string
          saldo: number
          tipo: string
          updated_at: string | null
          wallet_type: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          nome: string
          profile_id: string
          saldo?: number
          tipo: string
          updated_at?: string | null
          wallet_type?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          nome?: string
          profile_id?: string
          saldo?: number
          tipo?: string
          updated_at?: string | null
          wallet_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pf_accounts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      pf_transactions: {
        Row: {
          cartao_id: string | null
          categoria_id: string | null
          conta_id: string
          created_at: string | null
          data: string
          data_pagamento: string | null
          descricao: string
          id: string
          installment_number: number | null
          is_operation_transfer: boolean | null
          operation_source_id: string | null
          owner_id: string
          status: string
          tipo: string
          total_installments: number | null
          updated_at: string | null
          valor: number
        }
        Insert: {
          cartao_id?: string | null
          categoria_id?: string | null
          conta_id: string
          created_at?: string | null
          data?: string
          data_pagamento?: string | null
          descricao: string
          id?: string
          installment_number?: number | null
          is_operation_transfer?: boolean | null
          operation_source_id?: string | null
          owner_id: string
          status?: string
          tipo: string
          total_installments?: number | null
          updated_at?: string | null
          valor: number
        }
        Update: {
          cartao_id?: string | null
          categoria_id?: string | null
          conta_id?: string
          created_at?: string | null
          data?: string
          data_pagamento?: string | null
          descricao?: string
          id?: string
          installment_number?: number | null
          is_operation_transfer?: boolean | null
          operation_source_id?: string | null
          owner_id?: string
          status?: string
          tipo?: string
          total_installments?: number | null
          updated_at?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "pf_transactions_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "pf_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pf_transactions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_client_links: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          last_used_at: string | null
          token: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          token: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_client_links_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_doc_tokens: {
        Row: {
          client_id: string | null
          created_at: string | null
          created_by: string | null
          documento_id: string
          expires_at: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          documento_id: string
          expires_at: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          documento_id?: string
          expires_at?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portal_doc_tokens_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes_old"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_doc_tokens_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos_juridicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_doc_tokens_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "vw_documento_juridico_vigente_por_acordo"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_sessions: {
        Row: {
          client_id: string
          created_at: string | null
          expires_at: string
          id: string
          ip: string | null
          last_seen_at: string | null
          loan_id: string
          user_agent: string | null
        }
        Insert: {
          client_id: string
          created_at?: string | null
          expires_at: string
          id?: string
          ip?: string | null
          last_seen_at?: string | null
          loan_id: string
          user_agent?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string | null
          expires_at?: string
          id?: string
          ip?: string | null
          last_seen_at?: string | null
          loan_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portal_sessions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes_old"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_sessions_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "contratos_old"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_tokens: {
        Row: {
          client_id: string
          created_at: string | null
          expires_at: string | null
          id: string
          last_accessed_at: string | null
          loan_id: string
          shortcode: string | null
          status: string | null
        }
        Insert: {
          client_id: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          last_accessed_at?: string | null
          loan_id: string
          shortcode?: string | null
          status?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          last_accessed_at?: string | null
          loan_id?: string
          shortcode?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portal_tokens_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_tokens_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          email: string | null
          full_name: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      sinalizacoes_pagamento: {
        Row: {
          client_id: string | null
          client_viewed_at: string | null
          comprovante_url: string | null
          created_at: string | null
          id: string
          loan_id: string | null
          profile_id: string | null
          review_note: string | null
          reviewed_at: string | null
          status: string | null
          tipo_intencao: string | null
        }
        Insert: {
          client_id?: string | null
          client_viewed_at?: string | null
          comprovante_url?: string | null
          created_at?: string | null
          id?: string
          loan_id?: string | null
          profile_id?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          status?: string | null
          tipo_intencao?: string | null
        }
        Update: {
          client_id?: string | null
          client_viewed_at?: string | null
          comprovante_url?: string | null
          created_at?: string | null
          id?: string
          loan_id?: string | null
          profile_id?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          status?: string | null
          tipo_intencao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sinalizacoes_pagamento_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes_old"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sinalizacoes_pagamento_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sinalizacoes_pagamento_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      support_calls: {
        Row: {
          answer_sdp: string | null
          call_type: string
          callee_role: string
          caller_profile_id: string
          created_at: string
          ended_at: string | null
          ice_candidates: Json
          id: string
          loan_id: string
          offer_sdp: string | null
          status: string
          updated_at: string
        }
        Insert: {
          answer_sdp?: string | null
          call_type?: string
          callee_role: string
          caller_profile_id: string
          created_at?: string
          ended_at?: string | null
          ice_candidates?: Json
          id?: string
          loan_id: string
          offer_sdp?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          answer_sdp?: string | null
          call_type?: string
          callee_role?: string
          caller_profile_id?: string
          created_at?: string
          ended_at?: string | null
          ice_candidates?: Json
          id?: string
          loan_id?: string
          offer_sdp?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      support_presence: {
        Row: {
          last_seen_at: string
          loan_id: string
          profile_id: string
          role: string
        }
        Insert: {
          last_seen_at?: string
          loan_id: string
          profile_id: string
          role: string
        }
        Update: {
          last_seen_at?: string
          loan_id?: string
          profile_id?: string
          role?: string
        }
        Relationships: []
      }
      support_signals: {
        Row: {
          created_at: string
          from_user_id: string
          id: string
          loan_id: string
          payload: Json
          profile_id: string
          to_user_id: string
          type: Database["public"]["Enums"]["support_signal_type"]
        }
        Insert: {
          created_at?: string
          from_user_id: string
          id?: string
          loan_id: string
          payload?: Json
          profile_id: string
          to_user_id: string
          type: Database["public"]["Enums"]["support_signal_type"]
        }
        Update: {
          created_at?: string
          from_user_id?: string
          id?: string
          loan_id?: string
          payload?: Json
          profile_id?: string
          to_user_id?: string
          type?: Database["public"]["Enums"]["support_signal_type"]
        }
        Relationships: []
      }
      support_tickets: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          id: string
          loan_id: string
          profile_id: string
          reopened_at: string | null
          reopened_by: string | null
          status: Database["public"]["Enums"]["support_ticket_status"]
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          loan_id: string
          profile_id: string
          reopened_at?: string | null
          reopened_by?: string | null
          status?: Database["public"]["Enums"]["support_ticket_status"]
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          loan_id?: string
          profile_id?: string
          reopened_at?: string | null
          reopened_by?: string | null
          status?: Database["public"]["Enums"]["support_ticket_status"]
          updated_at?: string
        }
        Relationships: []
      }
      team_invites: {
        Row: {
          accepted_at: string | null
          accepted_profile_id: string | null
          created_at: string | null
          expires_at: string
          id: string
          invited_email: string | null
          is_active: boolean | null
          level: number
          owner_profile_id: string | null
          revoked_at: string | null
          role: string
          team_id: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_profile_id?: string | null
          created_at?: string | null
          expires_at?: string
          id?: string
          invited_email?: string | null
          is_active?: boolean | null
          level?: number
          owner_profile_id?: string | null
          revoked_at?: string | null
          role?: string
          team_id: string
          token: string
        }
        Update: {
          accepted_at?: string | null
          accepted_profile_id?: string | null
          created_at?: string | null
          expires_at?: string
          id?: string
          invited_email?: string | null
          is_active?: boolean | null
          level?: number
          owner_profile_id?: string | null
          revoked_at?: string | null
          role?: string
          team_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_invites_accepted_profile_id_fkey"
            columns: ["accepted_profile_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_invites_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_invites_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          cpf: string
          created_at: string | null
          expires_at: string | null
          full_name: string
          id: string
          invite_status: string | null
          invite_token: string | null
          linked_profile_id: string | null
          profile_id: string | null
          role: string | null
          team_id: string
          username_or_email: string
        }
        Insert: {
          cpf: string
          created_at?: string | null
          expires_at?: string | null
          full_name: string
          id?: string
          invite_status?: string | null
          invite_token?: string | null
          linked_profile_id?: string | null
          profile_id?: string | null
          role?: string | null
          team_id: string
          username_or_email: string
        }
        Update: {
          cpf?: string
          created_at?: string | null
          expires_at?: string | null
          full_name?: string
          id?: string
          invite_status?: string | null
          invite_token?: string | null
          linked_profile_id?: string | null
          profile_id?: string | null
          role?: string | null
          team_id?: string
          username_or_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_linked_profile_id_fkey"
            columns: ["linked_profile_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_profile_fk"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string | null
          id: string
          name: string
          owner_profile_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          owner_profile_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          owner_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      testemunhas: {
        Row: {
          created_at: string | null
          documento: string
          id: string
          nome: string
          profile_id: string | null
        }
        Insert: {
          created_at?: string | null
          documento: string
          id?: string
          nome: string
          profile_id?: string | null
        }
        Update: {
          created_at?: string | null
          documento?: string
          id?: string
          nome?: string
          profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "testemunhas_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      transacoes: {
        Row: {
          amount: number | null
          category: string | null
          created_at: string | null
          date: string | null
          description: string | null
          edit_reason: string | null
          edited_at: string | null
          edited_by: string | null
          id: string
          idempotency_key: string | null
          installment_id: string | null
          interest_delta: number | null
          late_fee_delta: number | null
          loan_id: string | null
          meta: Json | null
          notes: string | null
          operator_id: string | null
          original_tx_id: string | null
          payment_charge_id: string | null
          payment_type: string | null
          principal_delta: number | null
          profile_id: string
          request_id: string | null
          reversed_of_transaction_id: string | null
          source_id: string | null
          type: string | null
        }
        Insert: {
          amount?: number | null
          category?: string | null
          created_at?: string | null
          date?: string | null
          description?: string | null
          edit_reason?: string | null
          edited_at?: string | null
          edited_by?: string | null
          id?: string
          idempotency_key?: string | null
          installment_id?: string | null
          interest_delta?: number | null
          late_fee_delta?: number | null
          loan_id?: string | null
          meta?: Json | null
          notes?: string | null
          operator_id?: string | null
          original_tx_id?: string | null
          payment_charge_id?: string | null
          payment_type?: string | null
          principal_delta?: number | null
          profile_id: string
          request_id?: string | null
          reversed_of_transaction_id?: string | null
          source_id?: string | null
          type?: string | null
        }
        Update: {
          amount?: number | null
          category?: string | null
          created_at?: string | null
          date?: string | null
          description?: string | null
          edit_reason?: string | null
          edited_at?: string | null
          edited_by?: string | null
          id?: string
          idempotency_key?: string | null
          installment_id?: string | null
          interest_delta?: number | null
          late_fee_delta?: number | null
          loan_id?: string | null
          meta?: Json | null
          notes?: string | null
          operator_id?: string | null
          original_tx_id?: string | null
          payment_charge_id?: string | null
          payment_type?: string | null
          principal_delta?: number | null
          profile_id?: string
          request_id?: string | null
          reversed_of_transaction_id?: string | null
          source_id?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transacoes_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "parcelas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "fontes"
            referencedColumns: ["id"]
          },
        ]
      }
      transacoes_financeiras: {
        Row: {
          categoria_id: string | null
          conta_caixa_id: string | null
          created_at: string | null
          data: string
          descricao: string
          id: string
          owner_profile_id: string
          referencia_id: string | null
          referencia_tipo: string | null
          tipo: string
          updated_at: string | null
          valor: number
        }
        Insert: {
          categoria_id?: string | null
          conta_caixa_id?: string | null
          created_at?: string | null
          data: string
          descricao: string
          id?: string
          owner_profile_id: string
          referencia_id?: string | null
          referencia_tipo?: string | null
          tipo: string
          updated_at?: string | null
          valor: number
        }
        Update: {
          categoria_id?: string | null
          conta_caixa_id?: string | null
          created_at?: string | null
          data?: string
          descricao?: string
          id?: string
          owner_profile_id?: string
          referencia_id?: string | null
          referencia_tipo?: string | null
          tipo?: string
          updated_at?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "transacoes_financeiras_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias_financeiras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_financeiras_conta_caixa_id_fkey"
            columns: ["conta_caixa_id"]
            isOneToOne: false
            referencedRelation: "contas_caixa"
            referencedColumns: ["id"]
          },
        ]
      }
      user_integrations: {
        Row: {
          google_access_token: string | null
          google_calendar_id: string | null
          google_refresh_token: string | null
          google_token_expiry: number | null
          last_sync_at: string | null
          profile_id: string
          sync_enabled: boolean | null
          updated_at: string | null
        }
        Insert: {
          google_access_token?: string | null
          google_calendar_id?: string | null
          google_refresh_token?: string | null
          google_token_expiry?: number | null
          last_sync_at?: string | null
          profile_id: string
          sync_enabled?: boolean | null
          updated_at?: string | null
        }
        Update: {
          google_access_token?: string | null
          google_calendar_id?: string | null
          google_refresh_token?: string | null
          google_token_expiry?: number | null
          last_sync_at?: string | null
          profile_id?: string
          sync_enabled?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      v_captacao_inbox: {
        Row: {
          campaign_id: string | null
          cpf: string | null
          lead_created_at: string | null
          lead_id: string | null
          nome: string | null
          session_token: string | null
          ultima_msg: string | null
          ultima_msg_em: string | null
          ultimo_sender: string | null
          valor_escolhido: number | null
          whatsapp: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_leads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_acordos_com_parcelas: {
        Row: {
          acordo_id: string | null
          amount: number | null
          created_at: string | null
          due_date: string | null
          first_due_date: string | null
          juros_mensal_percent: number | null
          loan_id: string | null
          num_parcelas: number | null
          numero: number | null
          paid_amount: number | null
          paid_at: string | null
          parcela_id: string | null
          parcela_status: string | null
          periodicidade: string | null
          profile_id: string | null
          status: string | null
          tipo: string | null
          total_base: number | null
          total_negociado: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "acordos_inadimplencia_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acordos_inadimplencia_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_aging_inadimplencia: {
        Row: {
          faixa_atraso: string | null
          profile_id: string | null
          quantidade_parcelas: number | null
          saldo_atrasado: number | null
        }
        Relationships: [
          {
            foreignKeyName: "parcelas_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_documento_juridico_vigente_por_acordo: {
        Row: {
          acordo_id: string | null
          created_at: string | null
          id: string | null
          loan_id: string | null
          status_assinatura: string | null
          tipo_documento: string | null
          view_token: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documentos_juridicos_acordo_id_fkey"
            columns: ["acordo_id"]
            isOneToOne: false
            referencedRelation: "acordos_inadimplencia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_juridicos_acordo_id_fkey"
            columns: ["acordo_id"]
            isOneToOne: false
            referencedRelation: "vw_acordos_com_parcelas"
            referencedColumns: ["acordo_id"]
          },
          {
            foreignKeyName: "documentos_juridicos_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_documentos_acordo"
            columns: ["acordo_id"]
            isOneToOne: false
            referencedRelation: "acordos_inadimplencia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_documentos_acordo"
            columns: ["acordo_id"]
            isOneToOne: false
            referencedRelation: "vw_acordos_com_parcelas"
            referencedColumns: ["acordo_id"]
          },
        ]
      }
      vw_fluxo_projetado_mensal: {
        Row: {
          juros_previsto: number | null
          mes: string | null
          principal_previsto: number | null
          saldo_a_receber: number | null
          total_previsto: number | null
          total_recebido: number | null
        }
        Relationships: []
      }
      vw_health_score: {
        Row: {
          capital_investido: number | null
          capital_recuperado: number | null
          health_score: number | null
          indice_recuperacao_percentual: number | null
          lucro_realizado: number | null
          profile_id: string | null
          roi_percentual: number | null
        }
        Relationships: [
          {
            foreignKeyName: "transacoes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_inadimplencia_atual: {
        Row: {
          parcelas_vencidas: number | null
          profile_id: string | null
          saldo_vencido: number | null
        }
        Relationships: [
          {
            foreignKeyName: "parcelas_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_indice_recuperacao: {
        Row: {
          capital_investido: number | null
          capital_recuperado: number | null
          indice_recuperacao_percentual: number | null
          profile_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transacoes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_risco_profile: {
        Row: {
          capital_em_risco: number | null
          profile_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transacoes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_roi_profile: {
        Row: {
          capital_investido: number | null
          capital_recuperado: number | null
          lucro_realizado: number | null
          profile_id: string | null
          roi_percentual: number | null
        }
        Relationships: [
          {
            foreignKeyName: "transacoes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_saldo_capital_lucro: {
        Row: {
          profile_id: string | null
          saldo_capital: number | null
          saldo_lucro: number | null
          saldo_total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "transacoes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_saldo_contabil: {
        Row: {
          profile_id: string | null
          saldo_capital: number | null
          saldo_lucro: number | null
          saldo_total_contabil: number | null
        }
        Relationships: [
          {
            foreignKeyName: "transacoes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_score_risco_profile: {
        Row: {
          classificacao: string | null
          profile_id: string | null
          risco_nivel: number | null
        }
        Relationships: [
          {
            foreignKeyName: "parcelas_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_stress_test: {
        Row: {
          capital_em_risco: number | null
          lucro_pos_stress: number | null
          perda_simulada_20_percent: number | null
          profile_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transacoes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_team_invite:
        | {
            Args: {
              p_access_code: string
              p_cpf: string
              p_email: string
              p_full_name: string
              p_invite_token: string
              p_phone: string
            }
            Returns: string
          }
        | {
            Args: {
              p_access_code?: string
              p_cpf: string
              p_email: string
              p_full_name: string
              p_invite_token: string
              p_password: string
              p_phone: string
            }
            Returns: string
          }
      adjust_loan_principal: {
        Args: { p_delta: number; p_loan_id: string }
        Returns: undefined
      }
      adjust_source_balance: {
        Args: { p_delta: number; p_source_id: string }
        Returns: undefined
      }
      admin_set_profile_password: {
        Args: { p_email: string; p_new_password: string }
        Returns: string
      }
      apply_aporte: {
        Args: {
          p_amount: number
          p_loan_id: string
          p_operator_id: string
          p_profile_id: string
          p_source_id: string
          p_target_installment_id?: string
        }
        Returns: undefined
      }
      apply_new_aporte_atomic: {
        Args: {
          p_amount: number
          p_installment_id?: string
          p_loan_id: string
          p_notes?: string
          p_operator_id: string
          p_profile_id: string
          p_source_id?: string
        }
        Returns: undefined
      }
      apply_payment_in_for_charge: {
        Args: { p_charge_id: string; p_source_id: string }
        Returns: Json
      }
      assinar_documento_publico: {
        Args: {
          p_documento_id: string
          p_ip: string
          p_signer_document: string
          p_signer_email: string
          p_signer_name: string
          p_user_agent: string
        }
        Returns: undefined
      }
      backup_20260130_copy_table: {
        Args: { p_table: string }
        Returns: undefined
      }
      campaign_add_message: {
        Args: { p_message: string; p_sender: string; p_session_token: string }
        Returns: Json
      }
      campaign_belongs_to_current_owner: {
        Args: { p_campaign_id: string }
        Returns: boolean
      }
      campaign_create_lead_session: {
        Args: {
          p_campaign_id: string
          p_cpf: string
          p_ip: string
          p_nome: string
          p_user_agent: string
          p_valor: number
          p_whatsapp: string
        }
        Returns: Json
      }
      campaign_list_messages: {
        Args: { p_session_token: string }
        Returns: {
          created_at: string
          id: string
          message: string
          sender: string
          session_token: string
        }[]
      }
      campaign_owner_id: { Args: { p_campaign_id: string }; Returns: string }
      check_access: { Args: { target_profile_id: string }; Returns: boolean }
      check_access_universal: {
        Args: { row_profile_id: string }
        Returns: boolean
      }
      check_admin_access: { Args: { row_profile_id: string }; Returns: boolean }
      check_all_signatures_complete: {
        Args: { p_documento_id: string }
        Returns: boolean
      }
      check_invite_expiration: { Args: never; Returns: undefined }
      check_user_access: { Args: { row_profile_id: string }; Returns: boolean }
      create_acordo_inadimplencia_atomic: {
        Args: {
          p_first_due_date: string
          p_installments: number
          p_interest_rate: number
          p_loan_id: string
          p_profile_id: string
          p_total_amount: number
        }
        Returns: string
      }
      create_documento_juridico_by_loan:
        | {
            Args: {
              p_acordo_id: string
              p_loan_id: string
              p_snapshot: Json
              p_tipo: string
            }
            Returns: {
              id: string
              view_token: string
            }[]
          }
        | {
            Args: {
              p_acordo_id?: string
              p_dono_id?: string
              p_loan_id: string
              p_snapshot: Json
              p_tipo: string
            }
            Returns: {
              acordo_id: string
              created_at: string
              hash_sha256: string
              id: string
              status_assinatura: string
              view_token: string
            }[]
          }
      create_notification: {
        Args: {
          p_action_url?: string
          p_item_id?: string
          p_item_type?: string
          p_mensagem: string
          p_metadata?: Json
          p_profile_id: string
          p_titulo: string
        }
        Returns: string
      }
      create_sign_token: {
        Args: { p_documento_id: string; p_ttl_minutes?: number }
        Returns: string
      }
      create_team: {
        Args: { p_name: string }
        Returns: {
          created_at: string | null
          id: string
          name: string
          owner_profile_id: string
        }
        SetofOptions: {
          from: "*"
          to: "teams"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      criar_contrato_com_parcelas: {
        Args: {
          p_cliente: string
          p_data_inicio: string
          p_juros: number
          p_owner: string
          p_parcelas: number
          p_principal: number
          p_taxa: number
          p_total: number
        }
        Returns: string
      }
      current_owner_id: { Args: never; Returns: string }
      current_owner_profile_id: { Args: never; Returns: string }
      current_profile_id: { Args: never; Returns: string }
      current_profile_id_safe: { Args: never; Returns: string }
      current_profile_ids: { Args: never; Returns: string[] }
      debug_auth_uid: { Args: never; Returns: Json }
      debug_whoami: {
        Args: never
        Returns: {
          owner_id: string
          profile_id: string
          uid: string
        }[]
      }
      ensure_profile_for_auth_user: { Args: never; Returns: string }
      fmt_date_br: { Args: { v: string }; Returns: string }
      fmt_money_br: { Args: { v: number }; Returns: string }
      gen_unique_access_code:
        | { Args: never; Returns: string }
        | { Args: { p_profile_id: string }; Returns: string }
      generate_acordo_documento_atomic: {
        Args: {
          p_acordo_id: string
          p_loan_id: string
          p_payload: Json
          p_profile_id: string
          p_template_version: string
          p_tipo: string
        }
        Returns: string
      }
      get_accessible_ids: {
        Args: never
        Returns: {
          id: string
        }[]
      }
      get_asaas_config: { Args: { p_profile_id: string }; Returns: Json }
      get_auth_user_id_by_email: { Args: { p_email: string }; Returns: string }
      get_current_profile: { Args: never; Returns: Json }
      get_documento_juridico_by_id: {
        Args: { p_document_id: string }
        Returns: {
          created_at: string
          hash_sha256: string
          id: string
          loan_id: string
          profile_id: string
          snapshot: Json
          snapshot_rendered_html: string
          status_assinatura: string
          tipo: string
          updated_at: string
          view_token: string
        }[]
      }
      get_documento_juridico_by_token: {
        Args: { p_token: string }
        Returns: {
          acordo_id: string | null
          client_id: string | null
          codigo_cliente: string | null
          created_at: string | null
          dono_id: string | null
          hash_sha256: string
          id: string
          ip_origem: string | null
          loan_id: string | null
          metadata_assinatura: Json | null
          numero_cliente: string | null
          profile_id: string | null
          public_access_token: string | null
          signed_at: string | null
          snapshot: Json | null
          snapshot_json: Json
          snapshot_rendered_html: string | null
          status: string | null
          status_assinatura: string | null
          template_version: string | null
          testemunhas: Json
          tipo: string | null
          tipo_documento: string | null
          token_expires_at: string | null
          updated_at: string | null
          url_storage: string | null
          user_agent: string | null
          view_token: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "documentos_juridicos"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_documento_juridico_by_view_token: {
        Args: { p_view_token: string }
        Returns: {
          created_at: string
          hash_sha256: string
          id: string
          loan_id: string
          profile_id: string
          snapshot: Json
          snapshot_rendered_html: string
          status_assinatura: string
          tipo: string
          updated_at: string
          view_token: string
        }[]
      }
      get_legal_doc_by_token:
        | {
            Args: { p_token: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.get_legal_doc_by_token(p_token => text), public.get_legal_doc_by_token(p_token => uuid). Try renaming the parameters or the function itself in the database so function overloading can be resolved"[]
            SetofOptions: {
              from: "*"
              to: "documentos_juridicos"
              isOneToOne: false
              isSetofReturn: true
            }
          }
        | {
            Args: { p_token: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.get_legal_doc_by_token(p_token => text), public.get_legal_doc_by_token(p_token => uuid). Try renaming the parameters or the function itself in the database so function overloading can be resolved"[]
          }
      get_legal_document_audit_by_view_token: {
        Args: { p_view_token: string }
        Returns: Json
      }
      get_loan_by_portal_token: {
        Args: { p_token: string }
        Returns: {
          billing_cycle: string
          client_id: string
          created_at: string
          daily_interest_percent: number
          debtor_document: string
          debtor_name: string
          debtor_phone: string
          fine_percent: number
          id: string
          installments: Json
          interest_rate: number
          pix_key: string
          portal_token: string
          principal: number
          profile_id: string
          start_date: string
          total_to_receive: number
        }[]
      }
      get_my_dono_id: { Args: never; Returns: string }
      get_my_profile: {
        Args: never
        Returns: {
          created_at: string
          dono_id: string
          email: string
          escola_id: string
          id: string
          last_active_at: string
          nome: string
          perfil: string
          usuario_email: string
        }[]
      }
      get_portal_contracts_by_token: {
        Args: { p_token: string }
        Returns: {
          amortization_type: string | null
          billing_cycle: string | null
          client_id: string | null
          cliente_foto_url: string | null
          confissao_divida_url: string | null
          cor_alerta: string | null
          created_at: string | null
          custom_documents: Json | null
          daily_interest_percent: number | null
          debtor_address: string | null
          debtor_document: string | null
          debtor_name: string | null
          debtor_phone: string | null
          documentos: Json | null
          fine_percent: number | null
          funding_cost: number | null
          funding_fee_percent: number | null
          funding_provider: string | null
          funding_total_payable: number | null
          guarantee_description: string | null
          id: string
          interest_rate: number | null
          is_archived: boolean | null
          is_daily: boolean | null
          loan_mode: string | null
          modalidade: string | null
          mode: string | null
          next_due_date: string | null
          notes: string | null
          observacoes: string | null
          operador_responsavel_id: string | null
          payment_signals: Json | null
          payment_type: string | null
          pix_key: string | null
          policies_snapshot: Json | null
          portal_token: string
          preferred_payment_method: string | null
          principal: number
          profile_id: string
          promissoria_url: string | null
          source_id: string | null
          start_date: string | null
          total_to_receive: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "contratos_old"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_profile_by_id: {
        Args: { p_id: string }
        Returns: {
          access_code: string | null
          access_level: number | null
          address: string | null
          address_number: string | null
          avatar_url: string | null
          brand_color: string | null
          city: string | null
          contato_whatsapp: string | null
          created_at: string | null
          default_daily_interest_percent: number | null
          default_fine_percent: number | null
          default_interest_rate: number | null
          document: string | null
          dono_id: string | null
          email: string | null
          escola_id: string | null
          id: string
          interest_balance: number | null
          last_active_at: string | null
          logo_url: string | null
          mp_access_token: string | null
          neighborhood: string | null
          nome_completo: string | null
          nome_empresa: string | null
          nome_exibicao: string | null
          nome_operador: string | null
          owner_profile_id: string | null
          perfil: string
          phone: string | null
          photo: string | null
          pix_key: string | null
          recovery_phrase: string | null
          senha_acesso: string | null
          state: string | null
          supervisor_id: string | null
          target_capital: number | null
          target_profit: number | null
          total_available_capital: number | null
          ui_hub_order: Json | null
          ui_nav_order: Json | null
          updated_at: string | null
          user_id: string | null
          usuario_email: string
          zip_code: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "perfis"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_session_profile_id: { Args: never; Returns: string }
      increment_profile_access: {
        Args: { p_profile_id: string }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      is_cpf_valid: { Args: { p_cpf: string }; Returns: boolean }
      is_master_safe: { Args: never; Returns: boolean }
      is_valid_cpf: { Args: { p_cpf: string }; Returns: boolean }
      join_team_via_token: {
        Args: {
          p_cpf: string
          p_full_name: string
          p_token: string
          p_username: string
        }
        Returns: Json
      }
      list_my_notifications: {
        Args: never
        Returns: {
          action_url: string | null
          created_at: string | null
          id: string
          item_id: string | null
          item_type: string | null
          mensagem: string
          metadata: Json | null
          profile_id: string
          read_at: string | null
          titulo: string
        }[]
        SetofOptions: {
          from: "*"
          to: "notificacoes"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      login_user: {
        Args: { login_input: string; password_input: string }
        Returns: {
          access_level: string
          dono_id: string
          id: string
          nome_empresa: string
          nome_operador: string
          usuario_email: string
        }[]
      }
      mark_notification_as_read: {
        Args: { p_notification_id: string }
        Returns: boolean
      }
      pay_acordo_parcela_atomic: {
        Args: {
          p_acordo_parcela_id: string
          p_amount: number
          p_profile_id: string
        }
        Returns: undefined
      }
      pf_adjust_account_balance: {
        Args: { p_account_id: string; p_delta: number }
        Returns: undefined
      }
      pf_create_transaction_atomic: {
        Args: {
          p_cartao_id?: string
          p_categoria_id?: string
          p_conta_id?: string
          p_data: string
          p_descricao: string
          p_idempotency_key?: string
          p_is_operation_transfer?: boolean
          p_operation_loan_id?: string
          p_operation_source_id?: string
          p_profile_id: string
          p_status: string
          p_tipo: string
          p_valor: number
        }
        Returns: undefined
      }
      pf_transfer_to_operation:
        | {
            Args: {
              p_amount: number
              p_description: string
              p_loan_id: string
              p_profile_id: string
              p_transfer_group_id?: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_amount: number
              p_idempotency_key?: string
              p_loan_id: string
              p_notes?: string
              p_profile_id: string
              p_source_id: string
            }
            Returns: undefined
          }
      portal_assert_session: {
        Args: { p_token: string }
        Returns: {
          client_id: string
          loan_id: string
        }[]
      }
      portal_create_session: {
        Args: {
          p_access_code: string
          p_identifier: string
          p_ip?: string
          p_loan_id: string
          p_user_agent?: string
        }
        Returns: string
      }
      portal_find_by_token:
        | {
            Args: { p_token: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.portal_find_by_token(p_token => text), public.portal_find_by_token(p_token => uuid). Try renaming the parameters or the function itself in the database so function overloading can be resolved"[]
            SetofOptions: {
              from: "*"
              to: "contratos"
              isOneToOne: false
              isSetofReturn: true
            }
          }
        | {
            Args: { p_token: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.portal_find_by_token(p_token => text), public.portal_find_by_token(p_token => uuid). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
      portal_get_bundle: { Args: { p_portal_token: string }; Returns: Json }
      portal_get_client:
        | { Args: { p_client_id: string }; Returns: Json }
        | { Args: { p_shortcode: string; p_token: string }; Returns: Json }
      portal_get_contract: {
        Args: { p_token: string }
        Returns: {
          cliente: Json
          contrato: Json
        }[]
      }
      portal_get_doc:
        | {
            Args: { p_doc_id: string; p_token: string }
            Returns: {
              hash_sha256: string
              id: string
              snapshot: Json
              status_assinatura: string
              tipo_documento: string
              view_token: string
            }[]
          }
        | {
            Args: { p_doc_id: string; p_shortcode: string; p_token: string }
            Returns: {
              created_at: string
              hash_sha256: string
              id: string
              snapshot: Json
              snapshot_rendered_html: string
              status_assinatura: string
              tipo: string
              view_token: string
            }[]
          }
        | { Args: { p_doc_id: string; p_token: string }; Returns: Json }
      portal_get_document: { Args: { p_token: string }; Returns: Json }
      portal_get_document_by_token: {
        Args: { p_tipo?: string; p_token: string }
        Returns: Json
      }
      portal_get_full_loan:
        | { Args: { p_loan_id: string }; Returns: Json }
        | { Args: { p_loan_id: string; p_token: string }; Returns: Json }
        | { Args: { p_shortcode: string; p_token: string }; Returns: Json }
      portal_get_or_create_client_link: {
        Args: { p_client_id: string; p_created_by?: string }
        Returns: string
      }
      portal_get_parcels:
        | { Args: { p_loan_id: string }; Returns: Json }
        | {
            Args: { p_loan_id: string; p_token: string }
            Returns: {
              amount: number | null
              av_applied: number | null
              data_vencimento: string | null
              due_date: string | null
              id: string
              interest_remaining: number | null
              last_payment_date: string | null
              late_fee_accrued: number | null
              loan_id: string | null
              logs: Json | null
              numero_parcela: number | null
              paid_date: string | null
              paid_interest: number | null
              paid_late_fee: number | null
              paid_principal: number | null
              paid_total: number | null
              principal_remaining: number | null
              profile_id: string | null
              renewal_count: number
              scheduled_interest: number | null
              scheduled_principal: number | null
              start_date: string | null
              status: string | null
              valor_parcela: number | null
            }[]
            SetofOptions: {
              from: "*"
              to: "parcelas"
              isOneToOne: false
              isSetofReturn: true
            }
          }
        | { Args: { p_shortcode: string; p_token: string }; Returns: Json }
      portal_get_shortcode_by_portal_token: {
        Args: { p_portal_token: string }
        Returns: string
      }
      portal_get_signals:
        | { Args: { p_loan_id: string }; Returns: Json }
        | {
            Args: { p_loan_id: string; p_token: string }
            Returns: {
              client_id: string | null
              client_viewed_at: string | null
              comprovante_url: string | null
              created_at: string | null
              id: string
              loan_id: string | null
              profile_id: string | null
              review_note: string | null
              reviewed_at: string | null
              status: string | null
              tipo_intencao: string | null
            }[]
            SetofOptions: {
              from: "*"
              to: "sinalizacoes_pagamento"
              isOneToOne: false
              isSetofReturn: true
            }
          }
        | { Args: { p_shortcode: string; p_token: string }; Returns: Json }
      portal_list_contracts:
        | { Args: { p_client_id: string }; Returns: Json }
        | {
            Args: { p_token: string }
            Returns: {
              acordo_ativo_id: string | null
              amortization_type: string | null
              billing_cycle: string | null
              client_id: string | null
              cliente_foto_url: string | null
              confissao_divida_url: string | null
              cor_alerta: string | null
              created_at: string | null
              custom_documents: Json | null
              daily_interest_percent: number | null
              debtor_address: string | null
              debtor_document: string | null
              debtor_name: string | null
              debtor_phone: string | null
              documentos: Json | null
              fine_percent: number | null
              funding_cost: number | null
              funding_fee_percent: number | null
              funding_provider: string | null
              funding_total_payable: number | null
              guarantee_description: string | null
              id: string
              interest_rate: number | null
              is_archived: boolean | null
              is_daily: boolean | null
              loan_mode: string | null
              modalidade: string | null
              mode: string | null
              next_due_date: string | null
              notes: string | null
              observacoes: string | null
              operador_responsavel_id: string | null
              owner_id: string
              payment_signals: Json | null
              payment_type: string | null
              pix_key: string | null
              policies_snapshot: Json | null
              portal_shortcode: string | null
              portal_token: string | null
              preferred_payment_method: string | null
              principal: number | null
              promissoria_url: string | null
              source_id: string | null
              start_date: string | null
              status: string | null
              total_to_receive: number | null
            }[]
            SetofOptions: {
              from: "*"
              to: "contratos"
              isOneToOne: false
              isSetofReturn: true
            }
          }
        | { Args: { p_shortcode: string; p_token: string }; Returns: Json }
      portal_list_docs:
        | {
            Args: { p_shortcode: string; p_token: string }
            Returns: {
              created_at: string
              id: string
              snapshot_rendered_html: string
              status_assinatura: string
              tipo: string
            }[]
          }
        | { Args: { p_token: string }; Returns: Json[] }
      portal_mark_viewed: {
        Args: { p_shortcode: string; p_token: string }
        Returns: Json
      }
      portal_registrar_intencao:
        | {
            Args: {
              p_comprovante_url?: string
              p_portal_token: string
              p_tipo: string
            }
            Returns: string
          }
        | {
            Args: {
              p_comprovante_url?: string
              p_shortcode: string
              p_tipo: string
              p_token: string
            }
            Returns: Json
          }
      portal_resolve_client_token: {
        Args: { p_token: string }
        Returns: string
      }
      portal_sign_doc: {
        Args: {
          p_cpf: string
          p_doc_id: string
          p_ip: string
          p_nome: string
          p_payload?: Json
          p_token: string
          p_user_agent: string
        }
        Returns: undefined
      }
      portal_sign_document:
        | {
            Args: {
              p_cpf: string
              p_documento_id: string
              p_ip: string
              p_nome: string
              p_user_agent: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_cpf: string
              p_documento_id: string
              p_ip: string
              p_nome: string
              p_papel: string
              p_user_agent: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_cpf: string
              p_doc_id: string
              p_ip: string
              p_name: string
              p_role: string
              p_token: string
              p_user_agent: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_cpf: string
              p_ip: string
              p_nome: string
              p_token: string
              p_user_agent: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_cpf: string
              p_documento_id: string
              p_email?: string
              p_hash_assinado?: string
              p_ip?: string
              p_nome: string
              p_papel: string
              p_phone?: string
              p_shortcode: string
              p_token: string
              p_user_agent?: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_cpf: string
              p_doc_id: string
              p_ip: string
              p_name: string
              p_role: string
              p_token: string
              p_user_agent: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_cpf: string
              p_documento_id: string
              p_email: string
              p_hash_assinado: string
              p_ip: string
              p_nome: string
              p_papel: string
              p_phone: string
              p_token: string
              p_user_agent: string
            }
            Returns: Json
          }
      portal_sign_document_by_view_token: {
        Args: {
          p_assinatura_hash: string
          p_ip_origem: string
          p_role: string
          p_signed_at: string
          p_signer_document: string
          p_signer_name: string
          p_user_agent: string
          p_view_token: string
        }
        Returns: Json
      }
      portal_submit_payment_intent:
        | {
            Args: {
              p_client_id: string
              p_loan_id: string
              p_profile_id: string
              p_tipo: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_loan_id: string
              p_portal_token: string
              p_tipo_intencao: string
            }
            Returns: string
          }
      portal_token_to_uuid: { Args: { p_token: string }; Returns: string }
      portal_update_doc_fields: {
        Args: { p_doc_id: string; p_fields: Json }
        Returns: Json
      }
      process_installment_payment: {
        Args: {
          p_installment_id: string
          p_paid_interest: number
          p_paid_late_fee: number
          p_paid_principal: number
          p_payment_date: string
        }
        Returns: undefined
      }
      process_lend_more_atomic:
        | {
            Args: {
              p_amount: number
              p_category?: string
              p_inst_amount: number
              p_inst_principal_rem: number
              p_inst_scheduled_princ: number
              p_installment_id: string
              p_loan_id: string
              p_new_total_principal: number
              p_new_total_to_receive: number
              p_notes: string
              p_profile_id: string
              p_source_id: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_amount: number
              p_category?: string
              p_inst_amount: number
              p_inst_principal_rem: number
              p_inst_scheduled_princ: number
              p_installment_id: string
              p_loan_id: string
              p_new_total_principal: number
              p_new_total_to_receive: number
              p_notes: string
              p_profile_id: string
              p_source_id: string
            }
            Returns: undefined
          }
      process_payment_atomic_v2: {
        Args: {
          p_idempotency_key: string
          p_installment_id: string
          p_interest_amount: number
          p_late_fee_amount: number
          p_loan_id: string
          p_operator_id: string
          p_payment_date: string
          p_principal_amount: number
          p_profile_id: string
        }
        Returns: undefined
      }
      process_payment_v3_selective:
        | {
            Args: {
              p_caixa_livre_id: string
              p_capitalize_remaining: boolean
              p_idempotency_key: string
              p_installment_id: string
              p_interest_paid: number
              p_late_fee_forgiven: number
              p_late_fee_paid: number
              p_loan_id: string
              p_operator_id: string
              p_payment_date: string
              p_principal_paid: number
              p_profile_id: string
              p_source_id: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_caixa_livre_id: string
              p_capitalize_remaining: boolean
              p_idempotency_key: string
              p_installment_id: string
              p_interest_paid: number
              p_late_fee_forgiven: number
              p_late_fee_paid: number
              p_loan_id: string
              p_operator_id: string
              p_payment_date: string
              p_principal_paid: number
              p_profile_id: string
              p_source_id: string
            }
            Returns: undefined
          }
      profile_id_for: { Args: { p_uid: string }; Returns: string }
      profit_withdrawal_atomic: {
        Args: {
          p_amount: number
          p_profile_id: string
          p_target_source_id: string
        }
        Returns: undefined
      }
      public_sign_legal_document: {
        Args: {
          p_ip: string
          p_role: string
          p_signature_hash: string
          p_signer_document: string
          p_signer_name: string
          p_user_agent: string
          p_view_token: string
        }
        Returns: Json
      }
      register_team_member: {
        Args: {
          p_email: string
          p_full_name: string
          p_password: string
          p_token: string
          p_username: string
        }
        Returns: Json
      }
      registrar_log_juridico: {
        Args: {
          p_action: string
          p_actor_role: string
          p_documento_id: string
          p_ip: string
          p_profile_id: string
          p_user_agent: string
        }
        Returns: undefined
      }
      registrar_pagamento_parcela: {
        Args: {
          p_conta: string
          p_juros: number
          p_owner: string
          p_parcela: string
          p_principal: number
          p_valor: number
        }
        Returns: undefined
      }
      render_confissao_v1: { Args: { p_snapshot: Json }; Returns: string }
      resolve_login_email_by_operator: {
        Args: { p_operator: string }
        Returns: string
      }
      resolve_owner_profile_id: {
        Args: { p_profile_id: string }
        Returns: string
      }
      resolve_profile_login: {
        Args: { p_identifier: string; p_password: string }
        Returns: Json
      }
      resolve_team_login: {
        Args: { p_document: string; p_pin: string }
        Returns: Json
      }
      reverse_payment_atomic: {
        Args: { p_reason: string; p_transaction_id: string }
        Returns: undefined
      }
      reverse_payment_atomic_v2: {
        Args: {
          p_effective_date?: string
          p_idempotency_key: string
          p_operator_id: string
          p_profile_id: string
          p_reason: string
          p_request_id?: string
          p_transaction_id: string
        }
        Returns: undefined
      }
      root_owner_id: { Args: never; Returns: string }
      rpc_adjust_balances:
        | {
            Args: {
              p_principal_amount: number
              p_profile_id: string
              p_profit_amount: number
            }
            Returns: undefined
          }
        | {
            Args: { p_principal_amount: number; p_profit_amount: number }
            Returns: undefined
          }
        | {
            Args: {
              p_principal_amount: number
              p_profit_amount: number
              p_reason: string
            }
            Returns: undefined
          }
      rpc_doc_can_sign: { Args: { p_documento_id: string }; Returns: boolean }
      rpc_doc_missing_fields: {
        Args: { p_documento_id: string }
        Returns: Json
      }
      rpc_doc_patch_snapshot: {
        Args: { p_documento_id: string; p_patch: Json }
        Returns: Json
      }
      rpc_generate_legal_document: {
        Args: { p_loan_id: string; p_tipo: string }
        Returns: Json
      }
      rpc_login_por_senha_acesso: {
        Args: { p_email: string; p_senha: string }
        Returns: {
          dono_id: string
          escola_id: string
          perfil: string
          perfil_id: string
          usuario_email: string
        }[]
      }
      rpc_me: {
        Args: never
        Returns: {
          dono_id: string
          email: string
          id: string
          nome_exibicao: string
          perfil: string
        }[]
      }
      rpc_set_senha_acesso: {
        Args: { p_perfil_id: string; p_senha: string }
        Returns: undefined
      }
      sign_legal_doc_public: {
        Args: {
          p_ip: string
          p_signature_hash: string
          p_signer_doc: string
          p_signer_name: string
          p_token: string
          p_user_agent: string
        }
        Returns: boolean
      }
      support_ticket_close: { Args: { p_loan_id: string }; Returns: undefined }
      support_ticket_ensure_open: {
        Args: { p_loan_id: string }
        Returns: string
      }
      support_ticket_reopen: { Args: { p_loan_id: string }; Returns: undefined }
      unaccent: { Args: { "": string }; Returns: string }
      update_profile_sensitive: {
        Args: {
          p_access_level?: string
          p_perfil?: string
          p_perfil_id: string
          p_usuario_email?: string
        }
        Returns: undefined
      }
      user_owner_profile: { Args: never; Returns: string }
      validar_integridade_documento: {
        Args: { p_documento_id: string }
        Returns: boolean
      }
      validate_confissao_snapshot: {
        Args: { p_snapshot: Json }
        Returns: boolean
      }
      validate_portal_access:
        | {
            Args: { p_portal_token: string; p_shortcode: string }
            Returns: boolean
          }
        | { Args: { p_shortcode: string; p_token: string }; Returns: boolean }
      withdraw_profit_caixa_livre: {
        Args: {
          p_amount: number
          p_profile_id: string
          p_source_id: string
          p_target_source_id?: string
        }
        Returns: undefined
      }
    }
    Enums: {
      status_assinatura_enum: "PENDENTE" | "ASSINADO" | "CANCELADO"
      support_message_type:
        | "text"
        | "audio"
        | "image"
        | "file"
        | "location"
        | "system"
      support_sender_type: "CLIENT" | "OPERATOR"
      support_signal_type: "offer" | "answer" | "ice" | "hangup"
      support_ticket_status: "OPEN" | "CLOSED"
      tipo_documento_enum: "CONFISSAO" | "PROMISSORIA" | "TERMO_ACORDO"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      status_assinatura_enum: ["PENDENTE", "ASSINADO", "CANCELADO"],
      support_message_type: [
        "text",
        "audio",
        "image",
        "file",
        "location",
        "system",
      ],
      support_sender_type: ["CLIENT", "OPERATOR"],
      support_signal_type: ["offer", "answer", "ice", "hangup"],
      support_ticket_status: ["OPEN", "CLOSED"],
      tipo_documento_enum: ["CONFISSAO", "PROMISSORIA", "TERMO_ACORDO"],
    },
  },
} as const
