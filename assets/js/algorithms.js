document.addEventListener("DOMContentLoaded", function () {
  const STORAGE_KEY = "algo-study-entries-v1";
  const ANNOTATION_KEY = "algo-study-annotations-v1";

  const elements = {
    form: document.getElementById("checkin-form"),
    date: document.getElementById("checkin-date"),
    category: document.getElementById("checkin-category"),
    title: document.getElementById("checkin-title"),
    summary: document.getElementById("checkin-summary"),
    noteFile: document.getElementById("note-file"),
    codeFiles: document.getElementById("code-files"),
    status: document.getElementById("form-status"),
    statDays: document.getElementById("stat-days"),
    statNotes: document.getElementById("stat-notes"),
    statCode: document.getElementById("stat-code"),
    streak: document.getElementById("streak-count"),
    todayStatus: document.getElementById("today-status"),
    recentTitle: document.getElementById("recent-checkin-title"),
    categoryChips: document.getElementById("category-chips"),
    notesList: document.getElementById("notes-list"),
    codeList: document.getElementById("code-list"),
    readerTitle: document.getElementById("reader-title"),
    readerMeta: document.getElementById("reader-meta"),
    renderedMarkdown: document.getElementById("rendered-markdown"),
    sourceLines: document.getElementById("source-lines"),
    annotationTarget: document.getElementById("annotation-target"),
    annotationForm: document.getElementById("annotation-form"),
    annotationText: document.getElementById("annotation-text"),
    annotationList: document.getElementById("annotation-list")
  };

  let entries = loadJSON(STORAGE_KEY);
  let annotations = loadJSON(ANNOTATION_KEY);
  let selectedNoteId = null;
  let selectedLine = null;

  if (elements.date) {
    elements.date.value = new Date().toISOString().slice(0, 10);
  }

  renderAll();

  elements.form?.addEventListener("submit", async function (event) {
    event.preventDefault();

    const title = elements.title.value.trim();
    const category = elements.category.value;
    const date = elements.date.value;
    const summary = elements.summary.value.trim();
    const noteFile = elements.noteFile.files[0];
    const codeFiles = Array.from(elements.codeFiles.files || []);

    if (!title || !date) {
      setStatus("请先补全标题和日期。", true);
      return;
    }

    if (!noteFile && codeFiles.length === 0 && !summary) {
      setStatus("至少上传一份笔记、一个代码文件，或者写下今日摘要。", true);
      return;
    }

    try {
      const createdAt = new Date().toISOString();
      const batchId = createId("checkin");
      const createdEntries = [];

      createdEntries.push({
        id: batchId,
        kind: "checkin",
        title,
        category,
        date,
        summary,
        createdAt
      });

      if (noteFile) {
        const noteContent = await readFileText(noteFile);
        createdEntries.push({
          id: createId("note"),
          kind: "note",
          title,
          category,
          date,
          summary,
          filename: noteFile.name,
          content: noteContent,
          createdAt
        });
      }

      for (const codeFile of codeFiles) {
        const codeContent = await readFileText(codeFile);
        createdEntries.push({
          id: createId("code"),
          kind: "code",
          title: codeFile.name,
          category,
          date,
          summary,
          filename: codeFile.name,
          language: inferLanguage(codeFile.name),
          content: codeContent,
          createdAt
        });
      }

      entries = [...createdEntries, ...entries];
      saveJSON(STORAGE_KEY, entries);

      const latestNote = createdEntries.find(function (entry) {
        return entry.kind === "note";
      });

      if (latestNote) {
        selectedNoteId = latestNote.id;
        selectedLine = null;
      }

      elements.form.reset();
      elements.date.value = new Date().toISOString().slice(0, 10);
      setStatus("今日打卡已保存到当前浏览器。", false);
      renderAll();
    } catch (error) {
      setStatus("保存失败，可能是文件编码异常或浏览器存储空间不足。", true);
    }
  });

  elements.annotationForm?.addEventListener("submit", function (event) {
    event.preventDefault();

    if (!selectedNoteId || selectedLine === null) {
      setStatus("请先在右侧源码区域选择一行，再添加批注。", true);
      return;
    }

    const text = elements.annotationText.value.trim();
    if (!text) {
      setStatus("批注内容不能为空。", true);
      return;
    }

    annotations.unshift({
      id: createId("annotation"),
      noteId: selectedNoteId,
      line: selectedLine,
      text,
      createdAt: new Date().toISOString()
    });
    saveJSON(ANNOTATION_KEY, annotations);

    elements.annotationText.value = "";
    setStatus("批注已保存。", false);
    renderNoteWorkspace();
  });

  function renderAll() {
    renderSummary();
    renderNotesList();
    renderCodeList();
    renderNoteWorkspace();
  }

  function renderSummary() {
    const checkins = entries.filter(function (entry) {
      return entry.kind === "checkin";
    });
    const notes = entries.filter(function (entry) {
      return entry.kind === "note";
    });
    const codes = entries.filter(function (entry) {
      return entry.kind === "code";
    });
    const uniqueDays = Array.from(
      new Set(
        checkins.map(function (entry) {
          return entry.date;
        })
      )
    ).sort();

    elements.statDays.textContent = String(uniqueDays.length);
    elements.statNotes.textContent = String(notes.length);
    elements.statCode.textContent = String(codes.length);
    elements.streak.textContent = computeStreak(uniqueDays) + " 天";

    const today = new Date().toISOString().slice(0, 10);
    const checkedToday = uniqueDays.includes(today);
    elements.todayStatus.textContent = checkedToday ? "今天已经完成打卡" : "今天还没有打卡记录";

    const latestCheckin = checkins[0];
    elements.recentTitle.textContent = latestCheckin
      ? latestCheckin.title + " · " + latestCheckin.date
      : "暂无记录";

    renderCategoryChips(entries);
  }

  function renderCategoryChips(data) {
    const counts = {};
    data.forEach(function (entry) {
      if (!entry.category) {
        return;
      }
      counts[entry.category] = (counts[entry.category] || 0) + 1;
    });

    const categories = Object.keys(counts);
    if (categories.length === 0) {
      elements.categoryChips.innerHTML = '<span class="algo-empty-chip">还没有专题记录</span>';
      return;
    }

    elements.categoryChips.innerHTML = categories
      .sort()
      .map(function (category) {
        return '<span class="algo-chip">' + escapeHtml(category) + " · " + counts[category] + "</span>";
      })
      .join("");
  }

  function renderNotesList() {
    const notes = entries.filter(function (entry) {
      return entry.kind === "note";
    });

    if (notes.length === 0) {
      elements.notesList.innerHTML = '<div class="algo-empty-state">还没有上传 Markdown 笔记。</div>';
      return;
    }

    elements.notesList.innerHTML = notes
      .map(function (note) {
        const annotationCount = annotations.filter(function (annotation) {
          return annotation.noteId === note.id;
        }).length;

        return [
          '<button class="algo-entry-card ' + (note.id === selectedNoteId ? "is-active" : "") + '" data-note-id="' + note.id + '">',
          '<span class="algo-entry-kind">Markdown</span>',
          '<strong>' + escapeHtml(note.title) + "</strong>",
          '<p>' + escapeHtml(note.category) + " · " + escapeHtml(note.date) + "</p>",
          '<small>' + escapeHtml(note.filename || "未命名笔记") + " · 批注 " + annotationCount + " 条</small>",
          "</button>"
        ].join("");
      })
      .join("");

    elements.notesList.querySelectorAll("[data-note-id]").forEach(function (button) {
      button.addEventListener("click", function () {
        selectedNoteId = button.getAttribute("data-note-id");
        selectedLine = null;
        renderAll();
      });
    });
  }

  function renderCodeList() {
    const codes = entries.filter(function (entry) {
      return entry.kind === "code";
    });

    if (codes.length === 0) {
      elements.codeList.innerHTML = '<div class="algo-empty-state">还没有上传代码文件。</div>';
      return;
    }

    elements.codeList.innerHTML = codes
      .map(function (code) {
        return [
          '<article class="algo-code-entry">',
          '<div class="algo-code-entry-head">',
          '<span class="algo-entry-kind">' + escapeHtml(code.language || "code") + "</span>",
          '<strong>' + escapeHtml(code.filename || code.title) + "</strong>",
          "</div>",
          '<p>' + escapeHtml(code.category) + " · " + escapeHtml(code.date) + "</p>",
          '<pre><code>' + escapeHtml(code.content.slice(0, 420)) + "</code></pre>",
          "</article>"
        ].join("");
      })
      .join("");
  }

  function renderNoteWorkspace() {
    const notes = entries.filter(function (entry) {
      return entry.kind === "note";
    });

    if (!selectedNoteId && notes.length > 0) {
      selectedNoteId = notes[0].id;
    }

    const note = notes.find(function (entry) {
      return entry.id === selectedNoteId;
    });

    if (!note) {
      elements.readerTitle.textContent = "选择一篇笔记开始阅读";
      elements.readerMeta.textContent = "支持 Markdown 渲染、源码查看与行级批注。";
      elements.renderedMarkdown.innerHTML = '<div class="algo-empty-state">还没有选中笔记，先在上方资料库中打开一篇 Markdown。</div>';
      elements.sourceLines.innerHTML = '<div class="algo-empty-state">笔记源码会显示在这里，并支持行级批注。</div>';
      elements.annotationList.innerHTML = '<div class="algo-empty-state">当前还没有批注。</div>';
      elements.annotationTarget.textContent = "当前未选择具体行";
      return;
    }

    const noteAnnotations = annotations
      .filter(function (annotation) {
        return annotation.noteId === note.id;
      })
      .sort(function (a, b) {
        return a.line - b.line;
      });

    elements.readerTitle.textContent = note.title;
    elements.readerMeta.textContent = note.category + " · " + note.date + " · " + (note.filename || "Markdown");
    elements.renderedMarkdown.innerHTML = renderMarkdown(note.content);
    renderSourceLines(note, noteAnnotations);
    renderAnnotationList(noteAnnotations);

    if (selectedLine === null) {
      elements.annotationTarget.textContent = "当前未选择具体行";
    } else {
      elements.annotationTarget.textContent = "当前批注目标：第 " + selectedLine + " 行";
    }
  }

  function renderSourceLines(note, noteAnnotations) {
    const countByLine = {};
    noteAnnotations.forEach(function (annotation) {
      countByLine[annotation.line] = (countByLine[annotation.line] || 0) + 1;
    });

    const lines = note.content.split(/\r?\n/);
    elements.sourceLines.innerHTML = lines
      .map(function (lineText, index) {
        const lineNumber = index + 1;
        const count = countByLine[lineNumber] || 0;
        const hasComment = count > 0 ? " has-comment" : "";
        const isSelected = selectedLine === lineNumber ? " is-selected" : "";
        return [
          '<button class="algo-source-line' + hasComment + isSelected + '" data-line="' + lineNumber + '">',
          '<span class="algo-line-no">' + lineNumber + "</span>",
          '<code>' + escapeHtml(lineText || " ") + "</code>",
          count > 0 ? '<span class="algo-line-badge">' + count + "</span>" : "",
          "</button>"
        ].join("");
      })
      .join("");

    elements.sourceLines.querySelectorAll("[data-line]").forEach(function (button) {
      button.addEventListener("click", function () {
        selectedLine = Number(button.getAttribute("data-line"));
        elements.annotationTarget.textContent = "当前批注目标：第 " + selectedLine + " 行";
        renderNoteWorkspace();
      });
    });
  }

  function renderAnnotationList(noteAnnotations) {
    if (noteAnnotations.length === 0) {
      elements.annotationList.innerHTML = '<div class="algo-empty-state">当前还没有批注。</div>';
      return;
    }

    elements.annotationList.innerHTML = noteAnnotations
      .map(function (annotation) {
        return [
          '<article class="algo-annotation-item">',
          "<strong>第 " + annotation.line + " 行</strong>",
          "<p>" + escapeHtml(annotation.text) + "</p>",
          '<small>' + formatTime(annotation.createdAt) + "</small>",
          "</article>"
        ].join("");
      })
      .join("");
  }

  function computeStreak(sortedUniqueDays) {
    if (sortedUniqueDays.length === 0) {
      return 0;
    }

    let streak = 0;
    let cursor = new Date();
    cursor.setHours(0, 0, 0, 0);

    const daySet = new Set(sortedUniqueDays);
    while (daySet.has(cursor.toISOString().slice(0, 10))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  function renderMarkdown(content) {
    const lines = content.split(/\r?\n/);
    const html = [];
    let inCode = false;
    let listType = null;

    lines.forEach(function (rawLine) {
      const line = rawLine.replace(/\t/g, "  ");
      const trimmed = line.trim();

      if (trimmed.startsWith("```")) {
        if (!inCode) {
          closeList();
          inCode = true;
          html.push("<pre><code>");
        } else {
          inCode = false;
          html.push("</code></pre>");
        }
        return;
      }

      if (inCode) {
        html.push(escapeHtml(line) + "\n");
        return;
      }

      if (!trimmed) {
        closeList();
        return;
      }

      if (/^###\s+/.test(trimmed)) {
        closeList();
        html.push("<h3>" + parseInline(trimmed.replace(/^###\s+/, "")) + "</h3>");
        return;
      }

      if (/^##\s+/.test(trimmed)) {
        closeList();
        html.push("<h2>" + parseInline(trimmed.replace(/^##\s+/, "")) + "</h2>");
        return;
      }

      if (/^#\s+/.test(trimmed)) {
        closeList();
        html.push("<h1>" + parseInline(trimmed.replace(/^#\s+/, "")) + "</h1>");
        return;
      }

      if (/^>\s+/.test(trimmed)) {
        closeList();
        html.push("<blockquote>" + parseInline(trimmed.replace(/^>\s+/, "")) + "</blockquote>");
        return;
      }

      if (/^\d+\.\s+/.test(trimmed)) {
        if (listType !== "ol") {
          closeList();
          listType = "ol";
          html.push("<ol>");
        }
        html.push("<li>" + parseInline(trimmed.replace(/^\d+\.\s+/, "")) + "</li>");
        return;
      }

      if (/^[-*]\s+/.test(trimmed)) {
        if (listType !== "ul") {
          closeList();
          listType = "ul";
          html.push("<ul>");
        }
        html.push("<li>" + parseInline(trimmed.replace(/^[-*]\s+/, "")) + "</li>");
        return;
      }

      closeList();
      html.push("<p>" + parseInline(trimmed) + "</p>");
    });

    closeList();

    if (inCode) {
      html.push("</code></pre>");
    }

    return html.join("");

    function closeList() {
      if (listType) {
        html.push("</" + listType + ">");
        listType = null;
      }
    }
  }

  function parseInline(text) {
    let safe = escapeHtml(text);
    safe = safe.replace(/`([^`]+)`/g, "<code>$1</code>");
    safe = safe.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    safe = safe.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    safe = safe.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
    return safe;
  }

  function formatTime(isoString) {
    const date = new Date(isoString);
    return date.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function readFileText(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () {
        resolve(String(reader.result || ""));
      };
      reader.onerror = reject;
      reader.readAsText(file, "utf-8");
    });
  }

  function createId(prefix) {
    return prefix + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
  }

  function loadJSON(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "[]");
    } catch (error) {
      return [];
    }
  }

  function saveJSON(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  }

  function inferLanguage(filename) {
    const ext = (filename.split(".").pop() || "").toLowerCase();
    const map = {
      py: "python",
      cpp: "cpp",
      c: "c",
      java: "java",
      js: "javascript",
      ts: "typescript",
      go: "go",
      rs: "rust",
      sql: "sql",
      txt: "text"
    };
    return map[ext] || ext || "code";
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function setStatus(message, isError) {
    elements.status.textContent = message;
    elements.status.classList.toggle("is-error", Boolean(isError));
  }
});
