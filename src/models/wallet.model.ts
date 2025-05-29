export interface Wallet {
  id: number;
  user_id: number;
  balance: number;
  created_at: Date;
  updated_at: Date;
}

export interface WalletTransaction {
  id: number;
  wallet_id: number;
  type: 'deposit' | 'withdrawal' | 'bid' | 'refund';
  amount: number;
  status: 'pending' | 'completed' | 'failed';
  stripe_payment_id?: string;
  bank_transfer_id?: string;
  created_at: Date;
}

export interface CreateDepositDTO {
  amount: number;
  payment_method_id: string;
}

export interface CreateWithdrawalDTO {
  amount: number;
  bank_account_id: string;
}

export interface StripePaymentIntent {
  id: string;
  amount: number;
  status: string;
  client_secret: string;
} 