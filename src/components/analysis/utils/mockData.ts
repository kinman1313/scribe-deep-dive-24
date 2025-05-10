
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
 * Generate mock data for transcription analysis based on actual transcription content
 * This is used until we have a real AI service integrated
 */
export function generateMockTranscriptionData(transcription: string): MockTranscriptionData {
  // Extract speakers from transcription
  const speakerMatches = transcription.match(/([A-Za-z]+):/g) || [];
  const uniqueSpeakers = Array.from(new Set(speakerMatches.map(s => s.replace(':', ''))));
  
  const speakerObjects: Speaker[] = uniqueSpeakers.map((name, index) => ({
    name,
    color: SPEAKER_COLORS[index % SPEAKER_COLORS.length]
  }));
  
  // Generate summary based on the actual transcription
  // Just take the first few sentences for now as a simple summary
  const lines = transcription.split('\n').filter(line => line.trim());
  const summaryLines = lines.slice(0, Math.min(8, lines.length));
  const summary = summaryLines.join('\n\n') + 
    (lines.length > 8 ? '\n\n...\n\n(For more comprehensive AI-powered analysis, connect OpenAI in settings)' : '');
  
  // Extract action items based on common action item indicators in the text
  const actionItemKeywords = [
    'need to', 'should', 'must', 'will', 'going to', 
    'by friday', 'by monday', 'next meeting', 'follow up',
    'prepare', 'send', 'share', 'create', 'finalize'
  ];
  
  const potentialActionItems: ActionItem[] = [];
  lines.forEach((line, lineIndex) => {
    const lowerLine = line.toLowerCase();
    
    // Check if this line contains any action item keywords
    if (actionItemKeywords.some(keyword => lowerLine.includes(keyword))) {
      const speakerMatch = line.match(/^([A-Za-z]+):/);
      const speaker = speakerMatch ? speakerMatch[1] : 'Unknown';
      
      potentialActionItems.push({
        text: line.replace(/^([A-Za-z]+):/, '').trim(),
        speaker: speaker,
        timestamp: `00:${Math.floor(lineIndex / 2)}:${lineIndex % 60 < 10 ? '0' + lineIndex % 60 : lineIndex % 60}`
      });
    }
  });
  
  // Limit to reasonable number of action items
  const actionItems = potentialActionItems.slice(0, Math.min(6, potentialActionItems.length));
  
  // Generate todo list from action items
  const todoList: TodoItem[] = actionItems.map(item => ({
    task: item.text,
    assignee: item.speaker,
    completed: false
  }));
  
  // Fill with some generic todos if we didn't find enough
  if (todoList.length < 3 && speakerObjects.length > 0) {
    const speakerNames = speakerObjects.map(s => s.name);
    
    const genericTodos = [
      { task: 'Schedule follow-up meeting', assignee: speakerNames[0] || 'Team' },
      { task: 'Share meeting notes with the team', assignee: speakerNames[Math.min(1, speakerNames.length - 1)] || 'Team' },
      { task: 'Prepare agenda for next meeting', assignee: speakerNames[Math.min(2, speakerNames.length - 1)] || 'Team' }
    ];
    
    genericTodos.forEach((todo, i) => {
      if (todoList.length < 3) {
        todoList.push({
          task: todo.task,
          assignee: todo.assignee,
          completed: false
        });
      }
    });
  }
  
  // Generate insights based on the actual content of the transcription
  const insights = generateInsightsFromTranscription(transcription, speakerObjects);
  
  return {
    transcription,
    speakers: speakerObjects,
    summary,
    actionItems,
    todoList,
    insights
  };
}

// Helper function to generate insights from the transcription content
function generateInsightsFromTranscription(text: string, speakers: Speaker[]): string {
  const lines = text.split('\n').filter(line => line.trim());
  
  // Count speaker participation
  const speakerCounts: Record<string, number> = {};
  speakers.forEach(speaker => {
    speakerCounts[speaker.name] = 0;
  });
  
  lines.forEach(line => {
    const match = line.match(/^([A-Za-z]+):/);
    if (match) {
      const speaker = match[1];
      speakerCounts[speaker] = (speakerCounts[speaker] || 0) + 1;
    }
  });
  
  // Find most active speaker
  let mostActiveSpeaker = '';
  let maxCount = 0;
  Object.entries(speakerCounts).forEach(([speaker, count]) => {
    if (count > maxCount) {
      mostActiveSpeaker = speaker;
      maxCount = count;
    }
  });
  
  // Extract key topics
  const topics = extractKeyTopics(text);
  
  // Build insights markdown
  let insightsMd = `## Meeting Analysis\n\n`;
  
  if (speakers.length > 0) {
    insightsMd += `### Participation Metrics\n\n`;
    insightsMd += `- **${speakers.length}** participants: ${speakers.map(s => s.name).join(', ')}\n`;
    insightsMd += `- **${lines.length}** conversation exchanges\n`;
    insightsMd += `- Most active participant: **${mostActiveSpeaker}** (${maxCount} comments)\n\n`;
    
    insightsMd += `### Participation Breakdown\n\n`;
    speakers.forEach(speaker => {
      const percentage = Math.round((speakerCounts[speaker.name] || 0) / lines.length * 100);
      insightsMd += `- **${speaker.name}**: ${speakerCounts[speaker.name] || 0} comments (${percentage}%)\n`;
    });
    insightsMd += `\n`;
  }
  
  if (topics.length > 0) {
    insightsMd += `### Key Topics Identified\n\n`;
    topics.forEach(topic => {
      insightsMd += `- ${topic}\n`;
    });
    insightsMd += `\n`;
  }
  
  insightsMd += `### Meeting Duration Analysis\n\n`;
  insightsMd += `- Estimated duration: **${Math.max(5, Math.round(lines.length / 10))} minutes**\n`;
  insightsMd += `- Average turns per minute: ${(lines.length / Math.max(5, Math.round(lines.length / 10))).toFixed(1)}\n\n`;
  
  insightsMd += `### Suggested Next Steps\n\n`;
  insightsMd += `- Review action items identified in the Action Items tab\n`;
  insightsMd += `- Assign and prioritize tasks in the To-Do tab\n`;
  insightsMd += `- Schedule follow-up discussions for unresolved topics\n\n`;
  
  insightsMd += `*For more comprehensive AI-powered analysis, connect OpenAI in settings*`;
  
  return insightsMd;
}

// Helper function to extract potential key topics from the text
function extractKeyTopics(text: string): string[] {
  const topics = new Set<string>();
  const keywords = [
    "budget", "strategy", "quarterly", "Q1", "Q2", "Q3", "Q4", 
    "report", "metrics", "revenue", "sales", "marketing", "market share",
    "launch", "product", "campaign", "increase", "decrease", "growth", 
    "project", "deadline", "timeline", "milestone", "customer", "user",
    "feature", "research", "development", "design", "implementation",
    "analytics", "data", "forecast", "prediction", "trend", "performance"
  ];
  
  const lowerText = text.toLowerCase();
  keywords.forEach(keyword => {
    if (lowerText.includes(keyword.toLowerCase())) {
      topics.add(keyword.charAt(0).toUpperCase() + keyword.slice(1));
    }
  });
  
  // Look for potential custom topics (capitalized phrases)
  const customTopicMatches = text.match(/\b[A-Z][a-z]+ [A-Z][a-z]+\b/g) || [];
  customTopicMatches.forEach(match => {
    topics.add(match);
  });
  
  return Array.from(topics).slice(0, 7); // Limit to 7 topics max
}
