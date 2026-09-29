import type {
  CapitalFlowSkillGateway,
  SkillAgreement,
  SkillClient,
  SkillContract,
  SkillDebtPosition,
  SkillDueItem,
  SkillInstallment,
} from '../../ai/skills/core/gateway';

export function createFakeGateway(overrides: Partial<CapitalFlowSkillGateway> = {}): CapitalFlowSkillGateway {
  return {
    findClients: async (): Promise<SkillClient[]> => [],
    listContracts: async (): Promise<SkillContract[]> => [],
    getDebtPosition: async (): Promise<SkillDebtPosition | null> => null,
    listInstallments: async (): Promise<SkillInstallment[] | null> => null,
    listDue: async (): Promise<SkillDueItem[]> => [],
    getActiveAgreement: async (): Promise<SkillAgreement | null> => null,
    ...overrides,
  };
}

export const PROFILE_A = '11111111-1111-4111-8111-111111111111';
export const PROFILE_B = '22222222-2222-4222-8222-222222222222';
export const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const CLIENT_A = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
export const CONTRACT_A = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

export const skillContext = {
  userId: USER_A,
  profileId: PROFILE_A,
  authenticated: true,
  source: 'INTERNAL' as const,
  permissions: ['SKILLS_READ' as const],
};
