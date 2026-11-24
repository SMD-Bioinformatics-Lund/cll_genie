"use strict";

const downloadButton = document.getElementById("download-report");
const reportPreview = document.getElementById("report-preview");

downloadButton.addEventListener("click", () => {
  const html = reportPreview.getAttribute("srcdoc");
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = downloadButton.dataset.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
