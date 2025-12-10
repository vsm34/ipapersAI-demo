// static/app.js
// Minimal, integration-friendly demo:
// - render static/sample.pdf
// - inline text selection -> highlight popup -> sidebar notes

console.log("app.js loaded");

// ---- pdf.js setup ---------------------------------------------------------

if (typeof pdfjsLib === "undefined") {
  console.error("pdfjsLib is not defined. Check the pdf.js <script> tag in index.html.");
} else {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js";

  window.addEventListener("load", () => {
    console.log("window.load fired");
    initDemo().catch(err => {
      console.error("Error in initDemo:", err);
      const container = document.getElementById("pdf-container");
      if (container) {
        container.textContent = "Error initializing PDF demo: " + err.message;
      }
    });
  });
}

// ---- State ----------------------------------------------------------------

let pdfContainer = null;
let notesList = null;
let tabHighlights = null;
let tabAddNote = null;
let addNoteContainer = null;
let addNoteText = null;
let saveFreeNoteBtn = null;
let cancelFreeNoteBtn = null;

let popup = null;
let colorSelect = null;
let noteTextarea = null;
let pageInput = null;
let cancelHighlightBtn = null;
let saveHighlightBtn = null;

let annotations = [];         // list of { id, color, noteText, snippet, pageNumber }
let currentSelection = null;  // { range, selectedText }

// ---- Init -----------------------------------------------------------------

async function initDemo() {
  grabDomRefs();
  setupTabs();
  setupFreeNoteHandlers();
  setupSelectionHandler();
  await renderPdf("/static/sample.pdf");
}

function grabDomRefs() {
  pdfContainer = document.getElementById("pdf-container");
  notesList = document.getElementById("notes-list");
  tabHighlights = document.getElementById("tab-highlights");
  tabAddNote = document.getElementById("tab-add-note");
  addNoteContainer = document.getElementById("add-note-container");
  addNoteText = document.getElementById("add-note-text");
  saveFreeNoteBtn = document.getElementById("save-free-note");
  cancelFreeNoteBtn = document.getElementById("cancel-free-note");

  popup = document.getElementById("highlight-popup");
  colorSelect = document.getElementById("highlight-color");
  noteTextarea = document.getElementById("highlight-note");
  pageInput = document.getElementById("highlight-page");
  cancelHighlightBtn = document.getElementById("cancel-highlight");
  saveHighlightBtn = document.getElementById("save-highlight");
}

// ---- PDF rendering --------------------------------------------------------

async function renderPdf(url) {
  if (!pdfContainer) throw new Error("#pdf-container not found");
  pdfContainer.innerHTML = "";

  console.log("Loading PDF:", url);
  const pdf = await pdfjsLib.getDocument(url).promise;
  console.log("PDF loaded, pages:", pdf.numPages);

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);

    const unscaledViewport = page.getViewport({ scale: 1 });
    const containerWidth = pdfContainer.clientWidth || 900;
    const maxWidth = Math.min(containerWidth - 40, 900);
    const scale = maxWidth / unscaledViewport.width;
    const viewport = page.getViewport({ scale });

    const pageWrapper = document.createElement("div");
    pageWrapper.className = "pdf-page";
    pageWrapper.dataset.pageNumber = String(pageNumber);

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const textLayerDiv = document.createElement("div");
    textLayerDiv.className = "textLayer";

    pageWrapper.style.width = viewport.width + "px";
    pageWrapper.style.height = viewport.height + "px";

    pageWrapper.appendChild(canvas);
    pageWrapper.appendChild(textLayerDiv);
    pdfContainer.appendChild(pageWrapper);

    // render page bitmap
    await page.render({ canvasContext: ctx, viewport }).promise;

    // render invisible text layer for selection
    const textContent = await page.getTextContent();
    pdfjsLib.renderTextLayer({
      textContent,
      container: textLayerDiv,
      viewport,
      textDivs: []
    });
  }

  console.log("All pages rendered");
}

// ---- Tabs & free-form notes -----------------------------------------------

function setupTabs() {
  if (tabHighlights) {
    tabHighlights.addEventListener("click", () => {
      tabHighlights.classList.add("active");
      if (tabAddNote) tabAddNote.classList.remove("active");
      if (notesList) notesList.style.display = "block";
      if (addNoteContainer) addNoteContainer.style.display = "none";
    });
  }

  if (tabAddNote) {
    tabAddNote.addEventListener("click", () => {
      tabAddNote.classList.add("active");
      if (tabHighlights) tabHighlights.classList.remove("active");
      if (notesList) notesList.style.display = "none";
      if (addNoteContainer) addNoteContainer.style.display = "flex";
      if (addNoteText) addNoteText.focus();
    });
  }
}

