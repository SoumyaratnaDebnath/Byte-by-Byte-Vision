"use strict";

const TAB_CONFIG = {
  home: { panelId: "panel-home", source: "README.md", targetId: "home-content" },
  courses: { panelId: "panel-courses", source: "COURCES.md", targetId: "courses-content" },
  tools: { panelId: "panel-tools", source: "TOOLS.md", targetId: "tools-content" },
  notes: { panelId: "panel-notes" },
  books: { panelId: "panel-books" }
};

const RESOURCE_FILES = [
  "NOTES/NOTES/Linear Algebra - Mitesh Khapra.pdf",
  "NOTES/NOTES/First Principles of Computer Vision.pdf",
  "NOTES/IITGN/Deep Learning/Generative Models.pdf",
  "NOTES/IITGN/Deep Learning/Transformers and Attention.pdf",
  "NOTES/IITGN/Deep Learning/Numerical Computation for Deep Learning.pdf",
  "NOTES/IITGN/Algorithms/Algorithms.pdf",
  "NOTES/IITGN/Algorithms/Network Flow.pdf",
  "NOTES/IITGN/Algorithms/Dynamic Programming.pdf",
  "NOTES/IITGN/Machine Learning/Class Notes.pdf",
  "NOTES/IITGN/Machine Learning/Linear Regression.pdf",
  "NOTES/IITGN/Machine Learning/Support Vector Machine.pdf",
  "NOTES/IITGN/Machine Learning/MLP.pdf",
  "NOTES/IITGN/Machine Learning/Ensemble Learning.pdf",
  "NOTES/IITGN/Machine Learning/Decision Tree.pdf",
  "NOTES/IITGN/Machine Learning/Self Study and Notes.pdf",
  "NOTES/IITGN/Machine Learning/Logistic regression.pdf",
  "BOOKS/Quantum Computing for the Quantum Curious.pdf",
  "BOOKS/Understanding Deep Learning.pdf",
  "BOOKS/Vector Calculus - Michael Corra.pdf",
  "BOOKS/Fundamentals of Computer Graphics.pdf",
  "BOOKS/Deep Generative Modelling.pdf",
  "BOOKS/Diffusion Models for Imaging and Vision.pdf"
];

const HIDDEN_NOTES_FROM_PAGE = new Set([
  "NOTES/IITGN/Machine Learning/Self Study and Notes.pdf"
]);

const markdownCache = new Map();
let homeSearchQuery = "";
let coursesSearchQuery = "";
let toolsSearchQuery = "";

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function uniqueId(baseId, usedIds) {
  const normalizedBase = baseId || "section";
  let candidate = normalizedBase;
  let suffix = 2;

  while (usedIds.has(candidate) || document.getElementById(candidate)) {
    candidate = `${normalizedBase}-${suffix}`;
    suffix += 1;
  }

  usedIds.add(candidate);
  return candidate;
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatInline(text) {
  let rendered = escapeHtml(text);
  rendered = rendered.replace(/&lt;br\s*\/?&gt;/gi, "<br>");
  rendered = rendered.replace(/`([^`]+)`/g, "<code>$1</code>");
  rendered = rendered.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  rendered = rendered.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  rendered = rendered.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, href) => {
    const safeHref = href.trim();
    return `<a href="${escapeHtml(safeHref)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });
  return rendered;
}

function isHeading(line) {
  return /^#{1,6}\s+/.test(line);
}

function isHorizontalRule(line) {
  return /^\s{0,3}((-\s*){3,}|(\*\s*){3,}|(_\s*){3,})$/.test(line);
}

function parseListItemToken(line) {
  const match = line.match(/^(\s*)(?:([*+-])|(\d+)\.)\s+(.*)$/);
  if (!match) {
    return null;
  }

  return {
    indent: match[1].replace(/\t/g, "    ").length,
    ordered: Boolean(match[3]),
    text: match[4]
  };
}

function isListItem(line) {
  return Boolean(parseListItemToken(line));
}

function isTableDivider(line) {
  return /^\s*\|?[\-:| ]+\|?\s*$/.test(line);
}

function isTableStart(lines, index) {
  if (index + 1 >= lines.length) {
    return false;
  }

  const current = lines[index];
  const next = lines[index + 1];
  return current.includes("|") && isTableDivider(next);
}

