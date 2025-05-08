
import React from 'react';
import { Button } from '@/components/ui/button';
import { User } from 'lucide-react';
import { ActionItem } from '../types';
import { AnalysisLoader } from '../utils/AnalysisLoader';

interface ActionItemsTabContentProps {
  actionItems: ActionItem[];
  isAnalyzing: boolean;
}

export function ActionItemsTabContent({ actionItems, isAnalyzing }: ActionItemsTabContentProps) {
  if (isAnalyzing) {
    return <AnalysisLoader message="Identifying action items..." />;
  }

  return (
    <div className="bg-white rounded-md p-6 max-h-[500px] overflow-y-auto">
      <h3 className="text-lg font-semibold mb-4 text-scribe-text">Action Items</h3>
      
      <div className="space-y-3">
        {actionItems.map((item, i) => (
          <div key={i} className="flex items-start p-3 border border-gray-100 rounded-md hover:bg-gray-50">
            <div className="flex-grow">
              <p className="text-sm font-medium text-scribe-text">{item.text}</p>
              <div className="flex items-center mt-1">
                <span className="text-xs text-scribe-muted flex items-center mr-3">
                  <User className="h-3 w-3 mr-1" />
                  {item.speaker}
                </span>
                <span className="text-xs text-scribe-muted">
                  {item.timestamp}
                </span>
              </div>
            </div>
            <Button size="sm" variant="ghost" className="text-xs mt-1">
              Add to Todo
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