function setupFreeNoteHandlers() {
  if (saveFreeNoteBtn) {
    saveFreeNoteBtn.addEventListener("click", () => {
      const text = (addNoteText?.value || "").trim();
      if (!text) return;
      const id = Date.now();
      const annotation = {
        id,
        color: "#eeeeee",
        noteText: text,
        snippet: "",
        pageNumber: null
      };
      annotations.push(annotation);
      renderAnnotationItem(annotation);
      if (addNoteText) addNoteText.value = "";
      if (tabHighlights) tabHighlights.click();
    });
  }

  if (cancelFreeNoteBtn) {
    cancelFreeNoteBtn.addEventListener("click", () => {
      if (addNoteText) addNoteText.value = "";
      if (tabHighlights) tabHighlights.click();
    });
  }
}

// ---- Selection -> highlight popup ----------------------------------------

function setupSelectionHandler() {
  if (!cancelHighlightBtn || !saveHighlightBtn) {
    // popup elements live in HTML; if they're missing, just skip highlighting
    return;
  }

  document.addEventListener("mouseup", event => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const range = selection.getRangeAt(0);
    if (!pdfContainer || !pdfContainer.contains(range.commonAncestorContainer)) {
      return;
    }

    let node = range.commonAncestorContainer;
    if (node.nodeType === Node.TEXT_NODE) {
      node = node.parentElement;
    }
    if (!node || !node.closest(".textLayer")) return;

    const selectedText = selection.toString().trim();
    if (!selectedText) return;

    currentSelection = { range: range.cloneRange(), selectedText };

    // reset popup fields
    if (noteTextarea) noteTextarea.value = "";
    if (pageInput) pageInput.value = "";

    // position popup
    if (popup) {
      popup.style.left = event.clientX + "px";
      popup.style.top = event.clientY + 8 + "px";
      popup.classList.remove("hidden");
    }
  });

  cancelHighlightBtn.addEventListener("click", () => {
    hideHighlightPopup();
  });

  saveHighlightBtn.addEventListener("click", () => {
    if (!currentSelection || !currentSelection.range) return;

    const range = currentSelection.range;
    const selectedText = currentSelection.selectedText;

    const color = colorSelect ? colorSelect.value : "#fff59d";
    const noteText = noteTextarea ? noteTextarea.value.trim() : "";
    const manualPage =
      pageInput && pageInput.value ? parseInt(pageInput.value, 10) : null;

    const span = document.createElement("span");
    span.className = "highlighted";
    span.textContent = selectedText;
    span.style.backgroundColor = color;

    range.deleteContents();
    range.insertNode(span);

    const pageEl = span.closest(".pdf-page");
    const pageNumber = pageEl
      ? Number(pageEl.dataset.pageNumber)
      : manualPage;

    const id = Date.now();
    span.dataset.noteId = String(id);

    const annotation = {
      id,
      color,
      noteText,
      snippet: selectedText,
      pageNumber
    };

    annotations.push(annotation);
    renderAnnotationItem(annotation);

    window.getSelection().removeAllRanges();
    hideHighlightPopup();
  });
}

function hideHighlightPopup() {
  if (popup) popup.classList.add("hidden");
  currentSelection = null;
}

// ---- Sidebar notes rendering ----------------------------------------------

function renderAnnotationItem(annotation) {
  if (!notesList) return;

  const div = document.createElement("div");
  div.className = "note-item";
  div.dataset.noteId = String(annotation.id);

  const colorDot = document.createElement("div");
  colorDot.className = "note-color";
  colorDot.style.backgroundColor = annotation.color;

  const contentWrapper = document.createElement("div");
  contentWrapper.style.flex = "1";

  const primaryLine = document.createElement("div");
  const baseText =
    annotation.noteText && annotation.noteText.trim().length
      ? annotation.noteText.trim()
      : "Note";

  let display = baseText.length > 30 ? baseText.slice(0, 30) + "..." : baseText;
  if (annotation.pageNumber) {
    display += " p. " + annotation.pageNumber;
  }
  primaryLine.textContent = display;
  primaryLine.style.fontWeight = "500";

  let snippetLine = null;
  if (annotation.snippet && annotation.snippet.trim().length) {
    const snipText = annotation.snippet.trim();
    const truncated =
      snipText.length > 50 ? snipText.slice(0, 50) + "..." : snipText;
    snippetLine = document.createElement("div");
    snippetLine.textContent = truncated;
    snippetLine.style.fontSize = "0.85rem";
    snippetLine.style.opacity = "0.7";
    snippetLine.style.marginTop = "0.2rem";
  }

  contentWrapper.appendChild(primaryLine);
  if (snippetLine) contentWrapper.appendChild(snippetLine);

  div.appendChild(colorDot);
  div.appendChild(contentWrapper);

  // click note -> scroll to highlight
  div.addEventListener("click", () => {
    const id = div.dataset.noteId;
    const target = document.querySelector(
      'span.highlighted[data-note-id="' + id + '"]'
    );
    if (!target) return;

    const pageEl = target.closest(".pdf-page");
    if (pageEl) {
      pageEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    target.classList.add("highlight-focus");
    setTimeout(() => target.classList.remove("highlight-focus"), 1000);
  });

  notesList.appendChild(div);
}