function splitTableRow(line) {
  const normalized = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return normalized.split("|").map((segment) => segment.trim());
}

function parseList(lines, startIndex) {
  const firstToken = parseListItemToken(lines[startIndex]);
  if (!firstToken) {
    return { html: "", nextIndex: startIndex + 1 };
  }

  const ordered = firstToken.ordered;
  const listIndent = firstToken.indent;
  const tag = ordered ? "ol" : "ul";
  const items = [];
  let index = startIndex;

  while (index < lines.length) {
    const token = parseListItemToken(lines[index]);
    if (!token) {
      break;
    }
    if (token.indent < listIndent) {
      break;
    }
    if (token.indent > listIndent) {
      if (items.length === 0) {
        break;
      }
      const nestedList = parseList(lines, index);
      const lastIndex = items.length - 1;
      items[lastIndex] = items[lastIndex].replace(/<\/li>$/, `${nestedList.html}</li>`);
      index = nestedList.nextIndex;
      continue;
    }
    if (token.ordered !== ordered) {
      break;
    }

    let content = formatInline(token.text.trim());
    index += 1;

    while (index < lines.length) {
      const continuation = lines[index];
      const trimmed = continuation.trim();
      if (!trimmed) {
        index += 1;
        break;
      }
      if (isHeading(continuation) || isHorizontalRule(continuation) || isTableStart(lines, index)) {
        break;
      }

      const continuationToken = parseListItemToken(continuation);
      if (continuationToken) {
        if (continuationToken.indent > listIndent) {
          const nestedList = parseList(lines, index);
          content += nestedList.html;
          index = nestedList.nextIndex;
          continue;
        }
        if (continuationToken.indent <= listIndent) {
          break;
        }
      }

      content += ` ${formatInline(trimmed)}`;
      index += 1;
    }

    items.push(`<li>${content}</li>`);
  }

  return {
    html: `<${tag}>${items.join("")}</${tag}>`,
    nextIndex: index
  };
}

function parseTable(lines, startIndex) {
  const headerCells = splitTableRow(lines[startIndex]);
  const rows = [];
  let index = startIndex + 2;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim() || !line.includes("|")) {
      break;
    }
    rows.push(splitTableRow(line));
    index += 1;
  }

  const headHtml = `<thead><tr>${headerCells.map((cell) => `<th>${formatInline(cell)}</th>`).join("")}</tr></thead>`;
  const bodyHtml = `<tbody>${rows
    .map((row) => `<tr>${row.map((cell) => `<td>${formatInline(cell)}</td>`).join("")}</tr>`)
    .join("")}</tbody>`;

  return {
    html: `<table>${headHtml}${bodyHtml}</table>`,
    nextIndex: index
  };
}

