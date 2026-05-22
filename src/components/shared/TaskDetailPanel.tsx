"use client";

import { useState, useEffect } from "react";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import Pusher from "pusher-js";
import { useUser } from "@clerk/nextjs";
import { X, Calendar, MessageSquare, Terminal } from "lucide-react";

type TaskProps = {
    id: string;
    title: string;
    description: string | null;
    dueDate: Date | null;
};

export function TaskDetailPanel({ task, onClose }: { task: TaskProps; onClose: () => void }) {
    // Task Details State
    const [title, setTitle] = useState(task.title);
    const [description, setDescription] = useState(task.description ?? "");
    const [dueDate, setDueDate] = useState(task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : "");

    // Chat State
    const [newComment, setNewComment] = useState("");

    const utils = api.useUtils();
    const { user } = useUser();

    // THE LIVE WIRE (WebSockets Listener)
    useEffect(() => {
        const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
            cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
        });

        const channel = pusher.subscribe(`task-${task.id}`);

        channel.bind("new-comment", (data: { triggeredBy: string }) => {
            if (data.triggeredBy !== user?.id) {
                void utils.task.getComments.invalidate({ taskId: task.id });
            }
        });

        return () => {
            pusher.unsubscribe(`task-${task.id}`);
        };
    }, [task.id, user?.id, utils]);

    // Task Details Mutation
    const updateDetails = api.task.updateDetails.useMutation({
        onSuccess: () => {
            void utils.task.getByProjectId.invalidate();
            onClose();
        }
    });

    // Fetch the Chat History
    const { data: comments, isLoading: loadingComments } = api.task.getComments.useQuery({ taskId: task.id });

    // Send a Message
    const addComment = api.task.addComment.useMutation({
        onSuccess: () => {
            setNewComment("");
            void utils.task.getComments.invalidate({ taskId: task.id });
        }
    });

    return (
        <div
            className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm transition-all"
            onClick={onClose}
        >
            {/* CORE SIDEBAR SHELF CONTAINER */}
            <div
                className="flex h-full w-full max-w-md animate-in slide-in-from-right duration-200 flex-col bg-[#050505] border-l border-border shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* TOP HALF: TASK DETAILS BLOCK (Scrollable) */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* DRAWER ACTION HEADER */}
                    <div className="flex items-start justify-between gap-4 border-b border-border/40 pb-4">
                        <div className="flex-1">
                            <textarea
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className="w-full resize-none border-none bg-transparent p-0 text-lg font-bold text-foreground focus:outline-none focus:ring-0 leading-snug tracking-tight"
                                rows={2}
                            />
                            {updateDetails.error && (
                                <p className="text-xs font-mono text-red-400 mt-1 mb-1">
                                    {updateDetails.error.data?.zodError?.fieldErrors?.title?.[0] ?? updateDetails.error.message}
                                </p>
                            )}
                            <span className="text-[10px] font-mono text-muted-foreground block mt-1">
                                NODE_ID: {task.id}
                            </span>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-1 rounded-md text-muted-foreground hover:text-white hover:bg-white/5 transition-colors shrink-0"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    {/* DETAILS FIELD EDITORS */}
                    <div className="space-y-5">
                        <div className="flex flex-col gap-2">
                            <label className="flex items-center gap-2 text-xs font-mono font-medium uppercase tracking-wider text-muted-foreground/60">
                                <Calendar className="h-3.5 w-3.5" />
                                Target Due Date
                            </label>
                            <input
                                type="date"
                                value={dueDate}
                                onChange={(e) => setDueDate(e.target.value)}
                                className="rounded-md border border-border bg-neutral-900/40 px-3 py-2 text-sm text-foreground focus:border-white/20 outline-none transition-all color-scheme-dark"
                            />
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="flex items-center gap-2 text-xs font-mono font-medium uppercase tracking-wider text-muted-foreground/60">
                                <Terminal className="h-3.5 w-3.5" />
                                Context Description
                            </label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Initialize task metrics, scope updates, or structural descriptions..."
                                className="min-h-[140px] resize-none rounded-md border border-border bg-neutral-900/40 p-3 text-sm text-foreground placeholder:text-muted-foreground/30 focus:border-white/20 outline-none transition-all leading-relaxed"
                            />
                        </div>

                        <div className="flex justify-end pt-2">
                            <Button
                                size="sm"
                                disabled={updateDetails.isPending || !title.trim()}
                                onClick={() => updateDetails.mutate({
                                    taskId: task.id, title, description, dueDate: dueDate ? new Date(dueDate) : null
                                })}
                                className="font-medium tracking-tight"
                            >
                                {updateDetails.isPending ? "Syncing..." : "Commit Changes"}
                            </Button>
                        </div>
                    </div>
                </div>

                {/* BOTTOM HALF: COLLABORATION STREAM HUB */}
                <div className="flex h-[380px] flex-col border-t border-border bg-neutral-950/40 p-6">
                    <div className="flex items-center gap-2 mb-4">
                        <MessageSquare className="h-4 w-4 text-muted-foreground/60" />
                        <h3 className="text-xs font-mono font-medium uppercase tracking-wider text-muted-foreground">
                            Activity & Logs
                        </h3>
                    </div>

                    {/* COMMENTS CHAT TIMELINE TRACK */}
                    <div className="flex-1 overflow-y-auto space-y-3 pr-1 scrollbar-thin">
                        {loadingComments ? (
                            <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground/50 animate-pulse py-2">
                                <span>POLLING_HISTORIC_LOGS...</span>
                            </div>
                        ) : comments?.length === 0 ? (
                            <p className="text-xs text-muted-foreground/40 italic py-4 text-center">
                                Timeline unpopulated. Post a coordinate update below.
                            </p>
                        ) : (
                            comments?.map((comment) => (
                                <div
                                    key={comment.id}
                                    className="flex flex-col gap-1.5 rounded-md bg-card border border-border p-3"
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-semibold text-foreground">
                                            {comment.user.name ?? "Unknown Node"}
                                        </span>
                                        <span className="text-[10px] font-mono text-muted-foreground/60">
                                            {new Date(comment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                        {comment.content}
                                    </p>
                                </div>
                            ))
                        )}
                    </div>

                    {/* RAPID MESSAGE DISPATCH FORM */}
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            if (newComment.trim()) addComment.mutate({ taskId: task.id, content: newComment });
                        }}
                        className="mt-4 flex gap-2 items-center"
                    >
                        <input
                            type="text"
                            placeholder="Append transaction message..."
                            value={newComment}
                            onChange={(e) => setNewComment(e.target.value)}
                            className="flex-1 rounded-md border border-border bg-neutral-900/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/30 outline-none focus:border-white/20 transition-all"
                        />
                        <Button
                            type="submit"
                            size="sm"
                            disabled={!newComment.trim() || addComment.isPending}
                            className="h-9 font-medium px-4 tracking-tight"
                        >
                            Log
                        </Button>
                    </form>
                </div>
            </div>
        </div>
    );
}