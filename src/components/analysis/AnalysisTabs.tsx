
import React from 'react';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Text, FileText, CheckCheck, Book, Search, MessageSquareQuote } from 'lucide-react';

export function AnalysisTabs() {
  return (
    <TabsList className="grid grid-cols-6 mb-6">
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
      <TabsTrigger value="questions" className="flex items-center gap-2">
        <MessageSquareQuote className="h-4 w-4" />
        <span className="hidden sm:inline">Q&A</span>
      </TabsTrigger>
    </TabsList>
  );
}
