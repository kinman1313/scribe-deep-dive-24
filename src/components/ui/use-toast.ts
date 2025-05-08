
import { useToast, toast } from "@/hooks/use-toast";

// Re-export with additional error handling functionality
export { useToast };

// Create an enhanced toast function with better error handling
export const toast = (props: Parameters<typeof toast>[0]) => {
  // Log errors to console when toast is destructive
  if (props.variant === "destructive") {
    console.error("[Toast Error]", props.title, props.description);
  }
  
  return toast(props);
};
