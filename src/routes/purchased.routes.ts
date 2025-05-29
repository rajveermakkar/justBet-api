import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import {
  getMyPurchases,
  downloadCertificate,
  downloadInvoice
} from '../controllers/purchased.controller';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Get user's purchased items
router.get('/', getMyPurchases);

// Download certificate
router.get('/:id/certificate', downloadCertificate);

// Download invoice
router.get('/:id/invoice', downloadInvoice);

export default router; 