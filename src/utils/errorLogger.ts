
/**
 * Utility functions for error logging to avoid circular dependencies
 */

// Log error to console
export const logError = (title: string, description: string) => {
  console.error(`[Error] ${title}: ${description}`);
};

// Format error message from various error types
export const formatErrorMessage = (error: unknown): string => {
  if (typeof error === 'string') {
    return error;
  }
  
  if (error instanceof Error) {
    return error.message;
  }
  
  if (typeof error === 'object' && error !== null) {
    if ('message' in error && typeof (error as any).message === 'string') {
      return (error as any).message;
    }
    if ('error' in error && typeof (error as any).error === 'string') {
      return (error as any).error;
    }
    if ('error' in error && typeof (error as any).error === 'object' && (error as any).error && 'message' in (error as any).error) {
      return (error as any).error.message;
    }
  }
  
  return 'Unknown error occurred';
};
