import { Request, Response, NextFunction } from 'express';
import issuerService from '../services/issuerService';
import { IssuerQueryParams, IssuerStatus } from '../types/issuer';
import logger from '../utils/logger';

export class IssuerController {
  // GET /issuers - Get issuers with optional filtering
  async getIssuers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { status, limit = 10, offset = 0 } = req.query as {
        status?: IssuerStatus;
        limit?: string;
        offset?: string;
      };

      const parsedLimit = parseInt(limit as string) || 10;
      const parsedOffset = parseInt(offset as string) || 0;

      let result;
      
      if (status) {
        // Get issuers by specific status
        result = await issuerService.getIssuersByStatus({
          status,
          limit: parsedLimit,
          offset: parsedOffset
        });
      } else {
        // Get all issuers
        result = await issuerService.getAllIssuers(parsedLimit, parsedOffset);
      }

      res.json({
        success: true,
        data: result,
        meta: {
          total: result.total,
          limit: result.limit,
          offset: result.offset,
          hasMore: result.offset + result.limit < result.total
        }
      });
    } catch (error) {
      logger.error('Error in getIssuers:', error);
      next(error);
    }
  }

  // GET /issuer/:address - Get specific issuer by address
  async getIssuerByAddress(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { address } = req.params;
      
      const issuer = await issuerService.getIssuer(address);
      
      if (!issuer) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: `Issuer with address ${address} not found`
        });
        return;
      }

      res.json({
        success: true,
        data: issuer
      });
    } catch (error) {
      logger.error('Error in getIssuerByAddress:', error);
      next(error);
    }
  }

  // GET /issuers/stats - Get issuer statistics
  async getIssuerStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const [pendingResult, approvedResult, rejectedResult] = await Promise.all([
        issuerService.getIssuersByStatus({ status: IssuerStatus.PENDING, limit: 1 }),
        issuerService.getIssuersByStatus({ status: IssuerStatus.APPROVED, limit: 1 }),
        issuerService.getIssuersByStatus({ status: IssuerStatus.REJECTED, limit: 1 })
      ]);

      const stats = {
        pending: pendingResult.total,
        approved: approvedResult.total,
        rejected: rejectedResult.total,
        total: pendingResult.total + approvedResult.total + rejectedResult.total
      };

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      logger.error('Error in getIssuerStats:', error);
      next(error);
    }
  }

  // GET /issuers/pending - Get pending issuers (shortcut)
  async getPendingIssuers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { limit = 50, offset = 0 } = req.query as {
        limit?: number;
        offset?: number;
      };

      const result = await issuerService.getIssuersByStatus({
        status: IssuerStatus.PENDING,
        limit: Number(limit),
        offset: Number(offset)
      });

      res.json({
        success: true,
        data: result,
        meta: {
          total: result.total,
          limit: result.limit,
          offset: result.offset,
          hasMore: result.offset + result.limit < result.total
        }
      });
    } catch (error) {
      logger.error('Error in getPendingIssuers:', error);
      next(error);
    }
  }

  // GET /issuers/approved - Get approved issuers (shortcut)
  async getApprovedIssuers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { limit = 50, offset = 0 } = req.query as {
        limit?: number;
        offset?: number;
      };

      const result = await issuerService.getIssuersByStatus({
        status: IssuerStatus.APPROVED,
        limit: Number(limit),
        offset: Number(offset)
      });

      res.json({
        success: true,
        data: result,
        meta: {
          total: result.total,
          limit: result.limit,
          offset: result.offset,
          hasMore: result.offset + result.limit < result.total
        }
      });
    } catch (error) {
      logger.error('Error in getApprovedIssuers:', error);
      next(error);
    }
  }

  // GET /issuers/rejected - Get rejected issuers (shortcut)
  async getRejectedIssuers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { limit = 50, offset = 0 } = req.query as {
        limit?: number;
        offset?: number;
      };

      const result = await issuerService.getIssuersByStatus({
        status: IssuerStatus.REJECTED,
        limit: Number(limit),
        offset: Number(offset)
      });

      res.json({
        success: true,
        data: result,
        meta: {
          total: result.total,
          limit: result.limit,
          offset: result.offset,
          hasMore: result.offset + result.limit < result.total
        }
      });
    } catch (error) {
      logger.error('Error in getRejectedIssuers:', error);
      next(error);
    }
  }
}

export default new IssuerController();