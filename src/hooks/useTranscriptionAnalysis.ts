
import { useState, useCallback } from 'react';
import { Speaker, ActionItem, TodoItem } from '@/components/analysis/types';
import { toast } from '@/components/ui/use-toast';
import { invokeEdgeFunction } from '@/integrations/supabase/client';

interface AnalysisResult {
  speakers: Speaker[];
  summary: string;
  actionItems: ActionItem[];
  todoList: TodoItem[];
  insights: string;
  error?: string;
}

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
    
    // Extract speakers from transcription as a fallback
    const speakerMatches = transcription.match(/([A-Za-z]+):/g) || [];
    const uniqueSpeakers = Array.from(new Set(speakerMatches.map(s => s.replace(':', ''))));
    
    // Speaker colors
    const SPEAKER_COLORS = [
      'bg-blue-100 border-blue-300 text-blue-800',
      'bg-green-100 border-green-300 text-green-800',
      'bg-purple-100 border-purple-300 text-purple-800',
      'bg-amber-100 border-amber-300 text-amber-800',
      'bg-pink-100 border-pink-300 text-pink-800',
    ];
    
    // Create basic speaker objects with color assignments
    const basicSpeakers = uniqueSpeakers.map((name, index) => ({
      name,
      color: SPEAKER_COLORS[index % SPEAKER_COLORS.length]
    }));
    
    // Set basic speaker information right away
    setSpeakers(basicSpeakers);
    
    // In a production app, this would call your backend for analysis
    // For now, we'll extract what we can from the transcription
    try {
      // Basic summary extraction (first few lines)
      const lines = transcription.split('\n').filter(line => line.trim());
      const briefSummary = lines.slice(0, Math.min(5, lines.length)).join('\n');
      setSummary(briefSummary + "\n\n(Note: This is a basic summary. For comprehensive analysis, add AI processing.)");
      
      // Extract potential action items (lines with "need to" or similar phrases)
      const potentialActionItems = lines
        .filter(line => {
          const lower = line.toLowerCase();
          return lower.includes("need to") || 
                 lower.includes("should") || 
                 lower.includes("must") ||
                 lower.includes("have to") ||
                 lower.includes("going to");
        })
        .map(line => {
          const speakerMatch = line.match(/^([A-Za-z]+):/);
          return {
            text: line.replace(/^([A-Za-z]+):/, '').trim(),
            speaker: speakerMatch ? speakerMatch[1] : 'Unknown',
            timestamp: '00:00:00' // We don't have real timestamps yet
          };
        });
      
      setActionItems(potentialActionItems);
      
      // Create todo list from action items
      const todoItems = potentialActionItems.map(item => ({
        task: item.text,
        assignee: item.speaker,
        completed: false
      }));
      
      setTodoList(todoItems);
      
      // Basic insights
      setInsights(`
        ## Meeting Analysis

        This transcription contains:
        - ${uniqueSpeakers.length} speakers identified
        - ${lines.length} conversation exchanges
        - ${potentialActionItems.length} potential action items
        
        To get more detailed AI analysis of this meeting, enable OpenAI integration with an API key.
      `);
      
      setIsAnalyzing(false);
      setIsAnalysisComplete(true);
      
      toast({
        title: "Analysis complete",
        description: "Basic meeting insights are ready to view.",
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
    
    // In future: Add an actual edge function call to do AI analysis
    // This would analyze the full transcript with OpenAI
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
