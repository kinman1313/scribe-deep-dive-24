
import { useState, useCallback } from 'react';
import { Speaker, ActionItem, TodoItem } from '@/components/analysis/types';
import { toast } from '@/components/ui/use-toast';

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
    
    try {
      // Extract speakers from transcription
      console.log("Extracting speakers from transcription");
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
      
      // Create speaker objects with color assignments
      const extractedSpeakers = uniqueSpeakers.map((name, index) => ({
        name,
        color: SPEAKER_COLORS[index % SPEAKER_COLORS.length]
      }));
      
      setSpeakers(extractedSpeakers);
      
      // Generate summary
      // Extract first paragraph as summary for now
      const lines = transcription.split('\n').filter(line => line.trim());
      const briefSummary = lines.slice(0, Math.min(5, lines.length)).join('\n');
      setSummary(briefSummary + "\n\n(For comprehensive AI-powered analysis, enable OpenAI integration in Supabase Edge Functions)");
      
      // Extract potential action items 
      // Look for phrases that might indicate action items
      const potentialActionItems = lines
        .filter(line => {
          const lower = line.toLowerCase();
          return lower.includes("need to") || 
                 lower.includes("should") || 
                 lower.includes("must") ||
                 lower.includes("have to") ||
                 lower.includes("going to") ||
                 lower.includes("by friday") ||
                 lower.includes("by monday") ||
                 lower.includes("next meeting") ||
                 lower.includes("prepare") ||
                 lower.includes("send") ||
                 lower.includes("share") ||
                 lower.includes("create") ||
                 lower.includes("finalize");
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
      
      // Generate basic insights
      const speakerCounts: Record<string, number> = {};
      lines.forEach(line => {
        const match = line.match(/^([A-Za-z]+):/);
        if (match) {
          const speaker = match[1];
          speakerCounts[speaker] = (speakerCounts[speaker] || 0) + 1;
        }
      });
      
      // Calculate most active speaker
      let mostActiveSpeaker = '';
      let maxCount = 0;
      Object.entries(speakerCounts).forEach(([speaker, count]) => {
        if (count > maxCount) {
          mostActiveSpeaker = speaker;
          maxCount = count;
        }
      });
      
      // Generate insights markdown
      setInsights(`
## Meeting Analysis

This meeting had:
- ${uniqueSpeakers.length} participants: ${uniqueSpeakers.join(', ')}
- ${lines.length} conversation exchanges
- ${potentialActionItems.length} action items identified

### Participation Analysis
- Most active participant: ${mostActiveSpeaker} (${maxCount} comments)
- ${uniqueSpeakers.map(s => `${s}: ${speakerCounts[s] || 0} comments`).join('\n- ')}

### Key Topics
${extractKeyTopics(transcription)}

### Next Steps
${potentialActionItems.slice(0, 3).map(item => `- ${item.speaker}: ${item.text}`).join('\n')}
${potentialActionItems.length > 3 ? `\n...and ${potentialActionItems.length - 3} more action items` : ''}
      `);
      
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

  // Helper function to extract potential key topics
  function extractKeyTopics(text: string): string {
    const topics = new Set<string>();
    const keywords = ["budget", "strategy", "quarterly", "Q1", "Q2", "Q3", "Q4", 
                     "report", "metrics", "revenue", "sales", "marketing",
                     "launch", "product", "campaign", "increase", "decrease"];
    
    const lines = text.toLowerCase().split('\n');
    keywords.forEach(keyword => {
      lines.forEach(line => {
        if (line.includes(keyword.toLowerCase())) {
          topics.add(keyword);
        }
      });
    });
    
    if (topics.size === 0) return "No specific topics identified";
    
    return Array.from(topics).map(topic => `- ${topic.charAt(0).toUpperCase() + topic.slice(1)}`).join('\n');
  }

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
