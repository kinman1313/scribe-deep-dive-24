
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
    
    // Show toast to inform the user
    toast({
      title: "Analyzing meeting",
      description: "Generating insights from your transcription...",
    });
    
    try {
      // Process the transcription with OpenAI via Supabase Edge Function
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
        setSummary(data.summary || "No summary was generated. Try analyzing the transcript again.");
        
        // Create action items from the AI analysis
        const processedActionItems = data.actionItems?.map((item: any) => ({
          text: item.text,
          speaker: item.assignee || 'Unknown',
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
        
        // Set insights from the AI analysis or generate a default one
        setInsights(data.insights || generateDefaultInsights(speakerObjects, transcription));
        
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

  // Helper function to generate basic insights if the AI doesn't provide them
  const generateDefaultInsights = (speakers: Speaker[], text: string): string => {
    // Count lines as a simple metric
    const lines = text.split('\n').filter(line => line.trim());
    
    // Basic markdown insights
    let insightsMd = `## Meeting Analysis\n\n`;
    
    if (speakers.length > 0) {
      insightsMd += `### Participation\n\n`;
      insightsMd += `- **${speakers.length}** participants in the meeting\n`;
      insightsMd += `- Approximately **${lines.length}** conversation exchanges\n\n`;
      
      insightsMd += `### Participants\n\n`;
      speakers.forEach(speaker => {
        insightsMd += `- **${speaker.name}**\n`;
      });
      insightsMd += `\n`;
    }
    
    insightsMd += `### Meeting Duration\n\n`;
    insightsMd += `- Estimated duration: **${Math.max(5, Math.round(lines.length / 10))} minutes**\n\n`;
    
    return insightsMd;
  };

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