function renderMarkdownLite(markdown) {
  const lines = markdown.replace(/\r/g, "").split("\n");
  const parts = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (isHeading(line)) {
      const level = line.match(/^#{1,6}/)[0].length;
      const headingText = line.replace(/^#{1,6}\s+/, "");
      parts.push(`<h${level}>${formatInline(headingText)}</h${level}>`);
      index += 1;
      continue;
    }

    if (isHorizontalRule(line)) {
      parts.push("<hr>");
      index += 1;
      continue;
    }

    if (isTableStart(lines, index)) {
      const tableResult = parseTable(lines, index);
      parts.push(tableResult.html);
      index = tableResult.nextIndex;
      continue;
    }

    if (isListItem(line)) {
      const listResult = parseList(lines, index);
      parts.push(listResult.html);
      index = listResult.nextIndex;
      continue;
    }

    const paragraphLines = [];
    while (index < lines.length) {
      const next = lines[index];
      if (!next.trim() || isHeading(next) || isHorizontalRule(next) || isListItem(next) || isTableStart(lines, index)) {
        break;
      }
      paragraphLines.push(next.trim());
      index += 1;
    }

    parts.push(`<p>${formatInline(paragraphLines.join(" "))}</p>`);
  }

  return parts.join("\n");
}

async function loadMarkdownFile(source) {
  if (markdownCache.has(source)) {
    return markdownCache.get(source);
  }

  const response = await fetch(encodeURI(source), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Unable to fetch ${source}`);
  }

  const markdown = await response.text();
  const html = renderMarkdownLite(markdown);
  markdownCache.set(source, html);
  return html;
}

async function ensureTabContent(tabId) {
  const config = TAB_CONFIG[tabId];
  if (!config || !config.source) {
    return;
  }

  const target = document.getElementById(config.targetId);
  if (!target) {
    return;
  }
  if (target.dataset.loaded === "true") {
    if (tabId === "home") {
      prepareHomeSections();
      buildHomeToc();
      applyHomeSearch(homeSearchQuery);
    } else if (tabId === "courses") {
      prepareCoursesSections();
      applyCoursesSearch(coursesSearchQuery);
    } else if (tabId === "tools") {
      prepareToolsSections();
      applyToolsSearch(toolsSearchQuery);
    }
    return;
  }

  try {
    const html = await loadMarkdownFile(config.source);
    target.innerHTML = html;
    target.dataset.loaded = "true";
    if (tabId === "home") {
      prepareHomeSections();
      buildHomeToc();
      applyHomeSearch(homeSearchQuery);
    } else if (tabId === "courses") {
      prepareCoursesSections();
      applyCoursesSearch(coursesSearchQuery);
    } else if (tabId === "tools") {
      prepareToolsSections();
      applyToolsSearch(toolsSearchQuery);
    }
  } catch (error) {
    target.innerHTML = `<p class="status">Could not load <code>${escapeHtml(config.source)}</code>. Serve the repo with a local web server if this page is opened via <code>file://</code>.</p>`;
  }
}

function activateTab(tabId, setFocus) {
  const buttons = Array.from(document.querySelectorAll(".tab-button"));
  const targetConfig = TAB_CONFIG[tabId];
  if (!targetConfig) {
    return;
  }

  buttons.forEach((button) => {
    const isActive = button.dataset.tab === tabId;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
    button.setAttribute("tabindex", isActive ? "0" : "-1");
    if (isActive && setFocus) {
      button.focus();
    }
  });

  Object.entries(TAB_CONFIG).forEach(([_key, config]) => {
    const panel = document.getElementById(config.panelId);
    if (!panel) {
      return;
    }
    const active = config === targetConfig;
    panel.classList.toggle("is-active", active);
    panel.hidden = !active;
  });

  ensureTabContent(tabId);
}

function setupTabs() {
  const buttons = Array.from(document.querySelectorAll(".tab-button"));

  buttons.forEach((button, index) => {
    button.addEventListener("click", () => {
      activateTab(button.dataset.tab, false);
    });

    button.addEventListener("keydown", (event) => {
      const key = event.key;
      if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(key)) {
        return;
      }

      event.preventDefault();
      let nextIndex = index;
      if (key === "ArrowRight") {
        nextIndex = (index + 1) % buttons.length;
      }
      if (key === "ArrowLeft") {
        nextIndex = (index - 1 + buttons.length) % buttons.length;
      }
      if (key === "Home") {
        nextIndex = 0;
      }
      if (key === "End") {
        nextIndex = buttons.length - 1;
      }
      activateTab(buttons[nextIndex].dataset.tab, true);
    });
  });

  activateTab("home", false);
}

function toDisplayTitle(path) {
  const fileName = path.split("/").pop().replace(/\.pdf$/i, "");
  return fileName.replace(/[_-]+/g, " ");
}

function createResourceCard(path, options = {}) {
  const { showPath = true } = options;
  const card = document.createElement("article");
  card.className = "resource-card";
  card.dataset.search = `${toDisplayTitle(path)} ${path}`.toLowerCase();

  const link = document.createElement("a");
  link.href = encodeURI(path);
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = toDisplayTitle(path);

  card.append(link);
  if (showPath) {
    const pathText = document.createElement("p");
    pathText.className = "resource-path";
    pathText.textContent = path;
    card.append(pathText);
  }
  return card;
}

