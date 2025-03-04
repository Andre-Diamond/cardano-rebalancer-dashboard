// ../lib/apiRequest.ts

export async function apiRequest<T>(url: string, options: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error("Network response was not ok");
  return res.json();
}
