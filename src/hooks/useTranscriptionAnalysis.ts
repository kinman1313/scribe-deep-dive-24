
import { useState, useCallback } from 'react';
import { Speaker, ActionItem, TodoItem } from '@/components/analysis/types';
import { toast } from '@/components/ui/use-toast';
import { generateMockTranscriptionData } from '@/components/analysis/utils/mockData';

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
    
    try {
      // Process the real transcription data
      console.log("Starting transcription analysis...");
      
      // For now we'll use our mock data generator, but with the actual transcription content
      // This makes the transition easier until we fully integrate with a real ML service
      const processedData = generateMockTranscriptionData(transcription);
      
      // Update state with the processed data
      setSpeakers(processedData.speakers);
      setSummary(processedData.summary);
      setActionItems(processedData.actionItems);
      setTodoList(processedData.todoList);
      setInsights(processedData.insights);
      
      setIsAnalyzing(false);
      setIsAnalysisComplete(true);
      
      toast({
        title: "Analysis complete",
        description: "Meeting insights are ready to view.",
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
