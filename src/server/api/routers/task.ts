import { z } from "zod";
import { eq, and, sql, asc } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { tasks, comments, users } from "~/server/db/schema";
import { pusherServer } from "~/server/pusher";

export const taskRouter = createTRPCRouter({

    // 1. THE READ: Fetch tasks for ONE specific project
    getByProjectId: protectedProcedure
        .input(z.object({ projectId: z.string() }))
        .query(async ({ ctx, input }) => {
            return ctx.db.query.tasks.findMany({
                where: (tasks, { eq, and }) => and(
                    // Rule 1: It must belong to the requested project
                    eq(tasks.projectId, input.projectId),
                    // Rule 2 (SECURITY): It MUST belong to the user's active workspace
                    eq(tasks.workspaceId, ctx.workspaceId)
                ),
                orderBy: (tasks, { desc }) => [desc(tasks.createdAt)],
            });
        }),

    // THE ANALYTICS ENGINE (SQL Aggregations)
    getProjectStats: protectedProcedure
        .input(z.object({ projectId: z.string() }))
        .query(async ({ ctx, input }) => {
            // We ask the database to count the rows, rather than fetching all the data
            const stats = await ctx.db
                .select({
                    totalTasks: sql<number>`count(${tasks.id})::int`,
                    completedTasks: sql<number>`count(${tasks.id}) filter (where ${tasks.status} = 'DONE')::int`,
                })
                .from(tasks)
                .where(
                    and(
                        eq(tasks.projectId, input.projectId),
                        eq(tasks.workspaceId, ctx.workspaceId) // Security Anchor
                    )
                );

            // Drizzle returns an array, but we only expect one row of math
            const result = stats[0] ?? { totalTasks: 0, completedTasks: 0 };

            // Calculate the percentage safely (avoiding dividing by zero)
            const progressPercentage = result.totalTasks > 0
                ? Math.round((result.completedTasks / result.totalTasks) * 100)
                : 0;

            return {
                ...result,
                progressPercentage,
            };
        }),

    // 2. THE WRITE: Create a new task
    create: protectedProcedure
        .input(z.object({
            title: z.string().min(3, "Task title must be at least 3 characters"),
            projectId: z.string()
        }))
        .mutation(async ({ ctx, input }) => {
            if (!ctx.userId) throw new Error("Unauthorized");

            const newId = crypto.randomUUID();

            // Insert into the database
            await ctx.db.insert(tasks).values({
                id: newId,
                title: input.title,
                projectId: input.projectId,
                workspaceId: ctx.workspaceId, // Security Anchor
            });

            // The Live Wire Broadcast
            await pusherServer.trigger(`workspace-${ctx.workspaceId}`, "board-updated", {
                triggeredBy: ctx.userId,
            });

            return { id: newId };
        }),

    // 3. THE STATUS UPDATE: Move a task across the Kanban board
    updateStatus: protectedProcedure
        .input(z.object({
            taskId: z.string(),
            status: z.enum(["TODO", "IN_PROGRESS", "DONE"]),
        }))
        .mutation(async ({ ctx, input }) => {
            if (!ctx.userId) throw new Error("Unauthorized");

            await ctx.db.update(tasks)
                .set({
                    status: input.status,
                    updatedAt: new Date() // Keep our timestamps accurate
                })
                .where(
                    and(
                        // Find the exact task
                        eq(tasks.id, input.taskId),
                        // Security Anchor: NEVER let someone update a task outside their workspace!
                        eq(tasks.workspaceId, ctx.workspaceId)
                    )
                );

            // THE LIVE WIRE: BROADCAST THE BOARD UPDATE
            // We broadcast to the entire workspace!
            await pusherServer.trigger(`workspace-${ctx.workspaceId}`, "board-updated", {
                triggeredBy: ctx.userId,
            });

            return { success: true };
        }),

    // THE DEEP DIVE (Update Details)
    updateDetails: protectedProcedure
        .input(z.object({
            taskId: z.string(),
            title: z.string().min(3, "Task title must be at least 3 characters"),
            description: z.string().nullable().optional(),
            dueDate: z.date().nullable().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            if (!ctx.userId) throw new Error("Unauthorized");

            // Update the database
            await ctx.db.update(tasks)
                .set({
                    title: input.title,
                    description: input.description,
                    dueDate: input.dueDate,
                    updatedAt: new Date()
                })
                .where(
                    and(
                        eq(tasks.id, input.taskId),
                        eq(tasks.workspaceId, ctx.workspaceId) // Security Anchor
                    )
                );

            // The Live Wire Broadcast
            await pusherServer.trigger(`workspace-${ctx.workspaceId}`, "board-updated", {
                triggeredBy: ctx.userId,
            });

            return { success: true };
        }),

    // THE COLLABORATION HUB (Event Stream)
    // 1. Fetch comments and stitch them together with User data
    getComments: protectedProcedure
        .input(z.object({ taskId: z.string() }))
        .query(async ({ ctx, input }) => {
            return await ctx.db
                .select({
                    id: comments.id,
                    content: comments.content,
                    createdAt: comments.createdAt,
                    user: {
                        name: users.name,
                        email: users.email,
                    }
                })
                .from(comments)
                .innerJoin(users, eq(comments.userId, users.id)) // <-- THE SQL JOIN MAGIC
                .where(
                    and(
                        eq(comments.taskId, input.taskId),
                        eq(comments.workspaceId, ctx.workspaceId) // Security Anchor
                    )
                )
                .orderBy(asc(comments.createdAt)); // Oldest at the top, newest at the bottom (like iMessage)
        }),

    // 2. Add a new comment
    addComment: protectedProcedure
        .input(z.object({
            taskId: z.string(),
            content: z.string().min(1)
        }))
        .mutation(async ({ ctx, input }) => {
            if (!ctx.userId) throw new Error("Unauthorized");

            // --- THE ACTUAL COMMENT ---
            // Now that Neon officially knows who this user is (via webhook), safely insert the comment
            await ctx.db.insert(comments).values({
                taskId: input.taskId,
                content: input.content,
                userId: ctx.userId,
                workspaceId: ctx.workspaceId,
            });

            // THE LIVE WIRE: BROADCAST THE EVENT
            // Channel: "task-123", Event: "new-comment"
            await pusherServer.trigger(`task-${input.taskId}`, "new-comment", {
                triggeredBy: ctx.userId, // We send the ID so the frontend knows who yelled
            });

            return { success: true };
        }),

    // THE UPDATE PROTOCOL (Rename Task)
    update: protectedProcedure
        .input(z.object({
            taskId: z.string(),
            title: z.string().min(3, "Task title must be at least 3 characters")
        }))
        .mutation(async ({ ctx, input }) => {
            await ctx.db.update(tasks)
                .set({ title: input.title })
                .where(
                    and(
                        eq(tasks.id, input.taskId),
                        eq(tasks.workspaceId, ctx.workspaceId) // Security Anchor
                    )
                );

            return { success: true };
        }),

    // THE DEMOLITION PROTOCOL (Delete Task)
    delete: protectedProcedure
        .input(z.object({ taskId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            if (!ctx.userId) throw new Error("Unauthorized");

            // 2. Delete from the database
            await ctx.db.delete(tasks)
                .where(
                    and(
                        eq(tasks.id, input.taskId),
                        eq(tasks.workspaceId, ctx.workspaceId) // Security Anchor
                    )
                );

            // 3. The Live Wire Broadcast
            await pusherServer.trigger(`workspace-${ctx.workspaceId}`, "board-updated", {
                triggeredBy: ctx.userId,
            });

            return { success: true };
        }),
});