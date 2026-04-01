import { formatMessageTime, formatRelativeDate } from '../lib/format-time';

describe('formatMessageTime', () => {
  it('formats a morning time', () => {
    const result = formatMessageTime('2025-06-15T09:05:00Z');
    // toLocaleTimeString output varies by env, just check it contains digits and colon
    expect(result).toMatch(/\d{1,2}:\d{2}/);
  });

  it('formats an afternoon time', () => {
    const result = formatMessageTime('2025-06-15T14:30:00Z');
    expect(result).toMatch(/\d{1,2}:\d{2}/);
  });
});

describe('formatRelativeDate', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-06-15T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns "Just now" for less than 1 minute ago', () => {
    expect(formatRelativeDate('2025-06-15T11:59:30Z')).toBe('Just now');
  });

  it('returns "Xm ago" for 1-59 minutes ago', () => {
    expect(formatRelativeDate('2025-06-15T11:55:00Z')).toBe('5m ago');
  });

  it('returns "Xh ago" for 1-23 hours ago', () => {
    expect(formatRelativeDate('2025-06-15T09:00:00Z')).toBe('3h ago');
  });

  it('returns "Yesterday" for a timestamp from yesterday (>24h ago)', () => {
    // Must be >24h ago to pass the diffHr < 24 check, but still yesterday's date
    expect(formatRelativeDate('2025-06-14T10:00:00Z')).toBe('Yesterday');
  });

  it('returns short weekday for 2-6 days ago', () => {
    const result = formatRelativeDate('2025-06-12T12:00:00Z');
    // Should be a short weekday like "Thu"
    expect(result).toMatch(/^[A-Z][a-z]{2}$/);
  });

  it('returns "Mon dd" format for 7+ days ago', () => {
    const result = formatRelativeDate('2025-06-01T12:00:00Z');
    // Should be like "Jun 1" or "Jun 01"
    expect(result).toMatch(/[A-Z][a-z]{2}\s+\d{1,2}/);
  });

  it('60 minutes ago returns "1h ago", not "60m ago"', () => {
    expect(formatRelativeDate('2025-06-15T11:00:00Z')).toBe('1h ago');
  });
});
