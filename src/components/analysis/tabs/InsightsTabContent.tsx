
import React from 'react';
import { Button } from '@/components/ui/button';
import { AnalysisLoader } from '../utils/AnalysisLoader';
import { MarkdownRenderer } from '../utils/MarkdownRenderer';

interface InsightsTabContentProps {
  insights: string;
  isAnalyzing: boolean;
}

export function InsightsTabContent({ insights, isAnalyzing }: InsightsTabContentProps) {
  if (isAnalyzing) {
    return <AnalysisLoader message="Generating deep insights..." />;
  }

  return (
    <div className="bg-white rounded-md p-6 max-h-[500px] overflow-y-auto">
      <h3 className="text-lg font-semibold mb-4 text-scribe-text">Deep Dive Insights</h3>
      
      <div className="prose prose-sm max-w-none text-scribe-text">
        <MarkdownRenderer text={insights} />
      </div>
      
      <div className="mt-6 pt-4 border-t border-gray-100">
        <Button className="w-full bg-scribe-primary hover:bg-scribe-secondary">
          Generate Detailed Report
        </Button>
      </div>
    </div>
  );
}
