
import React from 'react';
import { AnalysisLoader } from '../utils/AnalysisLoader';

interface SummaryTabContentProps {
  summary: string;
  isAnalyzing: boolean;
}

export function SummaryTabContent({ summary, isAnalyzing }: SummaryTabContentProps) {
  if (isAnalyzing) {
    return <AnalysisLoader message="Generating summary..." />;
  }

  return (
    <div className="bg-white rounded-md p-6 max-h-[500px] overflow-y-auto">
      <h3 className="text-lg font-semibold mb-4 text-scribe-text">Meeting Summary</h3>
      <div className="text-sm leading-relaxed whitespace-pre-line text-scribe-text">
        {summary}
      </div>
    </div>
  );
}
