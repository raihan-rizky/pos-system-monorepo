import { NextResponse } from "next/server";
import { db } from "@pos/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Query to get the latest message for each phone number
    const contacts = await db.$queryRaw`
      SELECT id, phone, role, content, created_at, image_url
      FROM (
        SELECT *,
               ROW_NUMBER() OVER(PARTITION BY phone ORDER BY created_at DESC) as rn
        FROM chat_messages_teladan
      ) t
      WHERE t.rn = 1
      ORDER BY created_at DESC
    `;

    // Handle BigInt serialization
    const serialized = JSON.parse(
      JSON.stringify(contacts, (key, value) =>
        typeof value === "bigint" ? value.toString() : value
      )
    );

    return NextResponse.json({ data: serialized });
  } catch (error) {
    console.error("Failed to fetch WA contacts:", error);
    return NextResponse.json({ message: "Failed to fetch WA contacts" }, { status: 500 });
  }
}
