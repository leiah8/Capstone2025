/** Format a timestamp as "h:mm AM/PM" for chat message display */
export function formatMessageTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Format a timestamp as a relative date for match list display */
export function formatRelativeDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';

  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });

  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
