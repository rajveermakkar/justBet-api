import { Request, Response } from 'express';
import { Pool } from 'pg';
import { CreateDepositDTO, CreateWithdrawalDTO } from '../models/wallet.model';
import StripeService from '../services/stripe.service';
import pool from '../config/database';

const stripeService = new StripeService();

interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
  };
}

export const getWalletBalance = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const result = await pool.query(
      'SELECT balance FROM wallets WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Wallet not found' });
    }

    res.json({ balance: result.rows[0].balance });
  } catch (error) {
    console.error('Error getting wallet balance:', error);
    res.status(500).json({ message: 'Error getting wallet balance' });
  }
};

export const getWalletTransactions = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const result = await pool.query(
      `SELECT wt.* FROM wallet_transactions wt
       JOIN wallets w ON w.id = wt.wallet_id
       WHERE w.user_id = $1
       ORDER BY wt.created_at DESC`,
      [userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error getting wallet transactions:', error);
    res.status(500).json({ message: 'Error getting wallet transactions' });
  }
};

export const depositFunds = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Invalid amount' });
    }

    // Start transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Create wallet if it doesn't exist
      await client.query(
        'INSERT INTO wallets (user_id, balance) VALUES ($1, 0) ON CONFLICT (user_id) DO NOTHING',
        [userId]
      );

      // Create deposit transaction
      const transactionResult = await client.query(
        `INSERT INTO wallet_transactions (wallet_id, type, amount, status)
         SELECT id, 'deposit', $1, 'pending'
         FROM wallets WHERE user_id = $2
         RETURNING id`,
        [amount, userId]
      );

      await client.query('COMMIT');

      res.status(201).json({
        message: 'Deposit initiated',
        transactionId: transactionResult.rows[0].id
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error creating deposit:', error);
    res.status(500).json({ message: 'Error creating deposit' });
  }
};

export const confirmDeposit = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { payment_intent_id } = req.body;
    const userId = req.user?.id;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Update transaction status
      const result = await client.query(
        `UPDATE wallet_transactions wt
         SET status = 'completed'
         FROM wallets w
         WHERE wt.wallet_id = w.id
         AND w.user_id = $1
         AND wt.type = 'deposit'
         AND wt.status = 'pending'
         RETURNING wt.amount`,
        [userId]
      );

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'No pending deposit found' });
      }

      // Update wallet balance
      await client.query(
        `UPDATE wallets
         SET balance = balance + $1
         WHERE user_id = $2`,
        [result.rows[0].amount, userId]
      );

      await client.query('COMMIT');
      res.json({ message: 'Deposit confirmed' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error confirming deposit:', error);
    res.status(500).json({ message: 'Error confirming deposit' });
  }
};

export const withdrawFunds = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { amount, bank_account_id } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Invalid amount' });
    }

    if (!bank_account_id) {
      return res.status(400).json({ message: 'Bank account ID is required' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Check if user has sufficient balance
      const walletResult = await client.query(
        'SELECT balance FROM wallets WHERE user_id = $1',
        [userId]
      );

      if (walletResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Wallet not found' });
      }

      if (walletResult.rows[0].balance < amount) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Insufficient funds' });
      }

      // Create withdrawal transaction
      const transactionResult = await client.query(
        `INSERT INTO wallet_transactions (wallet_id, type, amount, status, bank_transfer_id)
         SELECT id, 'withdrawal', $1, 'pending', $2
         FROM wallets WHERE user_id = $3
         RETURNING id`,
        [amount, bank_account_id, userId]
      );

      // Update wallet balance
      await client.query(
        `UPDATE wallets
         SET balance = balance - $1
         WHERE user_id = $2`,
        [amount, userId]
      );

      await client.query('COMMIT');
      res.status(201).json({
        message: 'Withdrawal initiated',
        transactionId: transactionResult.rows[0].id
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error creating withdrawal:', error);
    res.status(500).json({ message: 'Error creating withdrawal' });
  }
}; 