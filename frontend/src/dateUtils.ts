export function timeAgo(dateString: string | null | undefined): string {
  if (!dateString) return "–";
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000);

  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (seconds < 60) return rtf.format(-seconds, "second");
  
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return rtf.format(-minutes, "minute");
  
  const hours = Math.round(minutes / 60);
  if (hours < 24) return rtf.format(-hours, "hour");
  
  const days = Math.round(hours / 24);
  if (days < 30) return rtf.format(-days, "day");
  
  const months = Math.round(days / 30);
  if (months < 12) return rtf.format(-months, "month");
  
  const years = Math.round(days / 365);
  return rtf.format(-years, "year");
}
