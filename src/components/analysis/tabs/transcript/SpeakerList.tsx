
import React from 'react';
import { cn } from '@/lib/utils';
import { Speaker } from '../../types';

interface SpeakerListProps {
  speakers: Speaker[];
}

export function SpeakerList({ speakers }: SpeakerListProps) {
  return (
    <div className="text-sm text-scribe-muted">
      <span className="font-medium">Speakers detected: </span>
      {speakers.map((speaker, i) => (
        <span key={i} className={cn(
          "inline-block px-2 py-0.5 rounded-full text-xs font-medium mr-1 border",
          speaker.color
        )}>
          {speaker.name}
        </span>
      ))}
    </div>
  );
}
