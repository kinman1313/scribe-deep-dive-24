
import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { TodoItem } from '../types';
import { AnalysisLoader } from '../utils/AnalysisLoader';

interface TodoTabContentProps {
  todoList: TodoItem[];
  setTodoList: React.Dispatch<React.SetStateAction<TodoItem[]>>;
  isAnalyzing: boolean;
}

export function TodoTabContent({ todoList, setTodoList, isAnalyzing }: TodoTabContentProps) {
  const toggleTodoItem = (index: number) => {
    setTodoList(prevList => {
      const newList = [...prevList];
      newList[index] = { ...newList[index], completed: !newList[index].completed };
      return newList;
    });
  };

  if (isAnalyzing) {
    return <AnalysisLoader message="Creating to-do list..." />;
  }

  return (
    <div className="bg-white rounded-md p-6 max-h-[500px] overflow-y-auto">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-scribe-text">To-Do List</h3>
        <Button variant="outline" size="sm">Export</Button>
      </div>
      
      <div className="space-y-2">
        {todoList.map((item, i) => (
          <div 
            key={i} 
            className={cn(
              "flex items-center p-3 border rounded-md",
              item.completed 
                ? "bg-gray-50 border-gray-200" 
                : "border-gray-100 hover:bg-gray-50"
            )}
          >
            <input
              type="checkbox"
              checked={item.completed}
              onChange={() => toggleTodoItem(i)}
              className="h-4 w-4 text-scribe-primary rounded mr-3 focus:ring-scribe-primary"
            />
            <div className="flex-grow">
              <p className={cn(
                "text-sm",
                item.completed 
                  ? "text-gray-500 line-through" 
                  : "text-scribe-text"
              )}>
                {item.task}
              </p>
              <p className="text-xs text-scribe-muted mt-1">
                Assigned to: {item.assignee}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
