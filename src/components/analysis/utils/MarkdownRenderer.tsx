
import React from 'react';
import { Separator } from '@/components/ui/separator';

export interface MarkdownRendererProps {
  text: string;
}

/**
 * A simple markdown renderer for basic markdown elements
 */
export function MarkdownRenderer({ text }: MarkdownRendererProps) {
  if (!text) return null;
  
  // Convert the markdown text to React components
  const renderMarkdown = (markdownText: string) => {
    return markdownText.split('\n').map((line, lineIndex) => {
      if (!line.trim()) {
        return <div key={lineIndex} className="h-4" />;
      }
      
      // Heading 1
      if (line.startsWith('# ')) {
        return (
          <h1 key={lineIndex} className="text-2xl font-bold mt-6 mb-4">
            {line.substring(2)}
          </h1>
        );
      }
      
      // Heading 2
      if (line.startsWith('## ')) {
        return (
          <h2 key={lineIndex} className="text-xl font-bold mt-6 mb-3">
            {line.substring(3)}
          </h2>
        );
      }
      
      // Heading 3
      if (line.startsWith('### ')) {
        return (
          <h3 key={lineIndex} className="text-lg font-semibold mt-4 mb-2">
            {line.substring(4)}
          </h3>
        );
      }
      
      // Bold text
      if (line.includes('**')) {
        const parts = line.split('**');
        const elements = [];
        
        for (let i = 0; i < parts.length; i++) {
          if (i % 2 === 0) {
            // Regular text
            elements.push(<span key={`${lineIndex}-${i}`}>{parts[i]}</span>);
          } else {
            // Bold text
            elements.push(<strong key={`${lineIndex}-${i}`} className="font-semibold">{parts[i]}</strong>);
          }
        }
        
        return <p key={lineIndex} className="mb-2">{elements}</p>;
      }
      
      // Horizontal rule
      if (line.startsWith('---')) {
        return <Separator key={lineIndex} className="my-4" />;
      }
      
      // Bullet points
      if (line.startsWith('- ')) {
        return (
          <div key={lineIndex} className="flex mb-1 ml-2">
            <span className="mr-2">•</span>
            <span>{line.substring(2)}</span>
          </div>
        );
      }
      
      // Numbered lists (very basic implementation)
      const numberedListMatch = line.match(/^(\d+)\.\s+(.+)/);
      if (numberedListMatch) {
        return (
          <div key={lineIndex} className="flex mb-1 ml-2">
            <span className="mr-2 min-w-[20px]">{numberedListMatch[1]}.</span>
            <span>{numberedListMatch[2]}</span>
          </div>
        );
      }
      
      // Regular paragraph
      return <p key={lineIndex} className="mb-2">{line}</p>;
    });
  };

  return (
    <div className="markdown-content">
      {renderMarkdown(text)}
    </div>
  );
}
