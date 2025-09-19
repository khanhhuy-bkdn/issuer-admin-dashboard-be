import { Router } from 'express';
import healthController from '../controllers/healthController';

const router = Router();

// GET /healthz - Basic health check
router.get(
  '/',
  healthController.healthCheck.bind(healthController)
);

// GET /healthz/detailed - Detailed health check with metrics
router.get(
  '/detailed',
  healthController.detailedHealthCheck.bind(healthController)
);

// GET /healthz/ready - Readiness probe (for Kubernetes)
router.get(
  '/ready',
  healthController.readinessCheck.bind(healthController)
);

// GET /healthz/live - Liveness probe (for Kubernetes)
router.get(
  '/live',
  healthController.livenessCheck.bind(healthController)
);

export default router;