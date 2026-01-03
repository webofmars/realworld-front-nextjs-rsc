/**
 * Request logger using Combined Log Format (Apache/nginx standard)
 * Format: %h %l %u %t "%r" %>s %b "%{Referer}i" "%{User-agent}i"
 * Example: 127.0.0.1 - user [10/Oct/2000:13:55:36 -0700] "GET /path HTTP/1.1" 200 2326 "http://example.com" "Mozilla/5.0"
 */

export interface LogEntry {
  ip: string;
  method: string;
  url: string;
  protocol: string;
  status: number;
  userAgent: string;
  referer: string;
  timestamp: Date;
  user?: string;
}

/**
 * Format date in Combined Log Format
 * Example: 10/Oct/2000:13:55:36 -0700
 */
function formatLogDate(date: Date): string {
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  const day = String(date.getDate()).padStart(2, "0");
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  // Get timezone offset
  const offset = -date.getTimezoneOffset();
  const offsetHours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0");
  const offsetMinutes = String(Math.abs(offset) % 60).padStart(2, "0");
  const offsetSign = offset >= 0 ? "+" : "-";

  return `${day}/${month}/${year}:${hours}:${minutes}:${seconds} ${offsetSign}${offsetHours}${offsetMinutes}`;
}

/**
 * Format log entry in Combined Log Format
 */
export function formatLogEntry(entry: LogEntry): string {
  const {
    ip,
    method,
    url,
    protocol,
    status,
    userAgent,
    referer,
    timestamp,
    user,
  } = entry;

  // %h - Remote host (IP address)
  const remoteHost = ip || "-";

  // %l - Remote logname (always -)
  const remoteLogname = "-";

  // %u - Remote user (from auth)
  const remoteUser = user || "-";

  // %t - Timestamp
  const time = `[${formatLogDate(timestamp)}]`;

  // "%r" - Request line
  const requestLine = `"${method} ${url} ${protocol}"`;

  // %>s - Status code
  const statusCode = status;

  // %b - Size of response (we don't have this in middleware, use -)
  const size = "-";

  // "%{Referer}i" - Referer header
  const refererHeader = referer ? `"${referer}"` : '"-"';

  // "%{User-agent}i" - User agent
  const userAgentHeader = userAgent ? `"${userAgent}"` : '"-"';

  return `${remoteHost} ${remoteLogname} ${remoteUser} ${time} ${requestLine} ${statusCode} ${size} ${refererHeader} ${userAgentHeader}`;
}

/**
 * Log request to console (can be extended to write to file)
 */
export function logRequest(entry: LogEntry): void {
  const logLine = formatLogEntry(entry);
  console.log(logLine);
}
