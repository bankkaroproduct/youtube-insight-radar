import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

type LinkPair = { header: string; url: string };

// Decode YouTube redirect: https://www.youtube.com/redirect?q=https%3A%2F%2F...
function decodeYtRedirect(href: string): string {
  try {
    const u = new URL(href, "https://www.youtube.com");
    if (u.hostname.endsWith("youtube.com") && u.pathname === "/redirect") {
      const q = u.searchParams.get("q");
      if (q) return decodeURIComponent(q);
    }
    return href;
  } catch {
    return href;
  }
}

function normalizeUrl(raw: string): string | null {
  if (!raw) return null;
  let s = raw.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = "https://" + s.replace(/^\/+/, "");
  try {
    const u = new URL(s);
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Parse YouTube About-page HTML for the "Links" section.
 * The data lives in the `ytInitialData` JSON blob embedded in the HTML.
 * We grep for objects matching: { channelExternalLinkViewModel: { title: {...}, link: {...} } }
 */
function extractLinksFromHtml(html: string): LinkPair[] {
  const pairs: LinkPair[] = [];
  const seen = new Set<string>();

  // Pattern 1 (newer): channelExternalLinkViewModel
  const re1 =
    /"channelExternalLinkViewModel"\s*:\s*\{[^}]*?"title"\s*:\s*\{[^}]*?"content"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"[^}]*?\}\s*,\s*"link"\s*:\s*\{[^}]*?"content"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re1.exec(html)) !== null) {
    const header = JSON.parse(`"${m[1]}"`);
    const linkText = JSON.parse(`"${m[2]}"`);
    const url = normalizeUrl(linkText);
    if (url) {
      const key = url.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        pairs.push({ header: header.trim() || "Link", url });
      }
    }
  }

  // Pattern 2 (older): channelHeaderLinksRenderer / primaryLinks with title.simpleText + navigationEndpoint.urlEndpoint.url
  const re2 =
    /\{\s*"title"\s*:\s*\{\s*"simpleText"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"\s*\}\s*,\s*"icon"[^}]*?"navigationEndpoint"\s*:\s*\{[^}]*?"urlEndpoint"\s*:\s*\{\s*"url"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g;
  while ((m = re2.exec(html)) !== null) {
    const header = JSON.parse(`"${m[1]}"`);
    const rawHref = JSON.parse(`"${m[2]}"`);
    const decoded = decodeYtRedirect(rawHref);
    const url = normalizeUrl(decoded);
    if (url) {
      const key = url.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        pairs.push({ header: header.trim() || "Link", url });
      }
    }
  }

  return pairs;
}

async function scrapeChannelLinks(channelId: string): Promise<LinkPair[]> {
  // Try /channel/{id}/about first
  const urls = [
    `https://www.youtube.com/channel/${channelId}/about`,
    `https://www.youtube.com/channel/${channelId}`,
  ];
  for (const url of urls) {
    try {
      const resp = await fetch(url, {
        headers: {
          "User-Agent": UA,
          "Accept-Language": "en-US,en;q=0.9",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });
      if (!resp.ok) continue;
      const html = await resp.text();
      const links = extractLinksFromHtml(html);
      if (links.length > 0) return links;
    } catch (_) {
      // try next
    }
  }
  return [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const batchSize: number = Math.min(Math.max(body.batch_size ?? 10, 1), 25);
    const channelIds: string[] | undefined = body.channel_ids;
    const force: boolean = !!body.force;

    let targets: { id: string; channel_id: string }[] = [];
    if (channelIds && channelIds.length > 0) {
      const { data, error } = await supabase
        .from("channels")
        .select("id,channel_id")
        .in("channel_id", channelIds);
      if (error) throw error;
      targets = data ?? [];
    } else {
      let q = supabase
        .from("channels")
        .select("id,channel_id")
        .gt("total_videos_fetched", 0)
        .order("created_at", { ascending: true })
        .limit(batchSize);
      if (!force) q = q.is("custom_links_scraped_at", null);
      const { data, error } = await q;
      if (error) throw error;
      targets = data ?? [];
    }

    const results: { channel_id: string; count: number; error?: string }[] = [];
    for (const t of targets) {
      try {
        const links = await scrapeChannelLinks(t.channel_id);
        const { error: upErr } = await supabase
          .from("channels")
          .update({
            custom_links: links,
            custom_links_scraped_at: new Date().toISOString(),
          })
          .eq("id", t.id);
        if (upErr) throw upErr;
        results.push({ channel_id: t.channel_id, count: links.length });
      } catch (e: any) {
        results.push({ channel_id: t.channel_id, count: 0, error: e?.message ?? String(e) });
      }
      // gentle delay to avoid rate-limit
      await new Promise((r) => setTimeout(r, 250));
    }

    // remaining count (unscraped)
    const { count: remaining } = await supabase
      .from("channels")
      .select("id", { count: "exact", head: true })
      .gt("total_videos_fetched", 0)
      .is("custom_links_scraped_at", null);

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        results,
        remaining: remaining ?? 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ success: false, error: e?.message ?? String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