function renderNotes() {
  const notesContainer = document.getElementById("notes-groups");
  if (!notesContainer) {
    return;
  }

  const notesFiles = RESOURCE_FILES.filter((path) => path.startsWith("NOTES/") && !HIDDEN_NOTES_FROM_PAGE.has(path));
  const grouped = new Map();

  notesFiles.forEach((path) => {
    const parts = path.split("/");
    let groupKey = "Notes";

    if (parts[1] === "IITGN" && parts.length >= 4) {
      groupKey = parts[2];
    } else if (parts[1] === "NOTES") {
      groupKey = "General Notes";
    }

    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, []);
    }
    grouped.get(groupKey).push(path);
  });

  Array.from(grouped.keys())
    .sort((a, b) => a.localeCompare(b))
    .forEach((groupKey) => {
      const wrapper = document.createElement("section");
      wrapper.className = "resource-group";

      const title = document.createElement("h3");
      title.className = "group-title";
      title.textContent = groupKey;

      const grid = document.createElement("div");
      grid.className = "resource-grid";

      grouped
        .get(groupKey)
        .sort((a, b) => toDisplayTitle(a).localeCompare(toDisplayTitle(b)))
        .forEach((path) => {
          grid.append(createResourceCard(path, { showPath: false }));
        });

      wrapper.append(title, grid);
      notesContainer.append(wrapper);
    });

}

function renderBooks() {
  const booksGrid = document.getElementById("books-grid");
  if (!booksGrid) {
    return;
  }

  const books = RESOURCE_FILES.filter((path) => path.startsWith("BOOKS/"))
    .sort((a, b) => toDisplayTitle(a).localeCompare(toDisplayTitle(b)));

  books.forEach((path) => {
    booksGrid.append(createResourceCard(path, { showPath: false }));
  });

}

function applyFilter(containerSelector, query) {
  const cards = Array.from(document.querySelectorAll(`${containerSelector} .resource-card`));
  const normalizedQuery = query.trim().toLowerCase();

  cards.forEach((card) => {
    const isMatch = !normalizedQuery || card.dataset.search.includes(normalizedQuery);
    card.classList.toggle("is-hidden", !isMatch);
  });

  if (containerSelector === "#notes-groups") {
    const groups = Array.from(document.querySelectorAll("#notes-groups .resource-group"));
    groups.forEach((group) => {
      const hasVisibleCards = group.querySelector(".resource-card:not(.is-hidden)");
      group.style.display = hasVisibleCards ? "" : "none";
    });
  }
}

function setupFilters() {
  const notesSearch = document.getElementById("notes-search");
  const booksSearch = document.getElementById("books-search");

  if (notesSearch) {
    notesSearch.addEventListener("input", () => {
      applyFilter("#notes-groups", notesSearch.value);
    });
  }

  if (booksSearch) {
    booksSearch.addEventListener("input", () => {
      applyFilter("#books-grid", booksSearch.value);
    });
  }
}

function prepareHomeSections() {
  const homeContent = document.getElementById("home-content");
  if (!homeContent || homeContent.dataset.sectionized === "true") {
    return;
  }

  const children = Array.from(homeContent.children);
  if (children.length === 0) {
    return;
  }

  const fragment = document.createDocumentFragment();
  let currentSection = null;

  children.forEach((node) => {
    if (node.tagName === "H2") {
      currentSection = document.createElement("section");
      currentSection.className = "home-section";
      fragment.append(currentSection);
    }

    if (!currentSection) {
      currentSection = document.createElement("section");
      currentSection.className = "home-section";
      fragment.append(currentSection);
    }

    currentSection.append(node);
  });

  homeContent.replaceChildren(fragment);
  homeContent.dataset.sectionized = "true";
}

function buildHomeToc() {
  const toc = document.getElementById("home-toc");
  const tocList = document.getElementById("home-toc-list");
  const homeContent = document.getElementById("home-content");

  if (!toc || !tocList || !homeContent || homeContent.dataset.loaded !== "true") {
    return;
  }

  const headings = Array.from(homeContent.querySelectorAll(".home-section > h2"));
  tocList.innerHTML = "";

  if (headings.length === 0) {
    toc.hidden = true;
    return;
  }

  const usedIds = new Set();

  headings.forEach((heading, index) => {
    const headingText = heading.textContent.trim();
    const base = slugify(headingText) || `section-${index + 1}`;
    let headingId = heading.id;
    if (!headingId || usedIds.has(headingId)) {
      headingId = uniqueId(base, usedIds);
    } else {
      usedIds.add(headingId);
    }
    heading.id = headingId;

    const section = heading.closest(".home-section");
    if (section) {
      section.dataset.headingId = headingId;
    }

    const item = document.createElement("li");
    item.dataset.targetId = headingId;

    const link = document.createElement("a");
    link.href = `#${headingId}`;
    link.textContent = headingText;

    item.append(link);
    tocList.append(item);
  });

  toc.hidden = false;
}

