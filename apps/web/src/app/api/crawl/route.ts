import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import * as cheerio from "cheerio";

export const runtime = "nodejs";

const MAX_HTML_BYTES = 1_000_000;
const MAX_TEXT_CHARS = 12_000;
const MAX_LINKS = 20;
const FETCH_TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 3;

type CrawlRequest = {
  url?: unknown;
};

export async function POST(request: Request) {
  let payload: CrawlRequest;
  try {
    payload = (await request.json()) as CrawlRequest;
  } catch {
    return Response.json({ error: "Expected a JSON body with a url field." }, { status: 400 });
  }

  const url = parseCrawlUrl(payload.url);
  if (!url) {
    return Response.json(
      { error: "url must be a valid public http or https URL on the default port." },
      { status: 400 }
    );
  }

  try {
    await assertPublicHostname(url);
    const finalUrl = await resolveRedirects(url);
    const html = await fetchHtml(finalUrl);
    const $ = cheerio.load(html);
    $("script, style, noscript, svg, canvas, iframe").remove();

    const title = normalizeWhitespace($("title").first().text());
    const description = normalizeWhitespace(
      $('meta[name="description"], meta[property="og:description"]').first().attr("content") ?? ""
    );
    const headings = $("h1, h2")
      .slice(0, 12)
      .map((_, element) => normalizeWhitespace($(element).text()))
      .get()
      .filter(Boolean);
    const links = $("a[href]")
      .slice(0, MAX_LINKS)
      .map((_, element) => {
        const href = $(element).attr("href");
        if (!href) {
          return undefined;
        }
        const linkedUrl = parseCrawlUrl(new URL(href, finalUrl).toString());
        if (!linkedUrl) {
          return undefined;
        }
        return {
          text: normalizeWhitespace($(element).text()).slice(0, 140),
          url: linkedUrl.toString()
        };
      })
      .get()
      .filter((link): link is { text: string; url: string } => Boolean(link));

    return Response.json({
      url: finalUrl.toString(),
      title,
      description,
      headings,
      text: normalizeWhitespace($("body").text()).slice(0, MAX_TEXT_CHARS),
      links
    });
  } catch (error) {
    return Response.json(
      {
        error: "Could not crawl URL.",
        detail: error instanceof Error ? error.message : String(error)
      },
      { status: 502 }
    );
  }
}

function parseCrawlUrl(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return undefined;
    }
    if (url.username || url.password) {
      return undefined;
    }
    if (url.port && !isDefaultPort(url)) {
      return undefined;
    }
    return url;
  } catch {
    return undefined;
  }
}

function isDefaultPort(url: URL) {
  return (url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443");
}

async function resolveRedirects(url: URL) {
  let nextUrl = url;
  for (let redirectCount = 0; redirectCount < MAX_REDIRECTS; redirectCount += 1) {
    await assertPublicHostname(nextUrl);
    const response = await fetch(nextUrl, { method: "HEAD", redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return nextUrl;
    }

    const location = response.headers.get("location");
    if (!location) {
      return nextUrl;
    }

    const redirectedUrl = parseCrawlUrl(new URL(location, nextUrl).toString());
    if (!redirectedUrl) {
      throw new Error("Redirect target is not an allowed public URL.");
    }
    nextUrl = redirectedUrl;
  }

  throw new Error("Too many redirects.");
}

async function assertPublicHostname(url: URL) {
  if (url.hostname === "localhost" || url.hostname.endsWith(".localhost")) {
    throw new Error("Localhost URLs are not allowed.");
  }

  const addresses = isIP(url.hostname)
    ? [{ address: url.hostname }]
    : await lookup(url.hostname, { all: true, verbatim: true });

  if (!addresses.length || addresses.some(({ address }) => !isPublicIp(address))) {
    throw new Error("URL resolves to a private or unsupported IP address.");
  }
}

function isPublicIp(address: string) {
  if (address.includes(":")) {
    return isPublicIpv6(address);
  }
  return isPublicIpv4(address);
}

function isPublicIpv4(address: string) {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet))) {
    return false;
  }

  const [a, b] = octets;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPublicIpv6(address: string) {
  const normalized = address.toLowerCase();
  return !(
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  );
}

async function fetchHtml(url: URL) {
  await assertPublicHostname(url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "GoogleRealtimeAudioDemo/1.0"
      },
      redirect: "error",
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType && !contentType.includes("text/html")) {
      throw new Error(`Unsupported content type: ${contentType}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      return response.text();
    }

    const chunks: Uint8Array[] = [];
    let bytesRead = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      bytesRead += value.byteLength;
      if (bytesRead > MAX_HTML_BYTES) {
        throw new Error("Response is larger than the 1 MB crawl limit.");
      }
      chunks.push(value);
    }

    return new TextDecoder().decode(Buffer.concat(chunks));
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
