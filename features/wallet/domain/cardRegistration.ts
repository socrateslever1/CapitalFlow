import type { WalletCardOpeningPayload } from '../../../services/personalWallet.service';
import type { CardVaultEnvelope } from './cardVault';

export type CompleteCardRegistration = {
  card:{nickname:string;issuer:string;brand:string|null;last_four:string|null;credit_limit:number;closing_day:number|null;due_day:number|null};
  existingAccountId:string|null;opening:WalletCardOpeningPayload;requestId:string;
  identity:{cardholder_name:string|null;expiry_month:number|null;expiry_year:number|null};
  envelope:CardVaultEnvelope|null;
};
export class CardRegistrationError extends Error {
  constructor(message:string,readonly definitive:boolean){super(message);this.name='CardRegistrationError';}
}
/** An uncertain response must be retried with exactly the submitted request. */
export class CardRegistrationAttempt {
  private input:CompleteCardRegistration|null=null;
  get pending(){return this.input;}
  begin(candidate:CompleteCardRegistration){return this.input ||= structuredClone(candidate);}
  confirmed(){this.input=null;}
  failed(reason:unknown){if(reason instanceof CardRegistrationError&&reason.definitive)this.input=null;}
}
