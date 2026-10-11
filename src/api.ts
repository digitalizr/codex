let activeMemberId = '';
export function setActiveMemberId(id: string) {
  activeMemberId = id;
}
export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(activeMemberId ? { 'X-Member-Id': activeMemberId } : {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data as T;
}
export function formatQuantity(value: number) {
  return String(Number(value.toFixed(6)));
}
export function today() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' });
}
export function daysUntil(date: string | null) {
  if (!date) return null;
  return Math.round(
    (new Date(date + 'T12:00:00').getTime() - new Date(today() + 'T12:00:00').getTime()) / 86400000,
  );
}
export function prettyDate(date: string | null) {
  if (!date) return 'Not scheduled';
  return new Date(date + 'T12:00:00').toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
}
