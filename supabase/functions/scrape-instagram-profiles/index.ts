import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2/cors";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const APIFY_TOKEN = Deno.env.get("APIFY_API_TOKEN");
    if (!APIFY_TOKEN) throw new Error("APIFY_API_TOKEN not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const { channel_ids } = body as { channel_ids?: string[] };

    // Get channels with instagram_url
    let query = supabase
      .from("channels")
      .select("id, channel_name, instagram_url")
      .not("instagram_url", "is", null);

    if (channel_ids && channel_ids.length > 0) {
      query = query.in("id", channel_ids);
    }

    const { data: channels, error: chErr } = await query;
    if (chErr) throw chErr;

    if (!channels || channels.length === 0) {
      return new Response(JSON.stringify({ message: "No channels with Instagram URLs found", scraped: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract usernames from URLs
    const channelMap: Record<string, { id: string; name: string }> = {};
    const usernames: string[] = [];

    for (const ch of channels) {
      const url = ch.instagram_url as string;
      // Extract username from various URL formats
      const match = url.match(/(?:instagram\.com|instagr\.am)\/([a-zA-Z0-9_.]+)/i);
      if (match) {
        const username = match[1].toLowerCase();
        if (!["p", "reel", "stories", "explore", "accounts"].includes(username)) {
          channelMap[username] = { id: ch.id, name: ch.channel_name };
          usernames.push(username);
        }
      }
    }

    if (usernames.length === 0) {
      return new Response(JSON.stringify({ message: "No valid Instagram usernames extracted", scraped: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Filter out recently scraped (within 7 days)
    const { data: existing } = await supabase
      .from("instagram_profiles")
      .select("instagram_username, scraped_at")
      .in("instagram_username", usernames);

    const recentlyScraped = new Set(
      (existing || [])
        .filter(p => {
          const scraped = new Date(p.scraped_at);
          const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          return scraped > weekAgo;
        })
        .map(p => p.instagram_username)
    );

    const toScrape = usernames.filter(u => !recentlyScraped.has(u));

    if (toScrape.length === 0) {
      return new Response(JSON.stringify({ message: "All profiles were scraped within the last 7 days", scraped: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Batch into groups of 10
    let totalScraped = 0;
    for (let i = 0; i < toScrape.length; i += 10) {
      const batch = toScrape.slice(i, i + 10);

      // Start Apify run
      const startRes = await fetch(
        `https://api.apify.com/v2/acts/apify~instagram-profile-scraper/runs?token=${APIFY_TOKEN}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            usernames: batch,
            resultsLimit: 12,
          }),
        }
      );

      if (!startRes.ok) {
        const errText = await startRes.text();
        console.error(`Apify start failed: ${startRes.status} ${errText}`);
        continue;
      }

      const runData = await startRes.json();
      const runId = runData.data?.id;
      if (!runId) {
        console.error("No run ID returned from Apify");
        continue;
      }

      // Poll for completion (max 5 minutes)
      let status = "RUNNING";
      const maxWait = 300_000;
      const start = Date.now();

      while (status === "RUNNING" || status === "READY") {
        if (Date.now() - start > maxWait) {
          console.error(`Apify run ${runId} timed out`);
          break;
        }
        await new Promise(r => setTimeout(r, 5000));

        const statusRes = await fetch(
          `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`
        );
        const statusData = await statusRes.json();
        status = statusData.data?.status || "FAILED";
      }

      if (status !== "SUCCEEDED") {
        console.error(`Apify run ${runId} ended with status: ${status}`);
        continue;
      }

      // Fetch results
      const datasetId = runData.data?.defaultDatasetId;
      const resultsRes = await fetch(
        `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}`
      );
      const results = await resultsRes.json();

      // Process and upsert each profile
      for (const profile of results) {
        const username = (profile.username || "").toLowerCase();
        const channelInfo = channelMap[username];
        if (!channelInfo) continue;

        const recentPosts = (profile.latestPosts || []).slice(0, 12).map((p: any) => ({
          url: p.url || p.shortCode ? `https://www.instagram.com/p/${p.shortCode}/` : "",
          caption: (p.caption || "").substring(0, 500),
          likes: p.likesCount || 0,
          comments: p.commentsCount || 0,
          timestamp: p.timestamp || p.takenAtTimestamp || null,
          type: p.type || "Image",
        }));

        const profileData = {
          channel_id: channelInfo.id,
          instagram_username: username,
          full_name: profile.fullName || null,
          bio: profile.biography || null,
          profile_pic_url: profile.profilePicUrl || profile.profilePicUrlHD || null,
          follower_count: profile.followersCount || 0,
          following_count: profile.followsCount || 0,
          post_count: profile.postsCount || 0,
          is_business: profile.isBusinessAccount || false,
          business_category: profile.businessCategoryName || null,
          contact_email: profile.businessEmail || profile.contactPhoneNumber ? null : null,
          contact_phone: profile.businessPhoneNumber || null,
          external_url: profile.externalUrl || null,
          recent_posts: recentPosts,
          scraped_at: new Date().toISOString(),
        };

        // Extract email from bio or business info
        if (profile.businessEmail) {
          profileData.contact_email = profile.businessEmail;
        }

        const { error: upsertErr } = await supabase
          .from("instagram_profiles")
          .upsert(profileData, { onConflict: "channel_id" });

        if (upsertErr) {
          console.error(`Failed to upsert profile for ${username}:`, upsertErr);
          continue;
        }

        // Update channel contact_email if empty and we found one
        if (profileData.contact_email) {
          const { data: ch } = await supabase
            .from("channels")
            .select("contact_email")
            .eq("id", channelInfo.id)
            .single();

          if (ch && !ch.contact_email) {
            await supabase
              .from("channels")
              .update({ contact_email: profileData.contact_email })
              .eq("id", channelInfo.id);
          }
        }

        totalScraped++;
      }
    }

    return new Response(
      JSON.stringify({ message: `Scraped ${totalScraped} Instagram profiles`, scraped: totalScraped }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
