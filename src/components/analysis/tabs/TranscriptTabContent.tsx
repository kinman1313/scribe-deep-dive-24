
import React from 'react';
import { Button } from '@/components/ui/button';
import { Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Speaker } from '../types';
import { AnalysisLoader } from '../utils/AnalysisLoader';
import { SpeakerList } from './transcript/SpeakerList';
import { TranscriptText } from './transcript/TranscriptText';

interface TranscriptTabContentProps {
  transcription: string;
  speakers: Speaker[];
  isAnalyzing: boolean;
}

export function TranscriptTabContent({ transcription, speakers, isAnalyzing }: TranscriptTabContentProps) {
  if (isAnalyzing) {
    return <AnalysisLoader message="Analyzing transcript..." />;
  }
  
  return (
    <div className="bg-white rounded-md p-4 max-h-[500px] overflow-y-auto">
      <div className="mb-4 pb-2 border-b flex items-center justify-between">
        <SpeakerList speakers={speakers} />
        <Button variant="outline" size="sm" className="text-xs flex items-center gap-1">
          <Users className="h-3 w-3" />
          Edit Speakers
        </Button>
      </div>
      
      <div className="text-sm leading-relaxed text-scribe-text">
        <TranscriptText transcription={transcription} speakers={speakers} />
      </div>
    </div>
  );
}
