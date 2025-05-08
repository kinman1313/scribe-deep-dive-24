
import { useState, useCallback } from 'react';
import { Speaker, ActionItem, TodoItem } from '@/components/analysis/types';
import { generateMockTranscriptionData } from '@/components/analysis/utils/mockData';
import { toast } from '@/components/ui/use-toast';

export function useTranscriptionAnalysis(transcription: string) {
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [summary, setSummary] = useState<string>('');
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [todoList, setTodoList] = useState<TodoItem[]>([]);
  const [insights, setInsights] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [isAnalysisComplete, setIsAnalysisComplete] = useState<boolean>(false);

  const analyzeTranscription = useCallback(() => {
    if (!transcription || isAnalyzing) return;
    
    setIsAnalyzing(true);
    
    // Show toast to inform the user
    toast({
      title: "Analyzing meeting",
      description: "Generating insights from your transcription...",
    });
    
    // Use mock data generator instead of calling backend services
    setTimeout(() => {
      try {
        const mockData = generateMockTranscriptionData(transcription);
        
        setSpeakers(mockData.speakers);
        setSummary(mockData.summary);
        setActionItems(mockData.actionItems);
        setTodoList(mockData.todoList);
        setInsights(mockData.insights);
        
        setIsAnalyzing(false);
        setIsAnalysisComplete(true);
        
        toast({
          title: "Analysis complete",
          description: "Your meeting insights are ready to view.",
        });
      } catch (error) {
        console.error("Error analyzing transcription:", error);
        setIsAnalyzing(false);
        
        toast({
          variant: "destructive",
          title: "Analysis failed",
          description: "We encountered an error while analyzing your meeting.",
        });
      }
    }, 2000);
  }, [transcription, isAnalyzing]);

  return {
    speakers,
    summary,
    actionItems,
    todoList,
    setTodoList,
    insights,
    isAnalyzing,
    isAnalysisComplete,
    analyzeTranscription
  };
}