function syncHomeTocVisibility() {
  const toc = document.getElementById("home-toc");
  const tocList = document.getElementById("home-toc-list");
  const homeContent = document.getElementById("home-content");
  if (!toc || !tocList || !homeContent) {
    return;
  }

  const items = Array.from(tocList.querySelectorAll("li[data-target-id]"));
  let visibleItems = 0;

  items.forEach((item) => {
    const targetId = item.dataset.targetId;
    const heading = document.getElementById(targetId);
    const section = heading ? heading.closest(".home-section") : null;
    const isVisible = !section || !section.classList.contains("is-hidden");
    item.classList.toggle("is-hidden", !isVisible);
    if (isVisible) {
      visibleItems += 1;
    }
  });

  toc.classList.toggle("is-empty", visibleItems === 0);
}

function applyHomeSearch(query) {
  const homeContent = document.getElementById("home-content");
  const status = document.getElementById("home-search-status");
  if (!homeContent) {
    return;
  }
  if (homeContent.dataset.loaded !== "true") {
    if (status) {
      status.textContent = query.trim() ? "Home is still loading..." : "";
    }
    return;
  }

  prepareHomeSections();

  const normalized = query.trim().toLowerCase();
  const sections = Array.from(homeContent.querySelectorAll(".home-section"));
  let visible = 0;

  sections.forEach((section) => {
    const isMatch = !normalized || section.textContent.toLowerCase().includes(normalized);
    section.classList.toggle("is-hidden", !isMatch);
    if (isMatch) {
      visible += 1;
    }
  });

  if (status) {
    if (!normalized) {
      status.textContent = "";
    } else if (visible === 0) {
      status.textContent = "No matching sections in Home.";
    } else {
      status.textContent = `Showing ${visible} matching section${visible === 1 ? "" : "s"}.`;
    }
  }

  syncHomeTocVisibility();
}

function setupHomeSearch() {
  const homeSearch = document.getElementById("home-search");
  if (!homeSearch) {
    return;
  }

  homeSearch.addEventListener("input", () => {
    homeSearchQuery = homeSearch.value;
    applyHomeSearch(homeSearchQuery);
  });
}

function prepareCoursesSections() {
  const coursesContent = document.getElementById("courses-content");
  if (!coursesContent || coursesContent.dataset.sectionized === "true") {
    return;
  }

  const children = Array.from(coursesContent.children);
  if (children.length === 0) {
    return;
  }

  const fragment = document.createDocumentFragment();
  let currentSection = null;

  children.forEach((node) => {
    const startsNewCourse = node.tagName === "P" && Boolean(node.querySelector("strong"));
    if (startsNewCourse || !currentSection) {
      currentSection = document.createElement("section");
      currentSection.className = "courses-section";
      fragment.append(currentSection);
    }

    currentSection.append(node);
  });

  coursesContent.replaceChildren(fragment);
  coursesContent.dataset.sectionized = "true";
}

function applyCoursesSearch(query) {
  const coursesContent = document.getElementById("courses-content");
  const status = document.getElementById("courses-search-status");
  if (!coursesContent) {
    return;
  }
  if (coursesContent.dataset.loaded !== "true") {
    if (status) {
      status.textContent = query.trim() ? "Courses are still loading..." : "";
    }
    return;
  }

  prepareCoursesSections();

  const normalized = query.trim().toLowerCase();
  const sections = Array.from(coursesContent.querySelectorAll(".courses-section"));
  let visible = 0;

  sections.forEach((section) => {
    const isMatch = !normalized || section.textContent.toLowerCase().includes(normalized);
    section.classList.toggle("is-hidden", !isMatch);
    if (isMatch) {
      visible += 1;
    }
  });

  if (status) {
    if (!normalized) {
      status.textContent = "";
    } else if (visible === 0) {
      status.textContent = "No matching courses.";
    } else {
      status.textContent = `Showing ${visible} matching course${visible === 1 ? "" : "s"}.`;
    }
  }
}

