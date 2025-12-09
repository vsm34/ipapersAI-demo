var annotations = []
var nextNoteId = 1
var currentSelection = null

var pdfContainer = document.getElementById('pdf-container')
var popup = document.getElementById("highlight-popup")
var colorSelect = document.getElementById("highlight-color")
var noteTextarea = document.getElementById("highlight-note")
var cancelBtn = document.getElementById("cancel-highlight")
var saveBtn = document.getElementById("save-highlight")
var notesList = document.getElementById("notes-list")
var sidebar = document.querySelector('.sidebar')
var tabHighlights = document.getElementById('tab-highlights')
var tabAddNote = document.getElementById('tab-add-note')
var addNoteContainer = document.getElementById('add-note-container')
var addNoteText = document.getElementById('add-note-text')
var saveFreeNoteBtn = document.getElementById('save-free-note')
var cancelFreeNoteBtn = document.getElementById('cancel-free-note')

// PDF.js setup and rendering
var pdfUrl = '/static/papers/sample.pdf'
if (window['pdfjsLib']) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js'
}

function renderPDF(url) {
  if (!window['pdfjsLib']) return Promise.reject(new Error('pdfjsLib not found'))
  return pdfjsLib.getDocument(url).promise.then(function (pdf) {
    var renderPromises = []
    for (var p = 1; p <= pdf.numPages; p++) {
      (function (pageNum) {
        renderPromises.push(pdf.getPage(pageNum).then(function (page) {
          var viewport = page.getViewport({ scale: 1.5 })
          var pageEl = document.createElement('div')
          pageEl.className = 'pdf-page'
          pageEl.dataset.pageNumber = String(pageNum)

          var canvas = document.createElement('canvas')
          canvas.className = 'pdf-canvas'
          canvas.width = Math.floor(viewport.width)
          canvas.height = Math.floor(viewport.height)
          pageEl.appendChild(canvas)

          var textLayer = document.createElement('div')
          textLayer.className = 'textLayer'
          pageEl.appendChild(textLayer)

          pdfContainer.appendChild(pageEl)

          var renderContext = { canvasContext: canvas.getContext('2d'), viewport: viewport }
          var renderTask = page.render(renderContext)

          return page.getTextContent().then(function (textContent) {
            // Append simple sequential text spans for selection
            textContent.items.forEach(function (item) {
              var span = document.createElement('span')
              span.className = 'textChunk'
              span.textContent = item.str
              textLayer.appendChild(span)
              // preserve spacing
              var spacer = document.createTextNode(' ')
              textLayer.appendChild(spacer)
            })
            return renderTask.promise
          })
        }))
      })(p)
    }
    return Promise.all(renderPromises)
  })
}

// Start rendering and then load annotations into text layers
renderPDF(pdfUrl).then(function () { loadAnnotationsFromStorage() }).catch(function (e) { console.warn('Could not render PDF', e) })

function isInsideTextLayer(node) {
  if (!node) return false
  if (node.nodeType === Node.TEXT_NODE) node = node.parentNode
  return node && node.closest && node.closest('.textLayer')
}

document.addEventListener('mouseup', function (event) {
  var sel = window.getSelection()
  if (!sel || sel.isCollapsed) return
  var range = sel.getRangeAt(0)
  if (!isInsideTextLayer(range.commonAncestorContainer)) return
  var noteId = nextNoteId++
  currentSelection = { range: range.cloneRange(), noteId: noteId }
  noteTextarea.value = ''
  var rect = range.getBoundingClientRect()
  var popupX = rect.left + window.scrollX
  var popupY = rect.top + window.scrollY - 8
  showPopupAt(popupX, popupY)
})

function showPopupAt(x, y) {
  popup.style.left = x + 'px'
  popup.style.top = Math.max(8, y - popup.offsetHeight) + 'px'
  popup.classList.remove('hidden')
}

function hidePopup() {
  popup.classList.add('hidden')
}

