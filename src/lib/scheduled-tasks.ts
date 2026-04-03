export interface ScheduledTask {
  id: string;
  name: string;
  instruction: string;
  schedule: {
    type: 'once' | 'daily' | 'weekly' | 'monthly';
    time: string;  // HH:mm
    dayOfWeek?: number;  // 0-6 (Sunday-Saturday)
    dayOfMonth?: number; // 1-31
    date?: string; // YYYY-MM-DD for 'once' type
  };
  enabled: boolean;
  nextRunTime: string;
  lastRunTime?: string;
  createdAt: string;
}

const STORAGE_KEY = 'xiaolongxia_scheduled_tasks';

export function getScheduledTasks(): ScheduledTask[] {
  if (typeof window === 'undefined') return [];
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function saveScheduledTasks(tasks: ScheduledTask[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

export function addScheduledTask(task: Omit<ScheduledTask, 'id' | 'createdAt' | 'nextRunTime'>): ScheduledTask {
  const newTask: ScheduledTask = {
    ...task,
    id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    createdAt: new Date().toISOString(),
    nextRunTime: calculateNextRunTime(task.schedule),
  };

  const tasks = getScheduledTasks();
  tasks.push(newTask);
  saveScheduledTasks(tasks);
  return newTask;
}

export function updateScheduledTask(id: string, updates: Partial<ScheduledTask>): void {
  const tasks = getScheduledTasks();
  const index = tasks.findIndex(t => t.id === id);
  if (index !== -1) {
    tasks[index] = { ...tasks[index], ...updates };
    if (updates.schedule) {
      tasks[index].nextRunTime = calculateNextRunTime(updates.schedule);
    }
    saveScheduledTasks(tasks);
  }
}

export function deleteScheduledTask(id: string): void {
  const tasks = getScheduledTasks();
  saveScheduledTasks(tasks.filter(t => t.id !== id));
}

export function calculateNextRunTime(schedule: ScheduledTask['schedule']): string {
  const now = new Date();
  const [hours, minutes] = schedule.time.split(':').map(Number);

  let next = new Date();
  next.setHours(hours, minutes, 0, 0);

  switch (schedule.type) {
    case 'once':
      if (schedule.date) {
        next = new Date(schedule.date);
        next.setHours(hours, minutes, 0, 0);
      }
      break;

    case 'daily':
      if (next <= now) {
        next.setDate(next.getDate() + 1);
      }
      break;

    case 'weekly':
      if (schedule.dayOfWeek !== undefined) {
        const currentDay = next.getDay();
        let daysUntil = schedule.dayOfWeek - currentDay;
        if (daysUntil < 0 || (daysUntil === 0 && next <= now)) {
          daysUntil += 7;
        }
        next.setDate(next.getDate() + daysUntil);
      }
      break;

    case 'monthly':
      if (schedule.dayOfMonth !== undefined) {
        next.setDate(schedule.dayOfMonth);
        if (next <= now) {
          next.setMonth(next.getMonth() + 1);
        }
      }
      break;
  }

  return next.toISOString();
}

export function checkAndExecuteTasks(executeCallback: (task: ScheduledTask) => void): void {
  const tasks = getScheduledTasks();
  const now = new Date();

  tasks.forEach(task => {
    if (!task.enabled) return;

    const nextRun = new Date(task.nextRunTime);
    if (nextRun <= now) {
      executeCallback(task);

      // Update last run time and calculate next run
      updateScheduledTask(task.id, {
        lastRunTime: now.toISOString(),
        nextRunTime: task.schedule.type === 'once'
          ? task.nextRunTime // Don't update for one-time tasks
          : calculateNextRunTime(task.schedule),
        enabled: task.schedule.type === 'once' ? false : task.enabled, // Disable one-time tasks after execution
      });
    }
  });
}
