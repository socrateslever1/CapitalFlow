
export interface Team {
  id: string;
  owner_profile_id: string;
  name: string;
  created_at: string;
}

export interface TeamMember {
  id: string;
  team_id: string;
  full_name: string;
  cpf: string;
  username_or_email: string;
  profile_id: string | null;
  role: 'ADMIN' | 'MEMBER' | 'OPERATOR';
  invite_token: string | null;
  created_at: string;
}

export interface InviteResult {
  link: string;
  name: string;
}
