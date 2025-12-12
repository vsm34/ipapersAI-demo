console.log("app.js loaded");


if (typeof pdfjsLib !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js";
}

const PDF_URL = "/static/sample.pdf";

let pdfDoc = null;
let annotations = [];

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

let currentSelection = null;

window.addEventListener("load", () => {
  console.log("window.load fired");
  initDemo().catch((err) => {
    console.error("Error initializing demo:", err);
  });
});

async function initDemo() {
  cacheDomElements();
  setupTabs();
  setupFreeNoteHandlers();
  setupSelectionHandler();

  if (!pdfjsLib) {
    console.error("pdfjsLib not available; cannot render PDF.");
    return;
  }

  const loadingTask = pdfjsLib.getDocument(PDF_URL);
  pdfDoc = await loadingTask.promise;
  console.log("Loading PDF:", PDF_URL);

  await renderAllPages();
}

function cacheDomElements() {
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



async function renderAllPages() {
  if (!pdfDoc || !pdfContainer) return;

  pdfContainer.innerHTML = "";

  const numPages = pdfDoc.numPages;
  console.log("PDF loaded, pages:", numPages);

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);

    const viewport = page.getViewport({ scale: 1.2 });

    const pageWrapper = document.createElement("div");
    pageWrapper.className = "pdf-page";
    pageWrapper.dataset.pageNumber = String(pageNum);

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const textLayerDiv = document.createElement("div");
    textLayerDiv.className = "textLayer";

    pageWrapper.appendChild(canvas);
    pageWrapper.appendChild(textLayerDiv);
    pdfContainer.appendChild(pageWrapper);

    await page.render({ canvasContext: ctx, viewport }).promise;

    const textContent = await page.getTextContent();
    pdfjsLib.renderTextLayer({
      textContent,
      container: textLayerDiv,
      viewport,
      textDivs: [],
    });
  }

  console.log("All pages rendered");
}



function setupTabs() {
  if (tabHighlights) {
    tabHighlights.addEventListener("click", () => {
      tabHighlights.classList.add("active");
      if (tabAddNote) tabAddNote.classList.remove("active");
      if (addNoteContainer) addNoteContainer.style.display = "none";
      if (notesList) notesList.style.display = "block";
    });
  }

  if (tabAddNote) {
    tabAddNote.addEventListener("click", () => {
      tabAddNote.classList.add("active");
      if (tabHighlights) tabHighlights.classList.remove("active");
      if (notesList) notesList.style.display = "none";
      if (addNoteContainer) addNoteContainer.style.display = "block";
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
        pageNumber: null,
      };
      annotations.push(annotation);
      renderAnnotationsList();

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



function setupSelectionHandler() {
  if (!popup || !cancelHighlightBtn || !saveHighlightBtn) {
    console.warn("Highlight popup elements missing; selection disabled.");
    return;
  }

  document.addEventListener("mouseup", (event) => {
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

    if (noteTextarea) noteTextarea.value = "";
    if (pageInput) pageInput.value = "";

    popup.style.left = event.clientX + "px";
    popup.style.top = event.clientY + 8 + "px";
    popup.classList.remove("hidden");
  });

  cancelHighlightBtn.addEventListener("click", () => {
    hideHighlightPopup();
  });

  saveHighlightBtn.addEventListener("click", () => {
    if (!currentSelection || !currentSelection.range) return;
    if (!pdfContainer) return;

    const range = currentSelection.range;
    const selectedText = currentSelection.selectedText;
    const color = colorSelect ? colorSelect.value : "#fff59d";
    const noteTextValue = noteTextarea ? noteTextarea.value.trim() : "";
    const userPageNumber =
      pageInput && pageInput.value ? parseInt(pageInput.value, 10) : null;

    const allSpans = pdfContainer.querySelectorAll(".textLayer span");
    const touched = [];
    allSpans.forEach((span) => {
      try {
        if (range.intersectsNode(span)) {
          touched.push(span);
        }
      } catch (e) {
       
      }
    });

    if (!touched.length) {
      hideHighlightPopup();
      return;
    }

    const id = Date.now();

    const bgColor = colorWithAlpha(color, 0.75); 
    touched.forEach((span) => {
      span.classList.add("highlighted");
      span.style.backgroundColor = bgColor;
      span.dataset.noteId = String(id);
    });

    const snippet =
      selectedText || touched.map((s) => s.textContent).join(" ").trim();

    const firstSpan = touched[0];
    const pageEl = firstSpan.closest(".pdf-page");
    const pageNumber = pageEl
      ? Number(pageEl.dataset.pageNumber)
      : userPageNumber;

    const annotation = {
      id,
      color: bgColor,
      noteText: noteTextValue,
      snippet,
      pageNumber,
    };
    annotations.push(annotation);
    renderAnnotationsList();

    window.getSelection().removeAllRanges();
    hideHighlightPopup();
  });
}

function hideHighlightPopup() {
  if (popup) popup.classList.add("hidden");
  currentSelection = null;
}


function colorWithAlpha(color, alpha) {
  if (!color) return `rgba(255, 235, 59, ${alpha})`;

  const trim = color.trim();

  
  if (trim.startsWith("rgba")) return trim;

  
  if (trim.startsWith("rgb")) {
    const inside = trim.slice(trim.indexOf("(") + 1, trim.indexOf(")"));
    return `rgba(${inside}, ${alpha})`;
  }

 
  if (trim[0] === "#") {
    let r, g, b;
    if (trim.length === 7) {
      r = parseInt(trim.slice(1, 3), 16);
      g = parseInt(trim.slice(3, 5), 16);
      b = parseInt(trim.slice(5, 7), 16);
    } else if (trim.length === 4) {
      r = parseInt(trim[1] + trim[1], 16);
      g = parseInt(trim[2] + trim[2], 16);
      b = parseInt(trim[3] + trim[3], 16);
    } else {
      return `rgba(255, 235, 59, ${alpha})`;
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  
  return trim;
}


function renderAnnotationsList() {
  if (!notesList) return;

 
  notesList.innerHTML = "";

  
  const sorted = [...annotations].sort((a, b) => {
    const pa = a.pageNumber ?? Number.MAX_SAFE_INTEGER;
    const pb = b.pageNumber ?? Number.MAX_SAFE_INTEGER;
    if (pa !== pb) return pa - pb;
    return a.id - b.id;
  });

  sorted.forEach((annotation) => {
    renderAnnotationItem(annotation);
  });
}

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

  
  div.addEventListener("click", () => {
    const id = div.dataset.noteId;
    const target = pdfContainer.querySelector(
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



