
// This file is a wrapper around our toast implementation to add enhanced features
// It re-exports the core toast functionality with additional error logging

import { useToast as useToastOriginal, toast as toastOriginal } from "@/hooks/use-toast";
import type { ToastProps } from "@/components/ui/toast";

// Create an enhanced toast function with better error handling
const enhancedToast = (props: ToastProps & { title?: string; description?: string }) => {
  // Log errors to console when toast is destructive
  if (props.variant === "destructive") {
    console.error("[Toast Error]", props.title, props.description);
  }
  
  // Use the original toast implementation
  return toastOriginal(props);
};

// Re-export the hooks with our enhanced versions
export const useToast = useToastOriginal;
export const toast = enhancedToast;

// Export type for convenience
export type { ToastProps };
