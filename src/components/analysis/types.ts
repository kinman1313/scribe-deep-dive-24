
export interface Speaker {
  name: string;
  color: string;
}

export interface ActionItem {
  text: string;
  speaker: string;
  timestamp: string;
}

export interface TodoItem {
  task: string;
  assignee: string;
  completed: boolean;
}
