import { Request, Response } from 'express';
import { DocumentService } from '../services/document.service';

const documentService = new DocumentService();

export const getMyPurchases = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const purchases = await documentService.getPurchasedItems(userId);

    res.json({
      success: true,
      data: purchases
    });
  } catch (error) {
    console.error('Get purchases error:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving purchases'
    });
  }
};

export const downloadCertificate = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;

    // Verify ownership
    const purchases = await documentService.getPurchasedItems(userId);
    const purchase = purchases.find(p => p.id === parseInt(id));

    if (!purchase) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this certificate'
      });
    }

    const pdfBuffer = await documentService.generateCertificate(parseInt(id));

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=certificate-${purchase.certificate_number}.pdf`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Download certificate error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating certificate'
    });
  }
};

export const downloadInvoice = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;

    // Verify ownership
    const purchases = await documentService.getPurchasedItems(userId);
    const purchase = purchases.find(p => p.id === parseInt(id));

    if (!purchase) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this invoice'
      });
    }

    const pdfBuffer = await documentService.generateInvoice(parseInt(id));

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=invoice-${purchase.invoice_number}.pdf`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Download invoice error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating invoice'
    });
  }
}; 