import { NextResponse } from "next/server";
import { db } from "@pos/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const phone = searchParams.get("phone");
    
    if (!phone) {
      return NextResponse.json({ message: "Phone parameter is required" }, { status: 400 });
    }

    const messages = await db.chat_messages_teladan.findMany({
      where: { phone },
      orderBy: { created_at: "asc" },
      take: 200, // limit to last 200 messages to prevent huge payloads
    });

    const serialized = JSON.parse(
      JSON.stringify(messages, (key, value) =>
        typeof value === "bigint" ? value.toString() : value
      )
    );

    return NextResponse.json({ data: serialized });
  } catch (error) {
    console.error("Failed to fetch WA messages:", error);
    return NextResponse.json({ message: "Failed to fetch WA messages" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { phone, content } = await request.json();
    
    if (!phone || !content) {
      return NextResponse.json({ message: "Phone and content are required" }, { status: 400 });
    }

    const waToken = process.env.WHATSAPP_TOKEN;
    const waPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    // Send message via WhatsApp Cloud API if credentials are configured
    if (waToken && waPhoneNumberId) {
      // WhatsApp Cloud API requires phone in international format without + or spaces
      const sanitizedPhone = phone.replace(/[^0-9]/g, "");

      const waPayload = {
        messaging_product: "whatsapp",
        to: sanitizedPhone,
        type: "text",
        text: { body: content },
      };

      console.log("Sending WA message:", { to: sanitizedPhone, contentLength: content.length });

      const waRes = await fetch(
        `https://graph.facebook.com/v21.0/${waPhoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${waToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(waPayload),
        }
      );

      const waResponseBody = await waRes.json();

      if (!waRes.ok) {
        console.error("WhatsApp API error:", JSON.stringify(waResponseBody, null, 2));
        return NextResponse.json(
          { message: waResponseBody.error?.message || "Failed to send WhatsApp message" },
          { status: waRes.status }
        );
      }

      console.log("WhatsApp API success:", JSON.stringify(waResponseBody));
    } else {
      console.warn("WhatsApp credentials not configured, skipping WA send");
    }

    // Save to database regardless
    const message = await db.chat_messages_teladan.create({
      data: {
        phone,
        role: "assistant",
        content,
      },
    });

    const serialized = JSON.parse(
      JSON.stringify(message, (key, value) =>
        typeof value === "bigint" ? value.toString() : value
      )
    );

    return NextResponse.json({ data: serialized }, { status: 201 });
  } catch (error) {
    console.error("Failed to send WA message:", error);
    return NextResponse.json({ message: "Failed to send WA message" }, { status: 500 });
  }
}
