import type { Task } from "./task.js";

export interface TaskStorePort {
  list(): readonly Task[];
  upsert(task: Task): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface TaskMutationObserver {
  onAdded(task: Task): void;
  onUpdated(task: Task): void;
  onRemoved(taskId: string): void;
}

export class TaskRegistry {
  private readonly tasks: Map<string, Task>;
  private readonly observers = new Set<TaskMutationObserver>();

  constructor(
    private readonly store: TaskStorePort,
    private readonly now: () => Date = () => new Date()
  ) {
    this.tasks = new Map(store.list().map((task) => [task.id, cloneTask(task)]));
  }

  list(): readonly Task[] {
    return [...this.tasks.values()].map(cloneTask);
  }

  get(id: string): Task | undefined {
    const task = this.tasks.get(id);
    return task ? cloneTask(task) : undefined;
  }

  findByPrefix(prefix: string): Task[] {
    return this.list().filter((task) => task.id.startsWith(prefix));
  }

  async add(task: Task): Promise<void> {
    if (this.tasks.has(task.id)) {
      throw new Error(`Task already exists: ${task.id}`);
    }
    const next = cloneTask(task);
    this.tasks.set(next.id, next);
    await this.store.upsert(next);
    for (const observer of this.observers) {
      observer.onAdded(cloneTask(next));
    }
  }

  async update(id: string, patch: Partial<Task>): Promise<Task> {
    const current = this.tasks.get(id);
    if (!current) {
      throw new Error(`Task not found: ${id}`);
    }
    const { id: _id, createdAt: _createdAt, source: _source, ...allowedPatch } = patch;
    const next: Task = {
      ...current,
      ...allowedPatch,
      id: current.id,
      createdAt: current.createdAt,
      source: current.source,
      updatedAt: this.now().toISOString()
    };
    this.tasks.set(id, cloneTask(next));
    await this.store.upsert(next);
    for (const observer of this.observers) {
      observer.onUpdated(cloneTask(next));
    }
    return cloneTask(next);
  }

  async remove(id: string): Promise<void> {
    if (!this.tasks.has(id)) {
      return;
    }
    this.tasks.delete(id);
    await this.store.remove(id);
    for (const observer of this.observers) {
      observer.onRemoved(id);
    }
  }

  subscribe(observer: TaskMutationObserver): () => void {
    this.observers.add(observer);
    return () => {
      this.observers.delete(observer);
    };
  }
}

function cloneTask(task: Task): Task {
  return {
    ...task,
    params: { ...task.params },
    activeHours: task.activeHours ? [...task.activeHours] : null,
    target: task.target ? { ...task.target } : null,
    lastRun: task.lastRun ? { ...task.lastRun } : null
  };
}