function attachHighlightHandlers(span) {
  if (!span) return
  span.style.cursor = 'pointer'
  span.addEventListener('click', function (e) {
    e.stopPropagation()
    var id = span.dataset.noteId
    if (!id) return
    if (confirm('Delete this highlight and its note?')) {
      deleteAnnotationById(Number(id))
    }
  })
}

document.addEventListener('click', function (e) {
  var target = e.target
  if ((pdfContainer && pdfContainer.contains(target)) || popup.contains(target) || sidebar.contains(target)) return
  currentSelection = null
  window.getSelection().removeAllRanges()
  hidePopup()
})

cancelBtn.addEventListener('click', function () {
  currentSelection = null
  window.getSelection().removeAllRanges()
  hidePopup()
})

saveBtn.addEventListener('click', function () {
  if (!currentSelection || !currentSelection.range) return
  var selRange = currentSelection.range
  if (selRange.collapsed || selRange.toString().trim() === '') return
  var color = colorSelect.value
  var noteText = noteTextarea.value.trim()
  var span = document.createElement('span')
  span.classList.add('highlighted')
  span.dataset.noteId = String(currentSelection.noteId)
  span.style.backgroundColor = color
  // Try to preserve DOM by extracting the selected fragment into the highlight span
  try {
    var frag = selRange.extractContents()
    span.appendChild(frag)
    selRange.insertNode(span)
  } catch (e) {
    span.textContent = selRange.toString()
    selRange.deleteContents()
    selRange.insertNode(span)
  }
  attachHighlightHandlers(span)
  var pageEl = span.closest('.pdf-page')
  var pageNumber = pageEl ? Number(pageEl.dataset.pageNumber) : 1
  var annotation = { id: currentSelection.noteId, color: color, noteText: noteText, highlightedText: span.textContent, pageNumber: pageNumber }
  annotations.push(annotation)
  saveAnnotationsToStorage()
  renderAnnotationItem(annotation)
  window.getSelection().removeAllRanges()
  currentSelection = null
  hidePopup()
})

function renderAnnotationItem(annotation) {
  var div = document.createElement('div')
  div.className = 'note-item'
  div.dataset.noteId = String(annotation.id)
  var colorDot = document.createElement('div')
  colorDot.className = 'note-color'
  colorDot.style.backgroundColor = annotation.color
  var content = document.createElement('div')
  var mainText = (annotation.noteText && annotation.noteText.trim().length) ? annotation.noteText : (annotation.highlightedText || '')
  var truncated = mainText.length > 140 ? mainText.slice(0, 140) + '...' : mainText
  content.textContent = truncated
  var meta = document.createElement('div')
  meta.style.fontSize = '0.8rem'
  meta.style.opacity = '0.7'
  meta.textContent = annotation.pageNumber ? 'p. ' + annotation.pageNumber : ''
  div.appendChild(colorDot)
  div.appendChild(content)
  div.appendChild(meta)
  // click scrolls to highlight
  div.addEventListener('click', function () {
    var id = div.dataset.noteId
    var target = document.querySelector('span.highlighted[data-note-id="' + id + '"]')
    if (!target) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    target.classList.add('highlight-focus')
    setTimeout(function () { target.classList.remove('highlight-focus') }, 1000)
  })

  // delete button
  var del = document.createElement('button')
  del.className = 'note-delete'
  del.title = 'Delete note'
  del.textContent = '✕'
  del.addEventListener('click', function (e) {
    e.stopPropagation()
    if (confirm('Delete this note and its highlight?')) {
      deleteAnnotationById(Number(annotation.id))
    }
  })
  div.appendChild(del)
  notesList.appendChild(div)
}

function deleteAnnotationById(id) {
  annotations = annotations.filter(function (a) { return a.id !== id })
  // remove highlight spans from DOM
  document.querySelectorAll('span.highlighted[data-note-id="' + id + '"]').forEach(function (el) { el.remove() })
  // remove sidebar item
  var item = document.querySelector('.note-item[data-note-id="' + id + '"]')
  if (item && item.parentNode) item.parentNode.removeChild(item)
  saveAnnotationsToStorage()
}

