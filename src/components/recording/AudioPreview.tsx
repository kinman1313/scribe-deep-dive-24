
interface AudioPreviewProps {
  audioURL: string | null;
}

export function AudioPreview({ audioURL }: AudioPreviewProps) {
  if (!audioURL) return null;
  
  return (
    <div className="w-full pt-4">
      <h4 className="text-sm font-medium text-scribe-text mb-2">Recording Preview</h4>
      <audio src={audioURL} controls className="w-full" />
    </div>
  );
}
