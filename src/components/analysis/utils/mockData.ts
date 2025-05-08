
import { MockTranscriptionData, Speaker, ActionItem, TodoItem } from '../types';

// Speaker colors
const SPEAKER_COLORS = [
  'bg-blue-100 border-blue-300 text-blue-800',
  'bg-green-100 border-green-300 text-green-800',
  'bg-purple-100 border-purple-300 text-purple-800',
  'bg-amber-100 border-amber-300 text-amber-800',
  'bg-pink-100 border-pink-300 text-pink-800',
];

/**
 * Generate mock data for transcription analysis
 * This is used as a fallback when the real transcription service is unavailable
 */
export function generateMockTranscriptionData(transcription: string): MockTranscriptionData {
  // Extract speakers from transcription
  const speakerMatches = transcription.match(/([A-Za-z]+):/g) || [];
  const uniqueSpeakers = Array.from(new Set(speakerMatches.map(s => s.replace(':', ''))));
  
  const speakerObjects: Speaker[] = uniqueSpeakers.map((name, index) => ({
    name,
    color: SPEAKER_COLORS[index % SPEAKER_COLORS.length]
  }));
  
  // Generate mock summary
  const summary = `
    This meeting focused on the Q3 marketing plan. The team discussed increasing the LinkedIn campaign budget by 15% due to its higher conversion rate (24%) compared to other platforms. 
    
    The budget allocation needs to be finalized by next Monday and shared with the finance team. Sarah will prepare the breakdown by Friday.
    
    For the Q3 content calendar, the team agreed to focus on product updates and customer testimonials for the first month. Michael will prepare a draft content plan for the next meeting.
    
    The team also briefly mentioned the upcoming product launch, which was scheduled for discussion in the second half of the meeting.
  `;
  
  // Generate mock action items
  const actionItems: ActionItem[] = [
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
  ];
  
  // Generate mock todo list
  const todoList: TodoItem[] = [
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
  ];
  
  // Generate mock insights
  const insights = `
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
  `;
  
  return {
    transcription,
    speakers: speakerObjects,
    summary,
    actionItems,
    todoList,
    insights
  };
}
