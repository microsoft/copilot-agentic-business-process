import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { slides, sources } from "./slides.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const escape = (text) => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const file = (i) => `slide-${String(i + 1).padStart(2, "0")}.html`;
const theme = `<script>
(() => {
  const param = new URLSearchParams(window.location.search).get("scoutTheme");
  const theme = param || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  document.documentElement.setAttribute("data-theme", theme);
})();
</script>`;
const head = (title) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
${theme}<title>${escape(title)}</title><link rel="icon" href="data:,"><link rel="stylesheet" href="base.css"><link rel="stylesheet" href="styles.css"></head>`;
const options = slides.map((s, i) => `<option value="${file(i)}">${String(i + 1).padStart(2, "0")} - ${escape(s.title)}</option>`);
const pendingScreenshots = slides.flatMap((s, i) => s.placeholder ? [i + 1] : []);

if (slides.length !== 23) throw new Error("The approved storyboard requires 18 content slides, 4 section dividers and a closing slide.");
await mkdir(root, { recursive: true });
for (const [i, slide] of slides.entries()) {
  for (const key of slide.sources) {
    if (!sources[key]) throw new Error(`Unknown source ${key} on slide ${i + 1}.`);
  }
  const refs = slide.sources.map((key) => `<li><a href="${sources[key].url}" target="_blank" rel="noopener">${escape(sources[key].title)}</a></li>`).join("");
  const imageFirst = slide.treatment === "showcase" || slide.treatment === "diagram";
  const treatment = slide.hero ? "fy27-hero" : slide.divider ? "fy27-divider" : slide.placeholder || imageFirst ? "fy27-showcase" : slide.treatment === "business" ? "fy27-business" : "fy27-panel";
  await writeFile(join(root, file(i)), `${head(`${i + 1}. ${slide.title}`)}
<body class="viewer">
<header class="toolbar" aria-label="Presentation controls">
  <a class="brand" href="index.html">Agentic business processes <span>HTML review / FY27 style</span></a>
  <nav aria-label="Slide navigation">
    ${i > 0 ? `<a class="nav-button" id="previous" href="${file(i - 1)}" aria-label="Previous slide">&#8592; Previous</a>` : '<span class="nav-button disabled" aria-disabled="true">&#8592; Previous</span>'}
    <label class="sr-only" for="slide-picker">Choose slide</label><select id="slide-picker">${options.map((o, n) => n === i ? o.replace("<option ", "<option selected ") : o).join("")}</select>
    ${i < slides.length - 1 ? `<a class="nav-button" id="next" href="${file(i + 1)}" aria-label="Next slide">Next &#8594;</a>` : '<span class="nav-button disabled" aria-disabled="true">Next &#8594;</span>'}
    <button id="fullscreen" type="button" aria-label="Enter fullscreen">Present</button>
  </nav>
</header>
<main class="stage" aria-label="Slide ${i + 1} of ${slides.length}">
  <div class="slide-frame">
    <article class="slide ${slide.layout || ""} ${treatment}" aria-labelledby="slide-title">
      ${imageFirst ? "" : `<div class="eyebrow"><span>${escape(slide.section)}</span>${slide.placeholder ? "<span>SCREENSHOT PLACEHOLDER</span>" : ""}</div>`}
      ${slide.hero || slide.divider || imageFirst ? "" : `<header class="slide-heading"><h1 id="slide-title">${slide.title}</h1>${slide.subtitle ? `<p>${slide.subtitle}</p>` : ""}</header>`}
      ${slide.hero ? '<div class="fy27-motif" aria-hidden="true"><i></i><i></i><i></i></div>' : ""}<div class="slide-content">${slide.body}</div>
      ${imageFirst ? "" : `<footer class="slide-footer"><span>${escape(slide.footer || "Agentic Business Process Automation on Copilot Studio")}</span><span>${String(i + 1).padStart(2, "0")} / ${slides.length}</span></footer>`}
    </article>
  </div>
</main>
<aside class="review">
  <details><summary>Presenter notes &amp; sources</summary><div class="notes-body"><p>${slide.notes}</p><ul>${refs}</ul></div></details>
  <span>Arrow keys: navigate &nbsp; Home / End: first / last &nbsp; F: present</span>
</aside>
<p id="viewer-error" class="viewer-error" role="alert" hidden></p>
<script src="viewer.js"></script></body></html>`, "utf8");
}

await writeFile(join(root, "index.html"), `${head(`Agentic business processes | ${slides.length}-slide review`)}
<body class="index">
<main class="index-main">
  <p class="index-kicker">PRELIMINARY PRESENTATION / FY27 STYLE</p>
  <h1>From AI agents to<br>accountable agentic business processes.</h1>
  <p class="index-lead">${slides.length} slides for Sellers and Cloud Solution Architects, including four section dividers. Customer value first, then the reusable architecture, a live demo and the path to deployment.</p>
  <a class="start-button" href="slide-01.html">Open presentation &#8594;</a>
  <a class="start-button" href="Agentic-Business-Processes-FY27-Corrected.pptx" download>Download PowerPoint</a>
  <section class="review-info" aria-label="Review status">
    <div><strong>Content</strong><p>Based on the two repository READMEs. Platform harness and consumption guidance cross-checked with Microsoft Learn.</p></div>
    <div><strong>Design</strong><p>Adapted from your FY27 GTM reference: blue-purple-cyan backgrounds, translucent rounded panels, bold headings, white cards and text-left screenshot layouts. Segoe UI substitutes for unavailable Segoe Sans fonts.</p></div>
    <div><strong>Approved for PowerPoint</strong><p>${pendingScreenshots.length ? `Slides ${pendingScreenshots.join(", ")} contain explicitly labeled screenshot placeholders.` : "All four UI screenshots are supplied. No screenshot placeholders remain."} The approved deck includes a final Thank you slide. The repository URL remains a placeholder.</p></div>
  </section>
  <nav class="slide-index" aria-label="All slides">
    ${slides.map((s, i) => `<a class="index-card" href="${file(i)}"><span class="index-number">${String(i + 1).padStart(2, "0")}</span><div><small>${escape(s.section)}</small><h2>${escape(s.title)}</h2>${s.placeholder ? "<span class=\"index-status\">Screenshot pending</span>" : s.closingTemplate ? "<span class=\"index-status\">Closing slide</span>" : s.divider ? "<span class=\"index-status\">Section divider</span>" : ""}</div></a>`).join("")}
  </nav>
  <footer class="index-footer">Open locally in a modern browser. No server, account, external scripts, or network access required for the slides. To update content, edit <a href="slides.mjs">slides.mjs</a>; edit base.css for layout or styles.css for the FY27 theme. Then run <code>node build.mjs</code> in this folder. Notes and source links are outside the slide canvas. <a href="reference-design.json">View extracted design details</a>. Backgrounds and geometric motifs are recreated in CSS, not copied slide artwork.</footer>
</main></body></html>`, "utf8");
console.log(`Built ${slides.length} FY27 slide pages and index.html in ${root}`);
