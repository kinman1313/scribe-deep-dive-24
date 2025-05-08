
import React from 'react';

interface AnalysisLoaderProps {
  message: string;
}

export function AnalysisLoader({ message }: AnalysisLoaderProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-scribe-primary mb-4"></div>
      <p className="text-scribe-muted">{message}</p>
    </div>
  );
}
