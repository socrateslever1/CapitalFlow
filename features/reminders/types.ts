export type ReminderPriority = 'BAIXA' | 'MEDIA' | 'ALTA';

export type ReminderCategory = 'GERAL' | 'COBRANCA' | 'RETORNO' | 'DOCUMENTO' | 'REUNIAO';

export type ReminderStatus = 'PENDING' | 'COMPLETED';

export interface ReminderItem {
  id: string;
  userId: string;
  title: string;
  description?: string;

  // Cliente vinculado (@cliente)
  clientId?: string;
  clientName?: string;
  clientPhone?: string;

  // Marcador de Data e Horário
  dueDate: string; // YYYY-MM-DD
  dueTime: string; // HH:mm
  scheduledAt: string; // ISO 8601 string completa

  // Prioridade e Categoria
  priority: ReminderPriority;
  category: ReminderCategory;

  // Imagem anexada
  imageUrl?: string; // Base64 Data URL ou URL
  imageName?: string;

  // Áudio gravado ou anexado
  audioUrl?: string; // Base64 Data URL ou URL
  audioDuration?: number; // Duração em segundos

  // Tema e Memes de Alerta
  themeId?: string;

  // Status e controle de alerta
  status: ReminderStatus;
  completedAt?: string;
  snoozedUntil?: string; // ISO 8601 string quando adiado
  lastAlertedAt?: string; // ISO ou chave de timestamp para evitar alertas duplicados

  createdAt: string;
  updatedAt: string;
}

export interface ReminderFormData {
  title: string;
  description: string;
  clientId?: string;
  clientName?: string;
  clientPhone?: string;
  dueDate: string;
  dueTime: string;
  priority: ReminderPriority;
  category: ReminderCategory;
  themeId?: string;
  imageUrl?: string;
  imageName?: string;
  audioUrl?: string;
  audioDuration?: number;
}
