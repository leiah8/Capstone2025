import "jsr:@supabase/functions-js/edge-runtime.d.ts";

declare const Deno: {
  env: {
    get: (key: string) => string | undefined;
  };
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

const upstreamBaseUrl = (Deno.env.get("MATCHING_API_BASE_URL") ?? "").replace(/\/$/, "");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!upstreamBaseUrl) {
    return jsonResponse(
      { error: "Server misconfigured: MATCHING_API_BASE_URL is not set." },
      500,
    );
  }

  const incomingUrl = new URL(req.url);
  const normalizedPath = incomingUrl.pathname.replace(/\/+$/, "");

  let routePath = "";
  if (normalizedPath.endsWith("/match/score")) {
    routePath = "/match/score";
  } else if (normalizedPath.endsWith("/match/health")) {
    routePath = "/match/health";
  }

  if (!routePath) {
    return jsonResponse(
      { error: "Unsupported route. Use /match/score or /match/health." },
      404,
    );
  }

  try {
    const upstreamUrl = `${upstreamBaseUrl}${routePath}`;
    const headers = new Headers();

    const contentType = req.headers.get("content-type");
    if (contentType) {
      headers.set("content-type", contentType);
    }

    const init: RequestInit = {
      method: req.method,
      headers,
    };

    if (req.method !== "GET" && req.method !== "HEAD") {
      init.body = await req.arrayBuffer();
    }

    const upstreamResp = await fetch(upstreamUrl, init);
    const responseBody = await upstreamResp.arrayBuffer();

    return new Response(responseBody, {
      status: upstreamResp.status,
      headers: {
        "Content-Type": upstreamResp.headers.get("content-type") ?? "application/json",
        ...corsHeaders,
      },
    });
  } catch (error) {
    return jsonResponse(
      {
        error: "Failed to reach matching API upstream.",
        detail: error instanceof Error ? error.message : String(error),
      },
      502,
    );
  }
});
