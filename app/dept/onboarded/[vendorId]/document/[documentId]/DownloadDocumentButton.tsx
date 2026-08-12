"use client";

export default function DownloadDocumentButton({ filename, text }: { filename: string; text: string }) {
  function handleDownload() {
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button type="button" className="btn sm primary" onClick={handleDownload}>
      Download
    </button>
  );
}
