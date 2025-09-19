import 'dotenv/config';
import App from './app';
import logger from './utils/logger';

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise);
  logger.error('Unhandled Rejection reason:', reason);
  
  // Log detailed error information
  if (reason instanceof Error) {
    logger.error('Error details:', {
      message: reason.message,
      stack: reason.stack,
      name: reason.name
    });
  } else {
    logger.error('Non-error rejection:', reason);
  }
  
  // Start graceful shutdown
  logger.info('Received unhandledRejection. Starting graceful shutdown...');
  process.exit(1);
});

// Create and start the application
const app = new App();

app.start().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});

// Export app for testing purposes
export default app;