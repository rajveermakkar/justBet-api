import PDFDocument from 'pdfkit';
import { Pool } from 'pg';
import { format } from 'date-fns';

const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT),
});

export class DocumentService {
  private generateCertificateNumber(): string {
    const timestamp = Date.now().toString();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `CERT-${timestamp}-${random}`;
  }

  private generateInvoiceNumber(): string {
    const timestamp = Date.now().toString();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `INV-${timestamp}-${random}`;
  }

  async createPurchasedItem(auctionId: number, buyerId: number, sellerId: number, purchasePrice: number, buyerPremium: number): Promise<any> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const certificateNumber = this.generateCertificateNumber();
      const invoiceNumber = this.generateInvoiceNumber();
      const totalAmount = purchasePrice + buyerPremium;

      const result = await client.query(
        `INSERT INTO purchased_items (
          auction_id, buyer_id, seller_id, purchase_price,
          buyer_premium, total_amount, certificate_number,
          invoice_number
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [
          auctionId, buyerId, sellerId, purchasePrice,
          buyerPremium, totalAmount, certificateNumber,
          invoiceNumber
        ]
      );

      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async generateCertificate(purchasedItemId: number): Promise<Buffer> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT pi.*, 
                a.title as auction_title,
                a.description as auction_description,
                b.username as buyer_name,
                s.username as seller_name
         FROM purchased_items pi
         JOIN auctions a ON pi.auction_id = a.id
         JOIN users b ON pi.buyer_id = b.id
         JOIN users s ON pi.seller_id = s.id
         WHERE pi.id = $1`,
        [purchasedItemId]
      );

      if (result.rows.length === 0) {
        throw new Error('Purchased item not found');
      }

      const item = result.rows[0];
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50
      });

      const chunks: Buffer[] = [];
      doc.on('data', chunk => chunks.push(chunk));

      // Certificate Header
      doc.fontSize(24)
         .text('Certificate of Ownership', { align: 'center' })
         .moveDown();

      // Certificate Details
      doc.fontSize(12)
         .text(`Certificate Number: ${item.certificate_number}`)
         .text(`Date: ${format(new Date(item.created_at), 'MMMM dd, yyyy')}`)
         .moveDown()
         .text(`This is to certify that ${item.buyer_name} is the rightful owner of:`)
         .moveDown()
         .fontSize(16)
         .text(item.auction_title)
         .moveDown()
         .fontSize(12)
         .text(item.auction_description)
         .moveDown()
         .text(`Purchased from: ${item.seller_name}`)
         .text(`Purchase Price: $${item.purchase_price.toFixed(2)}`)
         .text(`Buyer Premium: $${item.buyer_premium.toFixed(2)}`)
         .text(`Total Amount: $${item.total_amount.toFixed(2)}`)
         .moveDown()
         .text('This certificate serves as proof of ownership and authenticity of the above-mentioned item.');

      // Add digital signature or seal
      doc.moveDown(2)
         .text('Digital Seal', { align: 'center' });

      doc.end();

      return new Promise((resolve, reject) => {
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
      });
    } finally {
      client.release();
    }
  }

  async generateInvoice(purchasedItemId: number): Promise<Buffer> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT pi.*, 
                a.title as auction_title,
                b.username as buyer_name,
                b.email as buyer_email,
                s.username as seller_name
         FROM purchased_items pi
         JOIN auctions a ON pi.auction_id = a.id
         JOIN users b ON pi.buyer_id = b.id
         JOIN users s ON pi.seller_id = s.id
         WHERE pi.id = $1`,
        [purchasedItemId]
      );

      if (result.rows.length === 0) {
        throw new Error('Purchased item not found');
      }

      const item = result.rows[0];
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50
      });

      const chunks: Buffer[] = [];
      doc.on('data', chunk => chunks.push(chunk));

      // Invoice Header
      doc.fontSize(24)
         .text('INVOICE', { align: 'center' })
         .moveDown();

      // Invoice Details
      doc.fontSize(12)
         .text(`Invoice Number: ${item.invoice_number}`)
         .text(`Date: ${format(new Date(item.created_at), 'MMMM dd, yyyy')}`)
         .moveDown()
         .text('Bill To:')
         .text(item.buyer_name)
         .text(item.buyer_email)
         .moveDown()
         .text('Item Details:')
         .text(`Description: ${item.auction_title}`)
         .moveDown()
         .text('Amount Details:')
         .text(`Purchase Price: $${item.purchase_price.toFixed(2)}`)
         .text(`Buyer Premium: $${item.buyer_premium.toFixed(2)}`)
         .text(`Total Amount: $${item.total_amount.toFixed(2)}`)
         .moveDown()
         .text('Thank you for your purchase!');

      doc.end();

      return new Promise((resolve, reject) => {
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
      });
    } finally {
      client.release();
    }
  }

  async getPurchasedItems(userId: number): Promise<any[]> {
    const result = await pool.query(
      `SELECT pi.*, 
              a.title as auction_title,
              a.description as auction_description,
              s.username as seller_name
       FROM purchased_items pi
       JOIN auctions a ON pi.auction_id = a.id
       JOIN users s ON pi.seller_id = s.id
       WHERE pi.buyer_id = $1
       ORDER BY pi.created_at DESC`,
      [userId]
    );

    return result.rows;
  }
} 