
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { 
  Card, 
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle 
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CalendarIcon, Clock, FileText } from 'lucide-react';

interface Transcription {
  id: string;
  title: string;
  content: string;
  summary?: string;
  action_items?: any[];
  created_at: string;
}

interface TranscriptionListProps {
  onSelect: (transcription: Transcription) => void;
}

const TranscriptionList = ({ onSelect }: TranscriptionListProps) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: transcriptions, isLoading, error } = useQuery({
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

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-4 w-1/4" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5 mt-2" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Error Loading Transcriptions</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Failed to load your transcriptions. Please try again later.</p>
        </CardContent>
        <CardFooter>
          <Button onClick={() => window.location.reload()}>Retry</Button>
        </CardFooter>
      </Card>
    );
  }

  if (!transcriptions || transcriptions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No Transcriptions Found</CardTitle>
          <CardDescription>You haven't recorded any meetings yet.</CardDescription>
        </CardHeader>
        <CardContent>
          <p>Start a new recording to create your first transcription.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      {transcriptions.map((transcription) => (
        <Card 
          key={transcription.id}
          className={`cursor-pointer transition-all hover:shadow-md ${selectedId === transcription.id ? 'ring-2 ring-primary' : ''}`}
          onClick={() => {
            setSelectedId(transcription.id);
            onSelect(transcription);
          }}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">{transcription.title}</CardTitle>
            <CardDescription className="flex items-center text-xs">
              <CalendarIcon className="h-3 w-3 mr-1" />
              {new Date(transcription.created_at).toLocaleDateString()}
              <Clock className="h-3 w-3 ml-3 mr-1" />
              {new Date(transcription.created_at).toLocaleTimeString()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm line-clamp-2 text-muted-foreground">
              {transcription.content.substring(0, 150)}...
            </p>
          </CardContent>
          <CardFooter className="pt-0">
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-xs hover:bg-primary/10"
              onClick={(e) => {
                e.stopPropagation(); // Prevent card click
                setSelectedId(transcription.id);
                onSelect(transcription);
              }}
            >
              <FileText className="h-3 w-3 mr-1" /> View Details
            </Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
};

export default TranscriptionList;
