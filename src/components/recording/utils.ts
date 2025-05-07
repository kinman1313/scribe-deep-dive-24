
/**
 * Generates a realistic mock transcription for demo purposes
 */
export const generateRealisticTranscription = (): string => {
  const speakers = ["John", "Sarah", "Michael", "Emma"];
  const topics = ["quarterly results", "marketing strategy", "product launch", "budget planning"];
  const topic = topics[Math.floor(Math.random() * topics.length)];
  const currentDate = new Date().toLocaleDateString();
  
  return `
${speakers[0]}: Welcome everyone to our meeting about ${topic} on ${currentDate}.
${speakers[1]}: Thanks for organizing this. I've prepared some data for us to review.
${speakers[0]}: Great, let's get started with the main points.
${speakers[1]}: Based on our recent analysis, we should focus on improving our key metrics by 15%.
${speakers[2]}: I agree with ${speakers[1]}. The data shows a clear trend in that direction.
${speakers[0]}: Good point. We need to finalize our strategy by next week.
${speakers[1]}: I can prepare the documentation and share it with everyone by Friday.
${speakers[0]}: Perfect! Let's move on to the next item on our agenda.
${speakers[2]}: I suggest we prioritize the most impactful actions for the first phase.
${speakers[0]}: That makes sense. Can you outline what those would be?
${speakers[2]}: Yes, I'll have a draft ready by our next meeting.
${speakers[1]}: Should we also discuss the timeline for implementation?
${speakers[0]}: Yes, that's coming up next on our agenda.
`;
};

/**
 * Formats seconds into MM:SS display format
 */
export const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};
