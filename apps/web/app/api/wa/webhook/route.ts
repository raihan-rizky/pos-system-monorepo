import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function isAuthorizedWebhook(request: Request) {
  const secret = process.env.WAHA_WEBHOOK_SECRET;
  if (!secret) return false;

  const bearer = request.headers.get("authorization");
  const headerSecret = request.headers.get("x-webhook-secret");

  return bearer === `Bearer ${secret}` || headerSecret === secret;
}

export async function POST(request: Request) {
  try {
    if (!isAuthorizedWebhook(request)) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const payload = await request.json();

    // Broadcast the event using Supabase
    // We must use the anon/service key to create a generic client for backend broadcast
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // WAHA sends { event: "message", payload: { ... } }
    if (payload.event === "message" || payload.event === "message.any") {
      const channel = supabase.channel("waha-webhook");
      
      // Await subscription and send for serverless environment
      await new Promise<void>((resolve) => {
        channel.subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            await channel.send({
              type: "broadcast",
              event: "new-message",
              payload: payload.payload,
            });
            await supabase.removeChannel(channel);
            resolve();
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.error("[WAHA Webhook] Supabase Channel Error:", status);
            await supabase.removeChannel(channel);
            resolve();
          }
        });
        
        // Failsafe timeout
        setTimeout(async () => {
          await supabase.removeChannel(channel);
          resolve();
        }, 3000);
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("WAHA Webhook error:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
