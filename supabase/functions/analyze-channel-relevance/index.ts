import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ChannelInput {
  id: string;
  channel_name: string;
  description: string | null;
  youtube_category: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth guard: require service role key or valid admin JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    if (token !== serviceKey) {
      const tmpClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: claims, error: claimsErr } = await tmpClient.auth.getClaims(token);
      if (claimsErr || !claims?.claims) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const adminCheck = createClient(supabaseUrl, serviceKey);
      const userId = claims.claims.sub as string;
      const { data: hasAdmin } = await adminCheck.rpc("has_role", { _user_id: userId, _role: "admin" });
      const { data: hasSuperAdmin } = await adminCheck.rpc("has_role", { _user_id: userId, _role: "super_admin" });
      if (!hasAdmin && !hasSuperAdmin) {
        return new Response(JSON.stringify({ error: "Forbidden: admin only" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(supabaseUrl, serviceKey);

    const { channel_ids } = await req.json();

    let query = supabase
      .from("channels")
      .select("id, channel_name, description, youtube_category")
      .is("is_relevant", null);

    if (channel_ids && channel_ids.length > 0) {
      query = supabase
        .from("channels")
        .select("id, channel_name, description, youtube_category")
        .in("id", channel_ids);
    }

    const { data: channels, error: fetchError } = await query.limit(50);
    if (fetchError) throw fetchError;
    if (!channels || channels.length === 0) {
      return new Response(
        JSON.stringify({ message: "No channels to analyze", analyzed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const batchSize = 20;
    let totalAnalyzed = 0;

    for (let i = 0; i < channels.length; i += batchSize) {
      const batch = channels.slice(i, i + batchSize);

      const channelList = batch
        .map(
          (ch: ChannelInput, idx: number) =>
            `${idx + 1}. "${ch.channel_name}" | Category: ${ch.youtube_category || "Unknown"} | Description: ${(ch.description || "No description").slice(0, 300)}`
        )
        .join("\n");

      const response = await fetch(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "system",
                content: `You are an affiliate marketing analyst for Flipkart and Wishlink in India. Evaluate YouTube channels for affiliate marketing relevance. A channel is relevant if it does product reviews, unboxing, buying guides, comparisons, hauls, deals/offers, or promotes any shoppable products across ANY category (tech, fashion, beauty, home, kitchen, fitness, appliances, etc). Entertainment-only, gaming, music, vlogs without product content, news, and educational channels are NOT relevant.`,
              },
              {
                role: "user",
                content: `Evaluate these ${batch.length} YouTube channels for Flipkart/Wishlink affiliate marketing relevance:\n\n${channelList}`,
              },
            ],
            tools: [
              {
                type: "function",
                function: {
                  name: "evaluate_channels",
                  description: "Return relevance evaluation for each channel",
                  parameters: {
                    type: "object",
                    properties: {
                      results: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            index: { type: "integer", description: "1-based index of the channel" },
                            is_relevant: { type: "boolean", description: "true if useful for Flipkart/Wishlink affiliate marketing" },
                            reasoning: { type: "string", description: "One-line explanation" },
                          },
                          required: ["index", "is_relevant", "reasoning"],
                          additionalProperties: false,
                        },
                      },
                    },
                    required: ["results"],
                    additionalProperties: false,
                  },
                },
              },
            ],
            tool_choice: {
              type: "function",
              function: { name: "evaluate_channels" },
            },
          }),
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        console.error("AI gateway error:", response.status, errText);
        if (response.status === 429) {
          return new Response(
            JSON.stringify({ error: "Rate limited, try again later", analyzed: totalAnalyzed }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        throw new Error(`AI gateway error: ${response.status}`);
      }

      const aiData = await response.json();
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall) {
        console.error("No tool call in response");
        continue;
      }

      let results;
      try {
        results = JSON.parse(toolCall.function.arguments).results;
      } catch {
        console.error("Failed to parse AI response");
        continue;
      }

      // Batch update all channels in this batch via Promise.all
      const now = new Date().toISOString();
      await Promise.all(
        results.map((result: any) => {
          const channel = batch[result.index - 1];
          if (!channel) return Promise.resolve();
          return supabase
            .from("channels")
            .update({
              is_relevant: result.is_relevant,
              relevance_reasoning: result.reasoning,
              last_relevance_check_at: now,
            })
            .eq("id", channel.id);
        })
      );

      totalAnalyzed += results.length;
    }

    return new Response(
      JSON.stringify({ message: "Analysis complete", analyzed: totalAnalyzed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
