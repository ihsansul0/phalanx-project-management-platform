"use client";

import { useState, useEffect } from "react";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { TaskDetailPanel } from "~/components/shared/TaskDetailPanel";
import Pusher from "pusher-js";
import { useUser, useAuth } from "@clerk/nextjs";
import { tasks } from "~/server/db/schema";
import type { InferSelectModel } from "drizzle-orm";

const COLUMNS = ["TODO", "IN_PROGRESS", "DONE"] as const;
type Task = InferSelectModel<typeof tasks>;

export function TaskBoard({ projectId }: { projectId: string }) {
    const [title, setTitle] = useState("");
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);
    const utils = api.useUtils();

    // We need our ID (to prevent echoes) and our Organization ID (to tune the radio)
    const { user } = useUser();
    const { orgId } = useAuth();

    // THE LIVE WIRE (Board Listener)
    useEffect(() => {
        // If we aren't in a workspace yet, don't try to connect
        if (!orgId) return;

        const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
            cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
        });

        // Tune into the Workspace-wide frequency
        const channel = pusher.subscribe(`workspace-${orgId}`);

        channel.bind("board-updated", (data: { triggeredBy: string }) => {
            // If SOMEONE ELSE moved a card, instantly refresh our board!
            if (data.triggeredBy !== user?.id) {
                void utils.task.getByProjectId.invalidate();
            }
        });

        return () => {
            pusher.unsubscribe(`workspace-${orgId}`);
        };
    }, [orgId, user?.id, utils]);

    // 1. Fetch Tasks
    const { data: tasks, isLoading } = api.task.getByProjectId.useQuery({ projectId });

    // 2. Optimistic Create (Ghost ID)
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

    // 3. Optimistic Status Update (The Magic behind the Drag & Drop)
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

    // 4. The Delete Protocol
    const deleteTask = api.task.delete.useMutation({
        onSuccess: () => {
            void utils.task.getByProjectId.invalidate({ projectId });
            void utils.task.getProjectStats.invalidate({ projectId });
        }
    });

    // THE DRAG & DROP ENGINE
    const onDragEnd = (result: DropResult) => {
        const { destination, source, draggableId } = result;

        // If dropped outside a valid column, do nothing
        if (!destination) return;

        // If dropped back into the exact same column, do nothing
        if (destination.droppableId === source.droppableId) return;

        // OPTIMISTIC TRIGGER: Fire the mutation!
        // draggableId is the Task ID. destination.droppableId is the new Status.
        updateStatus.mutate({
            taskId: draggableId,
            status: destination.droppableId as "TODO" | "IN_PROGRESS" | "DONE"
        });
    };

    if (isLoading) return <div className="animate-pulse text-slate-500">Loading Kanban...</div>;

    return (
        <div className="space-y-6">
            {/* Rapid-Fire Creation Form */}
            <form
                onSubmit={(e) => { e.preventDefault(); createTask.mutate({ title, projectId }); }}
                className="items-center mb-6 flex gap-4"
            >
                <input
                    type="text"
                    placeholder="What needs to be done?"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="flex-1 rounded-md border p-2 text-sm"
                />
                <Button type="submit" disabled={!title.trim() || createTask.isPending}>Add Task</Button>
                {createTask.error && (
                    <p className="text-sm text-red-500">{createTask.error.data?.zodError?.fieldErrors?.title?.[0] ?? createTask.error.message}</p>
                )}
            </form>

            {/* THE KANBAN BOARD */}
            <DragDropContext onDragEnd={onDragEnd}>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                    {COLUMNS.map((colStatus) => {
                        // Bucket the tasks into their specific columns
                        const columnTasks = tasks?.filter((t) => t.status === colStatus) ?? [];

                        return (
                            <Droppable key={colStatus} droppableId={colStatus}>
                                {(provided, snapshot) => (
                                    <div
                                        ref={provided.innerRef}
                                        {...provided.droppableProps}
                                        className={`flex min-h-[300px] flex-col rounded-xl bg-slate-100 p-4 transition-colors ${snapshot.isDraggingOver ? "bg-slate-200 ring-2 ring-slate-300" : ""
                                            }`}
                                    >
                                        <h3 className="mb-4 text-sm font-bold tracking-widest text-slate-500">
                                            {colStatus.replace("_", " ")} ({columnTasks.length})
                                        </h3>

                                        <div className="flex flex-col gap-3">
                                            {columnTasks.map((task, index) => (
                                                <Draggable key={task.id} draggableId={task.id} index={index}>
                                                    {(provided, snapshot) => (
                                                        <div
                                                            ref={provided.innerRef}
                                                            {...provided.draggableProps}
                                                            {...provided.dragHandleProps}
                                                            onClick={() => setSelectedTask(task)}
                                                            className={`group relative flex flex-col justify-between rounded-lg border bg-white p-4 shadow-sm transition-shadow ${snapshot.isDragging ? "shadow-xl ring-2 ring-blue-500" : "hover:border-slate-300"
                                                                }`}
                                                        >
                                                            <p className={`font-medium ${task.status === "DONE" ? "text-slate-400 line-through" : "text-slate-900"}`}>
                                                                {task.title}
                                                            </p>

                                                            {/* Hover Delete Button */}
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (window.confirm("Delete this task forever?")) {
                                                                        deleteTask.mutate({ taskId: task.id })
                                                                    }
                                                                }}
                                                                className="absolute right-2 top-2 hidden text-slate-400 hover:text-red-500 group-hover:block"
                                                                title="Delete task"
                                                            >
                                                                ✕
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

            {/* Render the Slide-Out Panel if a task is selected */}
            {selectedTask && (
                <TaskDetailPanel
                    task={selectedTask}
                    onClose={() => setSelectedTask(null)}
                />
            )}
        </div>
    );
}