function renderAllAnnotations() {
  notesList.innerHTML = ''
  annotations.forEach(renderAnnotationItem)
}

tabHighlights.addEventListener('click', function () { showHighlightsTab() })
tabAddNote.addEventListener('click', function () { showAddNoteTab() })

function showHighlightsTab() {
  tabHighlights.classList.add('active')
  tabAddNote.classList.remove('active')
  notesList.style.display = 'block'
  addNoteContainer.style.display = 'none'
}

function showAddNoteTab() {
  tabHighlights.classList.remove('active')
  tabAddNote.classList.add('active')
  notesList.style.display = 'none'
  addNoteContainer.style.display = 'flex'
  addNoteText.focus()
}

saveFreeNoteBtn.addEventListener('click', function () {
  var content = addNoteText.value.trim()
  if (!content) return
  var id = Date.now()
  var annotation = { id: id, color: '#eeeeee', noteText: content, highlightedText: '', pageNumber: null }
  annotations.push(annotation)
  saveAnnotationsToStorage()
  renderAnnotationItem(annotation)
  addNoteText.value = ''
  showHighlightsTab()
})

cancelFreeNoteBtn.addEventListener('click', function () { addNoteText.value = ''; showHighlightsTab() })

function saveAnnotationsToStorage() {
  try { localStorage.setItem('ipapers-demo-annotations', JSON.stringify(annotations)) } catch (e) { console.warn('Could not save annotations', e) }
}

function wrapFirstMatchInElement(container, text, noteId, color) {
  var treeWalker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null)
  while (treeWalker.nextNode()) {
    var node = treeWalker.currentNode
    var idx = node.nodeValue.indexOf(text)
    if (idx >= 0) {
      var before = node.nodeValue.slice(0, idx)
      var match = node.nodeValue.slice(idx, idx + text.length)
      var after = node.nodeValue.slice(idx + text.length)
      var parent = node.parentNode
      if (before) parent.insertBefore(document.createTextNode(before), node)
      var span = document.createElement('span')
      span.className = 'highlighted'
      span.dataset.noteId = String(noteId)
      span.style.backgroundColor = color
      span.textContent = match
      parent.insertBefore(span, node)
      // attach click-to-delete handler
      try { attachHighlightHandlers(span) } catch (e) {}
      if (after) parent.insertBefore(document.createTextNode(after), node)
      parent.removeChild(node)
      return true
    }
  }
  return false
}

function loadAnnotationsFromStorage() {
  try {
    var raw = localStorage.getItem('ipapers-demo-annotations')
    if (!raw) return
    var parsed = JSON.parse(raw) || []
    annotations = []
    parsed.forEach(function (item) {
      var a = item
      if (!('noteText' in a) && ('text' in a)) {
        a = { id: a.id || Date.now(), color: a.color || '#fff59d', noteText: a.text, highlightedText: '', pageNumber: null }
      }
      var hasNoteText = a.noteText && a.noteText.toString().trim().length
      var hasHighlightedText = a.highlightedText && a.highlightedText.toString().trim().length
      if (!hasNoteText && !hasHighlightedText) return
      annotations.push(a)
    })
    var maxId = annotations.reduce(function (m, a) { return Math.max(m, a.id || 0) }, 0)
    nextNoteId = Math.max(nextNoteId, maxId + 1)
    annotations.forEach(function (a) {
    if (a.highlightedText && a.highlightedText.length) {
      var pageContainer = null
      if (a.pageNumber) pageContainer = document.querySelector('.pdf-page[data-page-number="' + a.pageNumber + '"]')
      if (!pageContainer) pageContainer = document
      var wrapped = wrapFirstMatchInElement(pageContainer, a.highlightedText, a.id, a.color)
      if (!wrapped && pageContainer !== document) wrapFirstMatchInElement(document, a.highlightedText, a.id, a.color)
    }
    })
    renderAllAnnotations()
  } catch (e) { console.warn('Could not load annotations', e) }
}

