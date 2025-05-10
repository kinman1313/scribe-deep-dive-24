
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send } from 'lucide-react';
import { AnalysisLoader } from '../utils/AnalysisLoader';
import { MarkdownRenderer } from '../utils/MarkdownRenderer';
import { supabase } from '@/integrations/supabase/client';

interface QuestionsTabContentProps {
  transcription: string;
  isAnalyzing: boolean;
}

interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
}

export function QuestionsTabContent({ transcription, isAnalyzing }: QuestionsTabContentProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      content: 'Ask me any question about this meeting, and I\'ll help you find answers based on the transcript.',
      role: 'assistant'
    }
  ]);
  
  const handleAskQuestion = async () => {
    if (!query.trim() || isLoading) return;
    
    // Add user message to the chat
    const userMessage: Message = {
      id: Date.now().toString(),
      content: query,
      role: 'user'
    };
    
    setMessages(prev => [...prev, userMessage]);
    setQuery('');
    setIsLoading(true);
    
    try {
      // Simulate AI response - in a real app this would call your OpenAI integration
      // In a real implementation, we'd send the query and transcription to an AI service
      setTimeout(() => {
        const response = generateMockAIResponse(query, transcription);
        
        const aiMessage: Message = {
          id: (Date.now() + 1).toString(),
          content: response,
          role: 'assistant'
        };
        
        setMessages(prev => [...prev, aiMessage]);
        setIsLoading(false);
      }, 1500);
    } catch (error) {
      console.error('Error getting answer:', error);
      
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: 'Sorry, I encountered an error while processing your question. Please try again.',
        role: 'assistant'
      };
      
      setMessages(prev => [...prev, errorMessage]);
      setIsLoading(false);
    }
  };
  
  if (isAnalyzing) {
    return <AnalysisLoader message="Preparing Q&A assistant..." />;
  }

  return (
    <div className="bg-white rounded-md overflow-hidden flex flex-col h-[500px]">
      <div className="overflow-y-auto flex-1 p-6">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`mb-4 ${
              message.role === 'user' ? 'ml-auto max-w-[80%]' : 'mr-auto max-w-[80%]'
            }`}
          >
            <div
              className={`p-3 rounded-lg ${
                message.role === 'user'
                  ? 'bg-scribe-primary text-white'
                  : 'bg-gray-100'
              }`}
            >
              {message.role === 'assistant' ? (
                <div className="prose prose-sm max-w-none">
                  <MarkdownRenderer text={message.content} />
                </div>
              ) : (
                <p>{message.content}</p>
              )}
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="mb-4 mr-auto max-w-[80%]">
            <div className="flex items-center p-3 rounded-lg bg-gray-100">
              <div className="flex space-x-2">
                <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          </div>
        )}
      </div>
      
      <div className="p-4 border-t border-gray-200">
        <form 
          onSubmit={(e) => {
            e.preventDefault();
            handleAskQuestion();
          }}
          className="flex space-x-2"
        >
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask a question about this meeting..."
            className="flex-1"
            disabled={isLoading}
          />
          <Button type="submit" size="icon" disabled={isLoading || !query.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}

// Helper function to generate mock AI responses
function generateMockAIResponse(query: string, transcription: string): string {
  const lowerQuery = query.toLowerCase();
  
  // Handle common questions with tailored responses
  if (lowerQuery.includes('summary') || lowerQuery.includes('summarize')) {
    return `## Meeting Summary\n\nThis meeting focused on discussing project updates, upcoming deadlines, and resource allocation. The team went through the current sprint progress and identified several action items that need to be addressed before the end of the week.\n\nKey points included:\n- Project Alpha is on track for delivery by the end of the month\n- Resources need to be reallocated to support Project Beta\n- Client meeting scheduled for next Thursday needs preparation`;
  }
  
  if (lowerQuery.includes('action') || lowerQuery.includes('todo')) {
    return `## Action Items\n\nI found several action items mentioned in the meeting:\n\n1. **Complete the documentation** - Due by Friday\n2. **Schedule client demo** - By the end of week\n3. **Follow up with marketing team** - About the launch materials\n4. **Review pending pull requests** - By tomorrow\n\nYou can also check the Action Items tab for a more complete list.`;
  }
  
  if (lowerQuery.includes('who') && (lowerQuery.includes('attended') || lowerQuery.includes('present'))) {
    // Extract speaker names from transcription
    const speakerMatches = transcription.match(/([A-Za-z]+):/g) || [];
    const speakers = Array.from(new Set(speakerMatches.map(s => s.replace(':', ''))));
    
    return `## Meeting Participants\n\nThe following people participated in the meeting:\n\n${speakers.map(s => `- **${s}**`).join('\n')}\n\nThere were ${speakers.length} participants in total.`;
  }
  
  if (lowerQuery.includes('decision') || lowerQuery.includes('decide')) {
    return `## Key Decisions\n\nThe team made several important decisions during this meeting:\n\n1. **Technology Stack** - Agreed to use React with TypeScript for the frontend\n2. **Timeline Adjustment** - Extended the delivery date by two weeks\n3. **Resource Allocation** - Assigned two additional developers to Project X\n\nThese decisions were documented in the meeting minutes.`;
  }
  
  // Generic response for other questions
  return `Based on the meeting transcript, I can see that your question about "${query}" relates to several points discussed.\n\nWhile I don't have a specific answer extracted yet, you might find relevant information in the Summary or Action Items tabs.\n\n*For more detailed AI-powered analysis of specific questions, connect OpenAI in settings.*`;
}
