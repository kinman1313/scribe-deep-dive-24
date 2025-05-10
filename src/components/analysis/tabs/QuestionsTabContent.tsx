
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send } from 'lucide-react';
import { AnalysisLoader } from '../utils/AnalysisLoader';
import { MarkdownRenderer } from '../utils/MarkdownRenderer';
import { useSupabaseClient } from '@supabase/supabase-js';
import { toast } from '@/components/ui/use-toast';

interface QuestionsTabContentProps {
  transcription: string;
  isAnalyzing: boolean;
}

export function QuestionsTabContent({ transcription, isAnalyzing }: QuestionsTabContentProps) {
  const [question, setQuestion] = useState<string>('');
  const [answer, setAnswer] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [questionHistory, setQuestionHistory] = useState<Array<{question: string, answer: string}>>([]);
  const supabase = useSupabaseClient();

  const handleAskQuestion = async () => {
    if (!question.trim() || isProcessing) return;
    
    setIsProcessing(true);
    
    try {
      // Show toast to inform the user
      toast({
        title: "Processing question",
        description: "Getting insights about your transcription...",
      });

      const { data, error } = await supabase.functions.invoke('process-audio', {
        body: {
          question: question,
          transcription: transcription,
          operation: 'ask-question'
        }
      });
      
      if (error) {
        throw new Error(error.message);
      }
      
      // Get the answer from the response
      const newAnswer = data?.answer || 'Sorry, I couldn\'t process your question. Please try again.';
      
      // Update the answer state
      setAnswer(newAnswer);
      
      // Add to history
      setQuestionHistory(prev => [...prev, {
        question: question,
        answer: newAnswer
      }]);
      
      // Clear the question input
      setQuestion('');
      
      // Show success toast
      toast({
        title: "Question answered",
        description: "The AI has analyzed your transcript and provided an answer.",
      });
    } catch (error) {
      console.error('Error asking question:', error);
      
      toast({
        variant: "destructive",
        title: "Failed to process question",
        description: "We encountered an error processing your question. Please try again.",
      });
      
      setAnswer('Error processing your question. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (isAnalyzing) {
    return <AnalysisLoader message="Analyzing transcript..." />;
  }
  
  return (
    <div className="bg-white rounded-md p-4 max-h-[500px] overflow-y-auto">
      <h3 className="text-lg font-semibold mb-4 text-scribe-text">Ask Questions About This Meeting</h3>
      
      {/* Question input */}
      <div className="mb-6">
        <div className="relative">
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask a question about this meeting transcript..."
            className="min-h-[100px] pr-12"
          />
          <Button 
            className="absolute right-2 bottom-2"
            size="sm"
            disabled={!question.trim() || isProcessing}
            onClick={handleAskQuestion}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Examples: "What were the key decisions?", "Summarize the discussion about marketing", "Who is responsible for the budget review?"
        </p>
      </div>
      
      {/* Answer display */}
      {isProcessing && (
        <AnalysisLoader message="Thinking about your question..." />
      )}
      
      {answer && !isProcessing && (
        <div className="mb-6 p-4 bg-blue-50 rounded-md">
          <h4 className="font-medium mb-2">Answer:</h4>
          <div className="prose prose-sm max-w-none text-scribe-text">
            <MarkdownRenderer content={answer} />
          </div>
        </div>
      )}
      
      {/* Question history */}
      {questionHistory.length > 0 && (
        <div>
          <h4 className="font-medium mb-2 pb-2 border-b">Previous Questions</h4>
          <div className="space-y-4 mt-4">
            {questionHistory.map((item, index) => (
              <div key={index} className="border-b pb-3 last:border-b-0">
                <p className="font-medium text-scribe-primary">Q: {item.question}</p>
                <div className="mt-2 text-sm text-scribe-text">
                  <MarkdownRenderer content={item.answer} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
