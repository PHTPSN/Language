const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Validate browser writes, including Next's loopback URL normalization. */
export function hasSameRequestOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  // Non-browser clients need not send Origin. Preserve the existing API contract.
  if (origin === null) return true;

  try {
    const source = new URL(origin);
    const target = new URL(request.url);
    // Origin must contain only an origin, not a path, credentials or opaque value.
    if (source.origin !== origin) return false;
    if (source.origin === target.origin) return true;

    // Next dev may construct request.url with localhost when the browser used
    // 127.0.0.1. Require both ends to be loopback, an identical scheme and port,
    // and the actual Host header to match the browser origin. Never trust an
    // arbitrary forwarded host or relax the rule for a hosted request.
    return LOOPBACK_HOSTS.has(source.hostname)
      && LOOPBACK_HOSTS.has(target.hostname)
      && source.protocol === target.protocol
      && source.port === target.port
      && request.headers.get("host")?.toLowerCase() === source.host;
  } catch {
    return false;
  }
}
