import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Server-only. Never import this module from client components.
// DATABASE_URL must point at the Supabase (or other) Postgres instance and
// is only ever read on the server - it is not exposed to the browser.
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local and fill it in."
  );
}

const client = postgres(connectionString, { max: 1 });

export const db = drizzle(client, { schema });
