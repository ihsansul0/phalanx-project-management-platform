import { Webhook } from 'svix';
import { headers } from 'next/headers';
import { type WebhookEvent } from '@clerk/nextjs/server';
import { db } from '~/server/db';
import { users, workspaces } from '~/server/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(req: Request) {
    // 1. Grab the secret from the vault
    const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

    if (!WEBHOOK_SECRET) {
        throw new Error('Please add CLERK_WEBHOOK_SECRET from Clerk Dashboard to .env or .env.local');
    }

    // 2. Get the Next.js headers (Next.js 15 requires awaiting headers)
    const headerPayload = await headers();
    const svix_id = headerPayload.get("svix-id");
    const svix_timestamp = headerPayload.get("svix-timestamp");
    const svix_signature = headerPayload.get("svix-signature");

    // If there are no headers, someone other than Clerk is trying to hit this endpoint
    if (!svix_id || !svix_timestamp || !svix_signature) {
        return new Response('Error occurred -- no svix headers', { status: 400 });
    }

    // 3. Get the body
    const payload = await req.json();
    const body = JSON.stringify(payload);

    // 4. Create a new Svix instance with your secret
    const wh = new Webhook(WEBHOOK_SECRET);

    let evt: WebhookEvent;

    // 5. Verify the payload cryptographically
    try {
        evt = wh.verify(body, {
            "svix-id": svix_id,
            "svix-timestamp": svix_timestamp,
            "svix-signature": svix_signature,
        }) as WebhookEvent;
    } catch (err) {
        console.error('Error verifying webhook:', err);
        return new Response('Error occurred', { status: 400 });
    }

    // 6. THE EVENT ROUTER
    const eventType = evt.type;

    try {
        // EVENT A: A New User Registers
        if (eventType === 'user.created') {
            const { id, email_addresses, first_name, last_name } = evt.data;
            const primaryEmail = email_addresses[0]?.email_address;
            const fullName = [first_name, last_name].filter(Boolean).join(" ");

            if (primaryEmail) {
                await db.insert(users).values({
                    id: id,
                    email: primaryEmail,
                    name: fullName || "New User",
                });
                console.log(`✅ Webhook: Created user ${id}`);
            }
        }

        // EVENT B: A User Updates Their Profile
        if (eventType === 'user.updated') {
            const { id, email_addresses, first_name, last_name } = evt.data;
            const primaryEmail = email_addresses[0]?.email_address;
            const fullName = [first_name, last_name].filter(Boolean).join(" ");

            if (primaryEmail) {
                await db.update(users)
                    .set({
                        email: primaryEmail,
                        name: fullName || "User",
                    })
                    .where(eq(users.id, id));
                console.log(`✅ Webhook: Updated user ${id}`);
            }
        }

        // EVENT C: A User Creates a New Organization/Workspace
        if (eventType === 'organization.created') {
            const { id, name } = evt.data;

            await db.insert(workspaces).values({
                id: id,
                name: name,
            });
            console.log(`✅ Webhook: Created workspace ${id}`);
        }

        // Always return a 200 to tell Clerk the message was received successfully
        return new Response('', { status: 200 });
    } catch (error) {
        console.error("Database Error during Webhook:", error);
        // Returning a 500 tells Clerk to try sending the message again later
        return new Response('Database Error', { status: 500 });
    }
}