function setupCoursesSearch() {
  const coursesSearch = document.getElementById("courses-search");
  if (!coursesSearch) {
    return;
  }

  coursesSearch.addEventListener("input", () => {
    coursesSearchQuery = coursesSearch.value;
    applyCoursesSearch(coursesSearchQuery);
  });
}

function prepareToolsSections() {
  const toolsContent = document.getElementById("tools-content");
  if (!toolsContent || toolsContent.dataset.sectionized === "true") {
    return;
  }

  const children = Array.from(toolsContent.children);
  if (children.length === 0) {
    return;
  }

  const fragment = document.createDocumentFragment();
  let introSection = null;
  let currentSection = null;

  children.forEach((node) => {
    if (node.tagName === "H2") {
      currentSection = document.createElement("section");
      currentSection.className = "tools-section";
      fragment.append(currentSection);
    }

    if (!currentSection) {
      if (!introSection) {
        introSection = document.createElement("section");
        introSection.className = "tools-section tools-intro-section";
        fragment.append(introSection);
      }
      introSection.append(node);
      return;
    }

    currentSection.append(node);
  });

  toolsContent.replaceChildren(fragment);
  toolsContent.dataset.sectionized = "true";
}

function setTableRowsVisibility(table, visible) {
  table.classList.toggle("is-hidden", !visible);
  const rows = Array.from(table.querySelectorAll("tbody tr"));
  rows.forEach((row) => {
    row.classList.toggle("is-hidden", !visible);
  });
}

function applyToolsSearch(query) {
  const toolsContent = document.getElementById("tools-content");
  const status = document.getElementById("tools-search-status");
  if (!toolsContent) {
    return;
  }
  if (toolsContent.dataset.loaded !== "true") {
    if (status) {
      status.textContent = query.trim() ? "Tools are still loading..." : "";
    }
    return;
  }

  prepareToolsSections();

  const normalized = query.trim().toLowerCase();
  const sections = Array.from(toolsContent.querySelectorAll(".tools-section"));
  let visibleSections = 0;

  sections.forEach((section) => {
    const heading = section.querySelector("h2");
    const headingMatch = heading ? heading.textContent.toLowerCase().includes(normalized) : false;
    const tables = Array.from(section.querySelectorAll("table"));

    if (!normalized) {
      tables.forEach((table) => setTableRowsVisibility(table, true));
      section.classList.remove("is-hidden");
      visibleSections += 1;
      return;
    }

    if (tables.length === 0) {
      const textMatch = section.textContent.toLowerCase().includes(normalized);
      section.classList.toggle("is-hidden", !textMatch);
      if (textMatch) {
        visibleSections += 1;
      }
      return;
    }

    if (headingMatch) {
      tables.forEach((table) => setTableRowsVisibility(table, true));
      section.classList.remove("is-hidden");
      visibleSections += 1;
      return;
    }

    let sectionHasMatch = false;
    tables.forEach((table) => {
      const rows = Array.from(table.querySelectorAll("tbody tr"));
      let tableHasMatch = false;

      rows.forEach((row) => {
        const isMatch = row.textContent.toLowerCase().includes(normalized);
        row.classList.toggle("is-hidden", !isMatch);
        if (isMatch) {
          tableHasMatch = true;
        }
      });

      table.classList.toggle("is-hidden", !tableHasMatch);
      if (tableHasMatch) {
        sectionHasMatch = true;
      }
    });

    section.classList.toggle("is-hidden", !sectionHasMatch);
    if (sectionHasMatch) {
      visibleSections += 1;
    }
  });

  if (status) {
    if (!normalized) {
      status.textContent = "";
    } else if (visibleSections === 0) {
      status.textContent = "No matching tools found.";
    } else {
      status.textContent = `Showing ${visibleSections} matching section${visibleSections === 1 ? "" : "s"}.`;
    }
  }
}

function setupToolsSearch() {
  const toolsSearch = document.getElementById("tools-search");
  if (!toolsSearch) {
    return;
  }

  toolsSearch.addEventListener("input", () => {
    toolsSearchQuery = toolsSearch.value;
    applyToolsSearch(toolsSearchQuery);
  });
}

function init() {
  setupTabs();
  renderNotes();
  renderBooks();
  setupFilters();
  setupHomeSearch();
  setupCoursesSearch();
  setupToolsSearch();
}

init();
