
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Text } from 'lucide-react';
import { AnalysisTabs } from './AnalysisTabs';
import { TranscriptTabContent } from './tabs/TranscriptTabContent';
import { SummaryTabContent } from './tabs/SummaryTabContent';
import { ActionItemsTabContent } from './tabs/ActionItemsTabContent';
import { TodoTabContent } from './tabs/TodoTabContent';
import { InsightsTabContent } from './tabs/InsightsTabContent';
import { QuestionsTabContent } from './tabs/QuestionsTabContent';
import { useTranscriptionAnalysis } from '@/hooks/useTranscriptionAnalysis';

interface TranscriptionAnalysisProps {
  transcription: string;
}

export function TranscriptionAnalysis({ transcription }: TranscriptionAnalysisProps) {
  const [activeTab, setActiveTab] = useState('transcript');
  
  const {
    speakers,
    summary,
    actionItems,
    todoList,
    setTodoList,
    insights,
    isAnalyzing,
    isAnalysisComplete,
    analyzeTranscription
  } = useTranscriptionAnalysis(transcription);

  useEffect(() => {
    if (transcription && !isAnalysisComplete) {
      analyzeTranscription();
    }
  }, [transcription, isAnalysisComplete, analyzeTranscription]);

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
            <AnalysisTabs />
            
            <TabsContent value="transcript" className="mt-0">
              <TranscriptTabContent 
                transcription={transcription} 
                speakers={speakers} 
                isAnalyzing={isAnalyzing} 
              />
            </TabsContent>
            
            <TabsContent value="summary" className="mt-0">
              <SummaryTabContent 
                summary={summary} 
                isAnalyzing={isAnalyzing} 
              />
            </TabsContent>
            
            <TabsContent value="action-items" className="mt-0">
              <ActionItemsTabContent 
                actionItems={actionItems} 
                isAnalyzing={isAnalyzing} 
              />
            </TabsContent>
            
            <TabsContent value="todo" className="mt-0">
              <TodoTabContent 
                todoList={todoList} 
                setTodoList={setTodoList}
                isAnalyzing={isAnalyzing} 
              />
            </TabsContent>
            
            <TabsContent value="insights" className="mt-0">
              <InsightsTabContent 
                insights={insights} 
                isAnalyzing={isAnalyzing} 
              />
            </TabsContent>
            
            <TabsContent value="questions" className="mt-0">
              <QuestionsTabContent 
                transcription={transcription}
                isAnalyzing={isAnalyzing} 
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
