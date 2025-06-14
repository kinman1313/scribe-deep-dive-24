
import { useState, useCallback } from 'react';
import { Speaker, ActionItem, TodoItem } from '@/components/analysis/types';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';

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
    setSummary(''); // Clear any existing data
    setActionItems([]);
    setTodoList([]);
    setInsights('');
    
    // Show toast to inform the user
    toast({
      title: "Analyzing meeting",
      description: "Generating insights from your transcription...",
    });
    
    try {
      console.log("Starting transcription analysis...");
      
      // Call the OpenAI-powered edge function to analyze the transcription
      supabase.functions.invoke('process-audio', {
        body: {
          transcription,
          operation: 'process-recording',
          analyze: true
        }
      })
      .then((response) => {
        if (response.error) {
          throw new Error(response.error.message);
        }
        
        const data = response.data;
        console.log("Analysis response:", data);
        
        // Extract speakers from the transcription
        const speakerMatches = transcription.match(/([A-Za-z]+):/g) || [];
        const uniqueSpeakers = Array.from(new Set(speakerMatches.map(s => s.replace(':', ''))));
        
        const speakerColors = [
          'bg-blue-100 border-blue-300 text-blue-800',
          'bg-green-100 border-green-300 text-green-800',
          'bg-purple-100 border-purple-300 text-purple-800',
          'bg-amber-100 border-amber-300 text-amber-800',
          'bg-pink-100 border-pink-300 text-pink-800',
        ];
        
        const speakerObjects: Speaker[] = uniqueSpeakers.map((name, index) => ({
          name,
          color: speakerColors[index % speakerColors.length]
        }));
        
        setSpeakers(speakerObjects);
        
        // Set the summary from the AI analysis
        setSummary(data.summary || "The AI couldn't generate a summary. Please try analyzing the transcript again.");
        
        // Create action items from the AI analysis
        const processedActionItems = data.actionItems?.map((item: any) => ({
          text: item.text,
          speaker: item.assignee || 'Team',
          timestamp: '00:00:00' // We don't have actual timestamps from the AI yet
        })) || [];
        
        setActionItems(processedActionItems);
        
        // Create todo list from the action items
        const todos = processedActionItems.map((item: ActionItem) => ({
          task: item.text,
          assignee: item.speaker,
          completed: false
        }));
        
        setTodoList(todos);
        
        // Set insights from the AI analysis
        setInsights(data.insights || data.keyPoints?.join('\n\n') || `## Meeting Analysis\n\nThe AI couldn't generate detailed insights for this meeting. Try analyzing again with a longer transcription or provide more context in the conversation.`);
        
        setIsAnalyzing(false);
        setIsAnalysisComplete(true);
        
        toast({
          title: "Analysis complete",
          description: "Meeting insights are ready to view.",
        });
      })
      .catch((error) => {
        console.error("Error analyzing transcription:", error);
        setIsAnalyzing(false);
        
        toast({
          variant: "destructive",
          title: "Analysis failed",
          description: "We encountered an error while analyzing your meeting.",
        });
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
