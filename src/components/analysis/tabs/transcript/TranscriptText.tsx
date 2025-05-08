
import React from 'react';
import { cn } from '@/lib/utils';
import { Speaker } from '../../types';

interface TranscriptTextProps {
  transcription: string;
  speakers: Speaker[];
}

export function TranscriptText({ transcription, speakers }: TranscriptTextProps) {
  if (!transcription) return null;
  
  return (
    <>
      {transcription.split('\n').map((line, index) => {
        if (!line.trim()) return <div key={index} className="h-4" />;
        
        // Check if line starts with a speaker name (e.g., "John: ")
        const speakerMatch = line.match(/^([A-Za-z]+):/);
        
        if (speakerMatch) {
          const speakerName = speakerMatch[1];
          const message = line.substring(speakerName.length + 1).trim();
          const speaker = speakers.find(s => s.name === speakerName);
          
          return (
            <div key={index} className="mb-4">
              <span className={cn(
                "px-2 py-1 rounded-full text-sm font-medium mr-2 border",
                speaker?.color || "bg-gray-100 border-gray-300 text-gray-800"
              )}>
                {speakerName}
              </span>
              <span className="text-scribe-text">{message}</span>
            </div>
          );
        }
        
        return <div key={index} className="mb-2">{line}</div>;
      })}
    </>
  );
}
