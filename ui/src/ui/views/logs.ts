import { html, nothing } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import type { LogEntry, LogLevel } from "../types.ts";

const LEVELS: LogLevel[] = ["trace", "debug", "info", "warn", "error", "fatal"];

export type LogsProps = {
  loading: boolean;
  error: string | null;
  file: string | null;
  entries: LogEntry[];
  filterText: string;
  levelFilters: Record<LogLevel, boolean>;
  autoFollow: boolean;
  truncated: boolean;
  onFilterTextChange: (next: string) => void;
  onLevelToggle: (level: LogLevel, enabled: boolean) => void;
  onToggleAutoFollow: (next: boolean) => void;
  onRefresh: () => void;
  onExport: (lines: string[], label: string) => void;
  onScroll: (event: Event) => void;
};

function formatTime(value?: string | null) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleTimeString();
}

function matchesFilter(entry: LogEntry, needle: string) {
  if (!needle) {
    return true;
  }
  const haystack = [entry.message, entry.subsystem, entry.raw]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

export function renderLogs(props: LogsProps) {
  const needle = props.filterText.trim().toLowerCase();
  const levelFiltered = LEVELS.some((level) => !props.levelFilters[level]);
  const filtered = props.entries.filter((entry) => {
    if (entry.level && !props.levelFilters[entry.level]) {
      return false;
    }
    return matchesFilter(entry, needle);
  });
  const exportLabel = needle || levelFiltered ? "filtered" : "visible";

  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">Logs</div>
          <div class="card-sub">Gateway file logs (JSONL).</div>
        </div>
        <div class="row" style="gap: 8px;">
          <button class="btn" ?disabled=${props.loading} @click=${props.onRefresh}>
            ${props.loading ? "Loading…" : "Refresh"}
          </button>
          <button
            class="btn"
            ?disabled=${filtered.length === 0}
            @click=${() =>
              props.onExport(
                filtered.map((entry) => entry.raw),
                exportLabel,
              )}
          >
            Export ${exportLabel}
          </button>
        </div>
      </div>

      <div class="filters" style="margin-top: 14px;">
        <label class="field" style="min-width: 220px;">
          <span>Filter</span>
          <input
            .value=${props.filterText}
            @input=${(e: Event) => props.onFilterTextChange((e.target as HTMLInputElement).value)}
            placeholder="Search logs"
          />
        </label>
        <label class="field checkbox">
          <span>Auto-follow</span>
          <input
            type="checkbox"
            .checked=${props.autoFollow}
            @change=${(e: Event) =>
              props.onToggleAutoFollow((e.target as HTMLInputElement).checked)}
          />
        </label>
      </div>

      <div class="chip-row" style="margin-top: 12px;">
        ${LEVELS.map(
          (level) => html`
            <label class="chip log-chip ${level}">
              <input
                type="checkbox"
                .checked=${props.levelFilters[level]}
                @change=${(e: Event) =>
                  props.onLevelToggle(level, (e.target as HTMLInputElement).checked)}
              />
              <span>${level}</span>
            </label>
          `,
        )}
      </div>

      ${
        props.file
          ? html`<div class="muted" style="margin-top: 10px;">File: ${props.file}</div>`
          : nothing
      }
      ${
        props.truncated
          ? html`
              <div class="callout" style="margin-top: 10px">Log output truncated; showing latest chunk.</div>
            `
          : nothing
      }
      ${
        props.error
          ? html`<div class="callout danger" style="margin-top: 10px;">${props.error}</div>`
          : nothing
      }

      <div class="log-stream" style="margin-top: 12px;" @scroll=${props.onScroll}>
        ${
          filtered.length === 0
            ? html`
                <div class="muted" style="padding: 12px">No log entries.</div>
              `
            : filtered.map(
                (entry) => html`
                <div class="log-row">
                  <div class="log-time mono">${formatTime(entry.time)}</div>
                  <div class="log-level ${entry.level ?? ""}">${entry.level ?? ""}</div>
                  <div class="log-subsystem mono">${entry.subsystem ?? ""}</div>
                <div class="log-message mono">${unsafeHTML(parseAnsiToHtml(entry.message ?? entry.raw))}</div>
                </div>
              `,
              )
        }
      </div>
    </section>
  `;
}

// ANSI color to CSS class mapping
const ANSI_COLOR_MAP: Record<string, string> = {
  "30": "ansi-black",
  "31": "ansi-red",
  "32": "ansi-green",
  "33": "ansi-yellow",
  "34": "ansi-blue",
  "35": "ansi-magenta",
  "36": "ansi-cyan",
  "37": "ansi-white",
  "90": "ansi-bright-black",
  "91": "ansi-bright-red",
  "92": "ansi-bright-green",
  "93": "ansi-bright-yellow",
  "94": "ansi-bright-blue",
  "95": "ansi-bright-magenta",
  "96": "ansi-bright-cyan",
  "97": "ansi-bright-white",
};

/**
 * Parse ANSI escape sequences and convert to HTML with proper styling.
 * Handles colors, bold, dim, underline, and reset codes.
 */
function parseAnsiToHtml(input: string): string {
  if (!input) return "";
  
  let html = "";
  let styles: string[] = [];
  let i = 0;
  
  while (i < input.length) {
    // Check for ANSI escape sequence
    if (input[i] === "\u001b" && input[i + 1] === "[") {
      // Find the end of the sequence (ends with 'm')
      let j = i + 2;
      while (j < input.length && input[j] !== "m") {
        j++;
      }
      
      if (j < input.length) {
        // Extract the parameters between ESC[ and m
        const params = input.slice(i + 2, j);
        
        if (params === "") {
          // Reset code (ESC[m)
          styles = [];
        } else {
          // Parse individual codes
          const codes = params.split(";");
          for (const code of codes) {
            if (code === "0") {
              // Reset
              styles = [];
            } else if (code === "1") {
              // Bold
              styles = styles.filter((s) => !s.startsWith("font-weight"));
              styles.push("font-weight: bold");
            } else if (code === "2") {
              // Dim
              styles = styles.filter((s) => !s.startsWith("opacity"));
              styles.push("opacity: 0.6");
            } else if (code === "4") {
              // Underline
              styles = styles.filter((s) => !s.startsWith("text-decoration"));
              styles.push("text-decoration: underline");
            } else if (code === "22") {
              // Normal intensity (not bold, not dim)
              styles = styles.filter(
                (s) => !s.startsWith("font-weight") && !s.startsWith("opacity"),
              );
            } else if (code === "24") {
              // No underline
              styles = styles.filter((s) => !s.startsWith("text-decoration"));
            } else if (ANSI_COLOR_MAP[code]) {
              // Foreground color - remove existing color first
              styles = styles.filter((s) => !s.startsWith("color:"));
              styles.push(`color: var(--${ANSI_COLOR_MAP[code]}, inherit)`);
            }
          }
        }
        
        // Move past the escape sequence
        i = j + 1;
        continue;
      }
    }
    
    // Regular character - output with current styles
    const char = input[i];
    if (char) {
      if (styles.length > 0) {
        html += `<span style="${styles.join(";")}">${escapeHtml(char)}</span>`;
      } else {
        html += escapeHtml(char);
      }
    }
    i++;
  }
  
  return html;
}

/** Escape HTML special characters */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]!);
}
