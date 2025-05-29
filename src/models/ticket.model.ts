export interface AuctionTicket {
  id: number;
  auction_id: number;
  user_id: number;
  status: 'active' | 'used' | 'expired';
  created_at: Date;
  updated_at: Date;
}

export interface CreateTicketDTO {
  auction_id: number;
}

export interface TicketValidationResult {
  isValid: boolean;
  message: string;
  minimumBalance?: number;
  currentBalance?: number;
} 