const UNSHORTEN_KEY = import.meta.env.VITE_UNSHORTEN_API_KEY;

const SHORT_DOMAINS = [
  "bit.ly", "fkrt.it", "wsli.nk", "t.co",
  "tiny.cc", "tinyurl.com", "ow.ly", "buff.ly",
  "short.io", "rb.gy", "cutt.ly", "goo.gl", "amzn.to",
  "adf.ly", "bl.ink", "lnkd.in", "shorturl.at",
  "link.ck.page", "clk.ink", "is.gd",
];

export function isShortUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace("www.", "");
    return SHORT_DOMAINS.includes(hostname);
  } catch {
    return false;
  }
}

export async function unshortenUrl(shortUrl: string): Promise<{
  unshortenedUrl: string;
  success: boolean;
  error?: string;
}> {
  if (!UNSHORTEN_KEY) {
    console.warn("VITE_UNSHORTEN_API_KEY is missing — URL unshortening disabled");
    return { unshortenedUrl: shortUrl, success: false, error: "No API key" };
  }

  try {
    const res = await fetch(
      `https://unshorten.me/api/v2/unshorten?url=${encodeURIComponent(shortUrl)}`,
      {
        headers: {
          Authorization: `Token ${UNSHORTEN_KEY}`,
        },
      }
    );

    if (res.status === 401) {
      return { unshortenedUrl: shortUrl, success: false, error: "Invalid API key" };
    }

    if (res.status === 429) {
      return { unshortenedUrl: shortUrl, success: false, error: "Rate limit reached — try later" };
    }

    const data = await res.json();

    if (data.success && data.unshortened_url) {
      return { unshortenedUrl: data.unshortened_url, success: true };
    }

    return { unshortenedUrl: shortUrl, success: false, error: "Could not resolve URL" };
  } catch {
    return { unshortenedUrl: shortUrl, success: false, error: "Network error" };
  }
}

export async function unshortenMany(
  urls: string[]
): Promise<{ original: string; resolved: string; success: boolean }[]> {
  const results = await Promise.all(
    urls.map(async (url) => {
      const result = await unshortenUrl(url);
      return {
        original: url,
        resolved: result.unshortenedUrl,
        success: result.success,
      };
    })
  );
  return results;
}
