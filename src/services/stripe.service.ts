import Stripe from 'stripe';
import { StripePaymentIntent } from '../models/wallet.model';

class StripeService {
  private stripe: Stripe | null = null;

  constructor() {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (stripeKey) {
      this.stripe = new Stripe(stripeKey, {
        apiVersion: '2025-05-28.basil',
      });
    } else {
      console.warn('Stripe API key not found. Stripe functionality will be disabled.');
    }
  }

  private checkStripeInitialized() {
    if (!this.stripe) {
      throw new Error('Stripe is not initialized. Please check your environment variables.');
    }
  }

  async createPaymentIntent(amount: number): Promise<StripePaymentIntent> {
    this.checkStripeInitialized();
    const paymentIntent = await this.stripe!.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: 'usd',
      automatic_payment_methods: {
        enabled: true,
      },
    });

    return {
      id: paymentIntent.id,
      amount: amount,
      status: paymentIntent.status,
      client_secret: paymentIntent.client_secret!,
    };
  }

  async confirmPayment(paymentIntentId: string): Promise<boolean> {
    this.checkStripeInitialized();
    const paymentIntent = await this.stripe!.paymentIntents.retrieve(paymentIntentId);
    return paymentIntent.status === 'succeeded';
  }

  async createPayout(amount: number, bankAccountId: string): Promise<string> {
    this.checkStripeInitialized();
    const payout = await this.stripe!.payouts.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: 'usd',
      destination: bankAccountId,
    });

    return payout.id;
  }

  async getBankAccounts(customerId: string) {
    this.checkStripeInitialized();
    const paymentMethods = await this.stripe!.paymentMethods.list({
      customer: customerId,
      type: 'us_bank_account',
    });

    return paymentMethods.data;
  }

  async createCustomer(email: string) {
    this.checkStripeInitialized();
    return await this.stripe!.customers.create({
      email,
    });
  }

  async attachPaymentMethod(customerId: string, paymentMethodId: string) {
    this.checkStripeInitialized();
    await this.stripe!.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });
  }
}

export default StripeService; 