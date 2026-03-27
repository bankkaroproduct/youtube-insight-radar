import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { keywords } = await req.json();
    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) throw new Error("Keywords array required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const keywordList = keywords.map((k: { id: string; keyword: string }) => k.keyword).join(", ");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a market research analyst specializing in the Indian digital market. Classify keywords by their estimated monthly search volume on YouTube India." },
          { role: "user", content: `Classify these keywords into priority tiers (P1=highest volume to P5=lowest): ${keywordList}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "classify_keywords",
            description: "Classify keywords into priority tiers based on estimated Indian market YouTube search volume",
            parameters: {
              type: "object",
              properties: {
                classifications: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      keyword: { type: "string" },
                      priority: { type: "string", enum: ["P1", "P2", "P3", "P4", "P5"] },
                      estimated_volume: { type: "string", description: "e.g. '50K+', '25K-50K', '10K-25K', '5K-10K', '<5K'" },
                      reasoning: { type: "string" },
                    },
                    required: ["keyword", "priority", "estimated_volume", "reasoning"],
                  },
                },
              },
              required: ["classifications"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "classify_keywords" } },
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      throw new Error(`AI gateway error: ${response.status} ${t}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in response");

    const result = JSON.parse(toolCall.function.arguments);
    const classifications = result.classifications;

    // Update database
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    for (const cls of classifications) {
      const match = keywords.find((k: { keyword: string }) => k.keyword.toLowerCase() === cls.keyword.toLowerCase());
      if (match) {
        await supabase.from("keywords_search_runs").update({
          priority: cls.priority,
          estimated_volume: cls.estimated_volume,
          last_priority_fetch_at: new Date().toISOString(),
        }).eq("id", match.id);
      }
    }

    return new Response(JSON.stringify({ success: true, classifications }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
