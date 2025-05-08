
import React from 'react';

interface MarkdownRendererProps {
  text: string;
}

export function MarkdownRenderer({ text }: MarkdownRendererProps) {
  if (!text) return null;
  
  // Very simple markdown rendering for demo
  return (
    <>
      {text.split('\n').map((line, index) => {
        if (!line.trim()) return <div key={index} className="h-4" />;
        
        if (line.startsWith('## ')) {
          return <h2 key={index} className="text-xl font-bold mt-6 mb-3">{line.substring(3)}</h2>;
        }
        
        if (line.startsWith('1. **') || line.startsWith('2. **') || line.startsWith('3. **') || line.startsWith('4. **')) {
          const parts = line.split('**');
          return (
            <div key={index} className="mb-4">
              <div className="font-bold">{parts[0] + parts[1]}</div>
              <div className="pl-6">{parts.slice(2).join('')}</div>
            </div>
          );
        }
        
        if (line.startsWith('- ')) {
          return <div key={index} className="ml-4 mb-1">• {line.substring(2)}</div>;
        }
        
        return <div key={index} className="mb-2">{line}</div>;
      })}
    </>
  );
}
