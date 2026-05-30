// Browser file-download helper. Centralized so we don't sprinkle
// anchor + URL.createObjectURL boilerplate across the app.

export function downloadJSON(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // revoke a tick later so Safari/Firefox finish the download
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
