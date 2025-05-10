
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send } from 'lucide-react';
import { AnalysisLoader } from '../utils/AnalysisLoader';
import { MarkdownRenderer } from '../utils/MarkdownRenderer';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';

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
  const { toast } = useToast();
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
      console.log("Sending question to Edge Function:", query);
      
      // Call the Edge Function to get AI-powered answer
      const response = await supabase.functions.invoke('process-audio', {
        body: {
          question: query,
          transcription,
          operation: 'ask-question'
        }
      });
      
      console.log("Edge function response:", response);
      
      if (response.error) {
        throw new Error(response.error.message);
      }
      
      const answer = response.data?.answer || "I couldn't generate an answer for your question.";
      
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: answer,
        role: 'assistant'
      };
      
      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('Error getting answer:', error);
      
      toast({
        variant: "destructive",
        title: "Error getting answer",
        description: "We couldn't process your question. Please try again.",
      });
      
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: 'Sorry, I encountered an error while processing your question. Please try again.',
        role: 'assistant'
      };
      
      setMessages(prev => [...prev, errorMessage]);
    } finally {
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
