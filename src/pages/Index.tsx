
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RecordingInterface } from '@/components/RecordingInterface';
import { TranscriptionAnalysis } from '@/components/TranscriptionAnalysis';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { FileText, BookOpenText, Speech, Plus, List } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import UserProfileButton from '@/components/UserProfileButton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';

interface Transcription {
  id: string;
  title: string;
  content: string;
  summary?: string;
  action_items?: any[];
  created_at: string;
}

const Index = () => {
  const { user } = useAuth();
  const [transcription, setTranscription] = useState<string>('');
  const [showDemo, setShowDemo] = useState<boolean>(false);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [selectedTranscriptionId, setSelectedTranscriptionId] = useState<string | null>(null);
  
  const { data: transcriptions, isLoading, refetch } = useQuery({
    queryKey: ['transcriptions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transcriptions')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        throw error;
      }
      
      return data as Transcription[];
    }
  });
  
  useEffect(() => {
    if (selectedTranscriptionId && transcriptions) {
      const selected = transcriptions.find(t => t.id === selectedTranscriptionId);
      if (selected) {
        setTranscription(selected.content);
      }
    }
  }, [selectedTranscriptionId, transcriptions]);
  
  const handleTranscriptionReady = async (text: string) => {
    setTranscription(text);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    if (user && text.trim()) {
      try {
        const { data, error } = await supabase
          .from('transcriptions')
          .insert([
            { 
              user_id: user.id, 
              content: text,
              title: `Meeting on ${new Date().toLocaleDateString()}`,
            }
          ])
          .select();
          
        if (error) throw error;
        
        toast({
          title: "Transcription saved!",
          description: "Your meeting has been saved to your history."
        });
        
        refetch();
      } catch (error: any) {
        toast({
          variant: "destructive",
          title: "Error saving transcription",
          description: error.message
        });
      }
    }
  };

  const loadDemoData = () => {
    setShowDemo(true);
    const demoTranscription = `
John: Hi everyone, thanks for joining today's call about the Q3 marketing plan.
Sarah: Thanks John, I've prepared some data on our previous campaign performance.
John: Great! Let's start with the social media strategy.
Sarah: Based on our Q2 results, we should increase our budget for LinkedIn campaigns by 15%.
Michael: I agree with Sarah. The LinkedIn campaigns had a 24% higher conversion rate compared to other platforms.
John: Good point. We need to finalize the budget allocation by next Monday and share it with the finance team.
Sarah: I can prepare the breakdown and send it to everyone by Friday.
John: Perfect! Let's move on to the content calendar for Q3.
Michael: I suggest we focus on product updates and customer testimonials for the first month.
John: That makes sense. Can you prepare a draft content plan by our next meeting?
Michael: Yes, I'll have it ready by then.
Sarah: Should we also discuss our upcoming product launch?
John: Yes, that's on the agenda for the second half of the meeting.
    `;
    setTranscription(demoTranscription);
  };

  return (
    <div className="min-h-screen bg-scribe-background">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center">
            <Speech className="h-8 w-8 text-scribe-primary mr-2" />
            <h1 className="text-2xl font-bold text-scribe-text">Scribe</h1>
          </div>
          
          <div className="flex items-center space-x-3">
            {user && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowHistory(!showHistory)}
                className="flex items-center"
              >
                <List className="h-4 w-4 mr-1" />
                {showHistory ? "Hide History" : "Show History"}
              </Button>
            )}
            
            {!transcription && !showDemo && (
              <Button variant="outline" size="sm" onClick={loadDemoData}>
                Load Demo
              </Button>
            )}
            
            <Button 
              variant="default" 
              size="sm" 
              className="bg-scribe-primary hover:bg-scribe-secondary"
              onClick={() => {
                setTranscription('');
                setShowDemo(false);
                setSelectedTranscriptionId(null);
              }}
            >
              <Plus className="h-4 w-4 mr-1" />
              New Recording
            </Button>
            
            <UserProfileButton />
          </div>
        </div>
      </header>
      
      <main className="container mx-auto px-4 py-8">
        {showHistory && transcriptions && transcriptions.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">Your Recordings</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {transcriptions.map((item) => (
                <div 
                  key={item.id}
                  className={`p-4 bg-white rounded-lg border cursor-pointer hover:shadow-md transition-all ${
                    selectedTranscriptionId === item.id ? 'ring-2 ring-scribe-primary' : 'border-gray-200'
                  }`}
                  onClick={() => setSelectedTranscriptionId(item.id)}
                >
                  <h3 className="font-medium">{item.title}</h3>
                  <p className="text-sm text-gray-500">
                    {new Date(item.created_at).toLocaleDateString()}
                  </p>
                  <p className="text-sm text-gray-600 mt-2 line-clamp-2">
                    {item.content.substring(0, 100)}...
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      
        {transcription || showDemo ? (
          <div className="space-y-8">
            <div className="text-center max-w-2xl mx-auto mb-8">
              <h2 className="text-3xl font-bold text-scribe-text">Meeting Analysis</h2>
              <p className="text-scribe-muted mt-2">
                Your meeting has been recorded and analyzed. Review the insights below.
              </p>
            </div>
            
            <TranscriptionAnalysis transcription={transcription} />
            
            <div className="flex justify-center pt-4">
              <Button 
                variant="outline" 
                onClick={() => {
                  setTranscription('');
                  setShowDemo(false);
                  setSelectedTranscriptionId(null);
                }}
                className="mx-auto"
              >
                Record New Meeting
              </Button>
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold text-scribe-text">Record and Analyze Meetings</h2>
              <p className="text-xl text-scribe-muted mt-4 max-w-2xl mx-auto">
                Let Scribe capture your meetings, transcribe the conversation, and extract key insights automatically.
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
              <div className="bg-white p-6 rounded-lg shadow-md border border-gray-100 flex flex-col items-center text-center">
                <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center mb-4">
                  <Speech className="h-6 w-6 text-scribe-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Smart Transcription</h3>
                <p className="text-sm text-scribe-muted">
                  Automatically transcribe your meetings with speaker identification and timestamps.
                </p>
              </div>
              
              <div className="bg-white p-6 rounded-lg shadow-md border border-gray-100 flex flex-col items-center text-center">
                <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center mb-4">
                  <FileText className="h-6 w-6 text-scribe-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Action Items & To-Dos</h3>
                <p className="text-sm text-scribe-muted">
                  Extract action items and create to-do lists automatically from your conversations.
                </p>
              </div>
              
              <div className="bg-white p-6 rounded-lg shadow-md border border-gray-100 flex flex-col items-center text-center">
                <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center mb-4">
                  <BookOpenText className="h-6 w-6 text-scribe-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Deep Insights</h3>
                <p className="text-sm text-scribe-muted">
                  Get AI-powered summaries and detailed analysis of your meeting content.
                </p>
              </div>
            </div>
            
            <RecordingInterface onTranscriptionReady={handleTranscriptionReady} />
          </div>
        )}
      </main>
      
      <footer className="bg-white border-t border-gray-200 mt-12 py-6">
        <div className="container mx-auto px-4">
          <div className="text-center text-sm text-scribe-muted">
            <p>© 2025 Scribe - Meeting Recording & Analysis Tool</p>
          </div>
        </div>
      </footer>
      
      <Toaster position="bottom-right" />
    </div>
  );
};

export default Index;
