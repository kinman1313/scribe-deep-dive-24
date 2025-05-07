
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Book, FileText, CheckCheck, Search, User, Users, Text } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TranscriptionAnalysisProps {
  transcription: string;
}

interface Speaker {
  name: string;
  color: string;
}

interface ActionItem {
  text: string;
  speaker: string;
  timestamp: string;
}

interface TodoItem {
  task: string;
  assignee: string;
  completed: boolean;
}

const SPEAKER_COLORS = [
  'bg-blue-100 border-blue-300 text-blue-800',
  'bg-green-100 border-green-300 text-green-800',
  'bg-purple-100 border-purple-300 text-purple-800',
  'bg-amber-100 border-amber-300 text-amber-800',
  'bg-pink-100 border-pink-300 text-pink-800',
];

export function TranscriptionAnalysis({ transcription }: TranscriptionAnalysisProps) {
  const [activeTab, setActiveTab] = useState('transcript');
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [summary, setSummary] = useState<string>('');
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [todoList, setTodoList] = useState<TodoItem[]>([]);
  const [insights, setInsights] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [isAnalysisComplete, setIsAnalysisComplete] = useState<boolean>(false);

  useEffect(() => {
    if (transcription && !isAnalysisComplete) {
      analyzeTranscription();
    }
  }, [transcription]);

  const analyzeTranscription = () => {
    if (!transcription || isAnalyzing) return;
    
    setIsAnalyzing(true);
    
    // In a real app, this would call your backend services for analysis
    setTimeout(() => {
      // Extract speakers
      const speakerMatches = transcription.match(/([A-Za-z]+):/g) || [];
      const uniqueSpeakers = Array.from(new Set(speakerMatches.map(s => s.replace(':', ''))));
      
      const speakerObjects = uniqueSpeakers.map((name, index) => ({
        name,
        color: SPEAKER_COLORS[index % SPEAKER_COLORS.length]
      }));
      setSpeakers(speakerObjects);
      
      // Generate summary
      setSummary(`
        This meeting focused on the Q3 marketing plan. The team discussed increasing the LinkedIn campaign budget by 15% due to its higher conversion rate (24%) compared to other platforms. 
        
        The budget allocation needs to be finalized by next Monday and shared with the finance team. Sarah will prepare the breakdown by Friday.
        
        For the Q3 content calendar, the team agreed to focus on product updates and customer testimonials for the first month. Michael will prepare a draft content plan for the next meeting.
        
        The team also briefly mentioned the upcoming product launch, which was scheduled for discussion in the second half of the meeting.
      `);
      
      // Extract action items
      setActionItems([
        {
          text: 'Finalize budget allocation',
          speaker: 'John',
          timestamp: '00:03:42'
        },
        {
          text: 'Prepare budget breakdown',
          speaker: 'Sarah',
          timestamp: '00:04:15'
        },
        {
          text: 'Create draft content plan',
          speaker: 'Michael',
          timestamp: '00:06:30'
        },
        {
          text: 'Discuss product launch',
          speaker: 'Team',
          timestamp: '00:08:12'
        }
      ]);
      
      // Generate todo list
      setTodoList([
        {
          task: 'Finalize Q3 marketing budget allocation',
          assignee: 'John',
          completed: false
        },
        {
          task: 'Prepare budget breakdown document',
          assignee: 'Sarah',
          completed: false
        },
        {
          task: 'Send budget document to finance team',
          assignee: 'Sarah',
          completed: false
        },
        {
          task: 'Create draft Q3 content plan',
          assignee: 'Michael',
          completed: false
        },
        {
          task: 'Schedule product launch discussion',
          assignee: 'John',
          completed: false
        }
      ]);
      
      // Generate insights
      setInsights(`
        ## Key Performance Insights

        1. **LinkedIn Campaign Performance**
           - 24% higher conversion rate than other platforms
           - Recommendation: Increase budget by 15%
           - Potential ROI impact: ~20% increase in qualified leads

        2. **Content Strategy Analysis**
           - Most effective content types: Product updates, customer testimonials
           - Recommendation: Focus initial Q3 efforts on these formats
           - Consider case studies as supplementary content

        3. **Budget Allocation Efficiency**
           - Current allocation shows suboptimal distribution
           - Recommendation: Realign based on Q2 performance metrics
           - Priority channels: LinkedIn, Email, Targeted Display

        4. **Product Launch Considerations**
           - Critical to align marketing messaging with product features
           - Recommendation: Create integrated campaign across all channels
           - Focus on solving customer pain points identified in recent survey
      `);
      
      setIsAnalyzing(false);
      setIsAnalysisComplete(true);
    }, 2000);
  };

  const formatTranscription = (text: string) => {
    if (!text) return null;
    
    return text.split('\n').map((line, index) => {
      if (!line.trim()) return <div key={index} className="h-4" />;
      
      // Check if line starts with a speaker name (e.g., "John: ")
      const speakerMatch = line.match(/^([A-Za-z]+):/);
      
      if (speakerMatch) {
        const speakerName = speakerMatch[1];
        const message = line.substring(speakerName.length + 1).trim();
        const speaker = speakers.find(s => s.name === speakerName);
        
        return (
          <div key={index} className="mb-4">
            <span className={cn(
              "px-2 py-1 rounded-full text-sm font-medium mr-2 border",
              speaker?.color || "bg-gray-100 border-gray-300 text-gray-800"
            )}>
              {speakerName}
            </span>
            <span className="text-scribe-text">{message}</span>
          </div>
        );
      }
      
      return <div key={index} className="mb-2">{line}</div>;
    });
  };

  const toggleTodoItem = (index: number) => {
    setTodoList(prevList => {
      const newList = [...prevList];
      newList[index] = { ...newList[index], completed: !newList[index].completed };
      return newList;
    });
  };

  const renderMarkdown = (text: string) => {
    if (!text) return null;
    
    // Very simple markdown rendering for demo
    return text.split('\n').map((line, index) => {
      if (!line.trim()) return <div key={index} className="h-4" />;
      
      if (line.startsWith('## ')) {
        return <h2 key={index} className="text-xl font-bold mt-6 mb-3">{line.substring(3)}</h2>;
      }
      
      if (line.startsWith('1. **') || line.startsWith('2. **') || line.startsWith('3. **') || line.startsWith('4. **')) {
        const parts = line.split('**');
        return (
          <div key={index} className="mb-4">
            <div className="font-bold">{parts[0] + parts[1]}</div>
            <div className="pl-6">{parts.slice(2).join('')}</div>
          </div>
        );
      }
      
      if (line.startsWith('- ')) {
        return <div key={index} className="ml-4 mb-1">• {line.substring(2)}</div>;
      }
      
      return <div key={index} className="mb-2">{line}</div>;
    });
  };

  if (!transcription) {
    return null;
  }

  return (
    <div className="w-full space-y-6">
      <Card className="shadow-lg border-scribe-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-xl font-semibold text-scribe-text flex items-center">
            <FileText className="h-5 w-5 mr-2 text-scribe-primary" />
            Meeting Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="transcript" value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid grid-cols-5 mb-6">
              <TabsTrigger value="transcript" className="flex items-center gap-2">
                <Text className="h-4 w-4" />
                <span className="hidden sm:inline">Transcript</span>
              </TabsTrigger>
              <TabsTrigger value="summary" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                <span className="hidden sm:inline">Summary</span>
              </TabsTrigger>
              <TabsTrigger value="action-items" className="flex items-center gap-2">
                <CheckCheck className="h-4 w-4" />
                <span className="hidden sm:inline">Actions</span>
              </TabsTrigger>
              <TabsTrigger value="todo" className="flex items-center gap-2">
                <Book className="h-4 w-4" />
                <span className="hidden sm:inline">To-Do</span>
              </TabsTrigger>
              <TabsTrigger value="insights" className="flex items-center gap-2">
                <Search className="h-4 w-4" />
                <span className="hidden sm:inline">Deep Dive</span>
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="transcript" className="mt-0">
              {isAnalyzing ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-scribe-primary mb-4"></div>
                  <p className="text-scribe-muted">Analyzing transcript...</p>
                </div>
              ) : (
                <div className="bg-white rounded-md p-4 max-h-[500px] overflow-y-auto">
                  <div className="mb-4 pb-2 border-b flex items-center justify-between">
                    <div className="text-sm text-scribe-muted">
                      <span className="font-medium">Speakers detected: </span>
                      {speakers.map((speaker, i) => (
                        <span key={i} className={cn(
                          "inline-block px-2 py-0.5 rounded-full text-xs font-medium mr-1 border",
                          speaker.color
                        )}>
                          {speaker.name}
                        </span>
                      ))}
                    </div>
                    
                    <Button variant="outline" size="sm" className="text-xs flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      Edit Speakers
                    </Button>
                  </div>
                  
                  <div className="text-sm leading-relaxed text-scribe-text">
                    {formatTranscription(transcription)}
                  </div>
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="summary" className="mt-0">
              {isAnalyzing ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-scribe-primary mb-4"></div>
                  <p className="text-scribe-muted">Generating summary...</p>
                </div>
              ) : (
                <div className="bg-white rounded-md p-6 max-h-[500px] overflow-y-auto">
                  <h3 className="text-lg font-semibold mb-4 text-scribe-text">Meeting Summary</h3>
                  <div className="text-sm leading-relaxed whitespace-pre-line text-scribe-text">
                    {summary}
                  </div>
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="action-items" className="mt-0">
              {isAnalyzing ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-scribe-primary mb-4"></div>
                  <p className="text-scribe-muted">Identifying action items...</p>
                </div>
              ) : (
                <div className="bg-white rounded-md p-6 max-h-[500px] overflow-y-auto">
                  <h3 className="text-lg font-semibold mb-4 text-scribe-text">Action Items</h3>
                  
                  <div className="space-y-3">
                    {actionItems.map((item, i) => (
                      <div key={i} className="flex items-start p-3 border border-gray-100 rounded-md hover:bg-gray-50">
                        <div className="flex-grow">
                          <p className="text-sm font-medium text-scribe-text">{item.text}</p>
                          <div className="flex items-center mt-1">
                            <span className="text-xs text-scribe-muted flex items-center mr-3">
                              <User className="h-3 w-3 mr-1" />
                              {item.speaker}
                            </span>
                            <span className="text-xs text-scribe-muted">
                              {item.timestamp}
                            </span>
                          </div>
                        </div>
                        <Button size="sm" variant="ghost" className="text-xs mt-1">
                          Add to Todo
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="todo" className="mt-0">
              {isAnalyzing ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-scribe-primary mb-4"></div>
                  <p className="text-scribe-muted">Creating to-do list...</p>
                </div>
              ) : (
                <div className="bg-white rounded-md p-6 max-h-[500px] overflow-y-auto">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-scribe-text">To-Do List</h3>
                    <Button variant="outline" size="sm">Export</Button>
                  </div>
                  
                  <div className="space-y-2">
                    {todoList.map((item, i) => (
                      <div 
                        key={i} 
                        className={cn(
                          "flex items-center p-3 border rounded-md",
                          item.completed 
                            ? "bg-gray-50 border-gray-200" 
                            : "border-gray-100 hover:bg-gray-50"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={item.completed}
                          onChange={() => toggleTodoItem(i)}
                          className="h-4 w-4 text-scribe-primary rounded mr-3 focus:ring-scribe-primary"
                        />
                        <div className="flex-grow">
                          <p className={cn(
                            "text-sm",
                            item.completed 
                              ? "text-gray-500 line-through" 
                              : "text-scribe-text"
                          )}>
                            {item.task}
                          </p>
                          <p className="text-xs text-scribe-muted mt-1">
                            Assigned to: {item.assignee}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="insights" className="mt-0">
              {isAnalyzing ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-scribe-primary mb-4"></div>
                  <p className="text-scribe-muted">Generating deep insights...</p>
                </div>
              ) : (
                <div className="bg-white rounded-md p-6 max-h-[500px] overflow-y-auto">
                  <h3 className="text-lg font-semibold mb-4 text-scribe-text">Deep Dive Insights</h3>
                  
                  <div className="prose prose-sm max-w-none text-scribe-text">
                    {renderMarkdown(insights)}
                  </div>
                  
                  <div className="mt-6 pt-4 border-t border-gray-100">
                    <Button className="w-full bg-scribe-primary hover:bg-scribe-secondary">
                      Generate Detailed Report
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
