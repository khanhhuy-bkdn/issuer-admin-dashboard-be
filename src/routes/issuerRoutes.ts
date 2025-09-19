import { Router } from 'express';
import issuerController from '../controllers/issuerController';
import { validate, schemas } from '../middleware/validation';

const router = Router();

// GET /issuers - Get all issuers with optional status filtering
router.get(
  '/',
  validate(schemas.getIssuers, 'query'),
  issuerController.getIssuers.bind(issuerController)
);

// GET /issuers/stats - Get issuer statistics
router.get(
  '/stats',
  issuerController.getIssuerStats.bind(issuerController)
);

// GET /issuers/pending - Get pending issuers
router.get(
  '/pending',
  validate(schemas.getIssuers, 'query'),
  issuerController.getPendingIssuers.bind(issuerController)
);

// GET /issuers/approved - Get approved issuers
router.get(
  '/approved',
  validate(schemas.getIssuers, 'query'),
  issuerController.getApprovedIssuers.bind(issuerController)
);

// GET /issuers/rejected - Get rejected issuers
router.get(
  '/rejected',
  validate(schemas.getIssuers, 'query'),
  issuerController.getRejectedIssuers.bind(issuerController)
);

// GET /issuer/:address - Get specific issuer by address
router.get(
  '/:address',
  validate(schemas.getIssuerByAddress, 'params'),
  issuerController.getIssuerByAddress.bind(issuerController)
);

export default router;