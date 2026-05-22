"use client";

import { useState, useEffect } from "react";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { TaskDetailPanel } from "~/components/shared/TaskDetailPanel";
import Pusher from "pusher-js";
import { useUser, useAuth } from "@clerk/nextjs";
import type { tasks } from "~/server/db/schema";
import type { InferSelectModel } from "drizzle-orm";
import { X, Plus, Terminal } from "lucide-react";

const COLUMNS = ["TODO", "IN_PROGRESS", "DONE"] as const;
type Task = InferSelectModel<typeof tasks>;

export function TaskBoard({ projectId }: { projectId: string }) {
    const [title, setTitle] = useState("");
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);
    const utils = api.useUtils();

    const { user } = useUser();
    const { orgId } = useAuth();

    // THE LIVE WIRE (Board Listener)
    useEffect(() => {
        if (!orgId) return;

        const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
            cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
        });

        const channel = pusher.subscribe(`workspace-${orgId}`);

        channel.bind("board-updated", (data: { triggeredBy: string }) => {
            if (data.triggeredBy !== user?.id) {
                void utils.task.getByProjectId.invalidate();
            }
        });

        return () => {
            pusher.unsubscribe(`workspace-${orgId}`);
        };
    }, [orgId, user?.id, utils]);

    // Fetch Tasks
    const { data: tasks, isLoading } = api.task.getByProjectId.useQuery({ projectId });

    // Optimistic Create
    const createTask = api.task.create.useMutation({
        onMutate: async (newParam) => {
            await utils.task.getByProjectId.cancel({ projectId });
            const prev = utils.task.getByProjectId.getData({ projectId });
            setTitle("");
            utils.task.getByProjectId.setData({ projectId }, (old) => {
                const ghost = {
                    id: `ghost-${crypto.randomUUID()}`,
                    title: newParam.title,
                    status: "TODO" as const,
                    projectId: newParam.projectId,
                    workspaceId: "optimistic",
                    description: null,
                    dueDate: null,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                };
                return old ? [...old, ghost] : [ghost];
            });
            return { prev };
        },
        onError: (err, newParam, ctx) => {
            if (ctx?.prev) utils.task.getByProjectId.setData({ projectId }, ctx.prev);
            setTitle(newParam.title);
        },
        onSettled: () => {
            void utils.task.getByProjectId.invalidate({ projectId });
            void utils.task.getProjectStats.invalidate({ projectId });
        },
    });

    // Optimistic Status Update
    const updateStatus = api.task.updateStatus.useMutation({
        onMutate: async (newUpdate) => {
            await utils.task.getByProjectId.cancel({ projectId });
            const prev = utils.task.getByProjectId.getData({ projectId });
            utils.task.getByProjectId.setData({ projectId }, (old) => {
                if (!old) return old;
                return old.map((t) => t.id === newUpdate.taskId ? { ...t, status: newUpdate.status } : t);
            });
            return { prev };
        },
        onError: (err, newUpdate, ctx) => {
            if (ctx?.prev) utils.task.getByProjectId.setData({ projectId }, ctx.prev);
        },
        onSettled: () => {
            void utils.task.getByProjectId.invalidate({ projectId });
            void utils.task.getProjectStats.invalidate({ projectId });
        }
    });

    // The Delete Protocol
    const deleteTask = api.task.delete.useMutation({
        onSuccess: () => {
            void utils.task.getByProjectId.invalidate({ projectId });
            void utils.task.getProjectStats.invalidate({ projectId });
        }
    });

    const onDragEnd = (result: DropResult) => {
        const { destination, source, draggableId } = result;
        if (!destination) return;
        if (destination.droppableId === source.droppableId) return;

        updateStatus.mutate({
            taskId: draggableId,
            status: destination.droppableId as "TODO" | "IN_PROGRESS" | "DONE"
        });
    };

    if (isLoading) {
        return (
            <div className="flex items-center gap-3 font-mono text-xs text-muted-foreground animate-pulse py-8">
                <Terminal className="h-4 w-4" />
                <span>MAP_TRACK_RECORDS_ENGINE: INITIALIZING_WORKFLOW_STATE...</span>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Rapid-Fire Creation Form */}
            <form
                onSubmit={(e) => { e.preventDefault(); if (title.trim()) createTask.mutate({ title, projectId }); }}
                className="max-w-xl items-center flex gap-3 bg-neutral-900/30 p-2 rounded-md border border-border"
            >
                <input
                    type="text"
                    placeholder="Initialize fresh task node..."
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="flex-1 bg-transparent px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none transition-all"
                />
                <Button
                    type="submit"
                    size="sm"
                    disabled={!title.trim() || createTask.isPending}
                    className="h-8 font-medium tracking-tight gap-1"
                >
                    <Plus className="h-3.5 w-3.5" />
                    Deploy
                </Button>
            </form>
            {createTask.error && (
                <p className="text-xs font-mono text-red-400 pl-3">
                    {createTask.error.data?.zodError?.fieldErrors?.title?.[0] ?? createTask.error.message}
                </p>
            )}

            {/* THE KANBAN BOARD MATRIX */}
            <DragDropContext onDragEnd={onDragEnd}>
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 items-start">
                    {COLUMNS.map((colStatus) => {
                        const columnTasks = tasks?.filter((t) => t.status === colStatus) ?? [];

                        return (
                            <Droppable key={colStatus} droppableId={colStatus}>
                                {(provided, snapshot) => (
                                    <div
                                        ref={provided.innerRef}
                                        {...provided.droppableProps}
                                        className={`flex min-h-[550px] flex-col rounded-md border border-border/40 bg-transparent p-4 transition-all ${snapshot.isDraggingOver ? "border-white/20 bg-white/[0.01]" : ""
                                            }`}
                                    >
                                        {/* COLUMN STRUCTURAL LABEL */}
                                        <div className="flex items-center justify-between mb-4 px-1">
                                            <h3 className="text-xs font-mono font-medium tracking-wider text-muted-foreground">
                                                {colStatus.replace("_", " ")}
                                            </h3>
                                            <span className="rounded bg-neutral-900 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground border border-border/60">
                                                {columnTasks.length}
                                            </span>
                                        </div>

                                        {/* DATA STACK TRACK */}
                                        <div className="flex flex-1 flex-col gap-2.5">
                                            {columnTasks.map((task, index) => (
                                                <Draggable key={task.id} draggableId={task.id} index={index}>
                                                    {(provided, snapshot) => (
                                                        <div
                                                            ref={provided.innerRef}
                                                            {...provided.draggableProps}
                                                            {...provided.dragHandleProps}
                                                            onClick={() => setSelectedTask(task)}
                                                            className={`group relative flex flex-col justify-between rounded-md border p-4 transition-all cursor-pointer select-none ${snapshot.isDragging
                                                                ? "bg-neutral-900 border-white/30 shadow-2xl scale-[1.01] ring-1 ring-white/10"
                                                                : "bg-card border-border hover:border-white/20 hover:bg-white/[0.01]"
                                                                }`}
                                                        >
                                                            <p className={`text-sm font-medium tracking-tight pr-4 leading-relaxed ${task.status === "DONE"
                                                                ? "text-muted-foreground/60 line-through decoration-muted-foreground/40"
                                                                : "text-foreground"
                                                                }`}>
                                                                {task.title}
                                                            </p>

                                                            {/* Vectorized Actions Overlay */}
                                                            {/* RESPONSIVE PURGE TRIGGER: Always on for mobile, interactive hover for desktop */}
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (window.confirm("Purge this task environment permanently?")) {
                                                                        deleteTask.mutate({ taskId: task.id })
                                                                    }
                                                                }}
                                                                className="absolute right-3 top-3.5 block md:hidden md:group-hover:block text-muted-foreground hover:text-white transition-colors"
                                                                title="Purge Task"
                                                            >
                                                                <X className="h-3.5 w-3.5" />
                                                            </button>
                                                        </div>
                                                    )}
                                                </Draggable>
                                            ))}
                                            {provided.placeholder}
                                        </div>
                                    </div>
                                )}
                            </Droppable>
                        );
                    })}
                </div>
            </DragDropContext>

            {/* Slide-Out Workspace Core Context Panel */}
            {selectedTask && (
                <TaskDetailPanel
                    task={selectedTask}
                    onClose={() => setSelectedTask(null)}
                />
            )}
        </div>
    );
}