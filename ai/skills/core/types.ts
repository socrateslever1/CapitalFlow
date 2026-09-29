export type SkillCategory = 'CLIENT' | 'CONTRACT' | 'PAYMENT' | 'COLLECTION' | 'AGREEMENT' | 'SUPPORT';

export type SkillRisk = 'READ_ONLY' | 'LOW' | 'FINANCIAL_WRITE' | 'CRITICAL';

export type SkillSource = 'APP' | 'WHATSAPP' | 'PORTAL' | 'AI' | 'INTERNAL';

export type SkillPermission =
  | 'SKILLS_READ'
  | 'CLIENT_DOCUMENT_READ'
  | 'FINANCIAL_WRITE'
  | 'FINANCIAL_REVERSAL';

export type SkillContext = {
  userId?: string;
  profileId?: string;
  clientId?: string;
  authenticated: boolean;
  source: SkillSource;
  requestId?: string;
  conversationId?: string;
  permissions?: SkillPermission[];
};

export type SkillExecutionMetadata = {
  skillId: string;
  requestId?: string;
  profileId?: string;
  source: SkillSource;
  startTime: string;
  durationMs: number;
  success: boolean;
  errorType?: string;
};
