/**
 * AskOnce UI View
 * Displays multi-model concurrent query interface
 */

import { html, css } from "lit";
import { t } from "../../i18n/index.ts";
import { formatDurationHuman } from "../format.ts";
import type {
  AskOnceState,
  AskOnceModelInfo,
  AskOnceModelResponse,
} from "../controllers/askonce.ts";

export type AskOnceViewProps = AskOnceState & {
  onLoadModels: () => void;
  onExecuteQuery: (question: string, selectedModels?: string[]) => void;
  onToggleModel: (modelId: string) => void;
  onSelectAllModels: () => void;
  onClearAllModels: () => void;
  onQuestionChange: (question: string) => void;
};

const statusColors: Record<string, string> = {
  completed: "#22c55e",
  error: "#ef4444",
  timeout: "#f59e0b",
};

function renderModelStatusIcon(status: string): string {
  switch (status) {
    case "completed":
      return "✓";
    case "error":
      return "✗";
    case "timeout":
      return "⏱";
    default:
      return "?";
  }
}

function renderModelCard(response: AskOnceModelResponse): unknown {
  const statusColor = statusColors[response.status] || "#666";
  const providerIcon: Record<string, string> = {
    anthropic: "🅰️",
    openai: "🤖",
    google: "🔷",
    deepseek: "🌊",
    alibaba: "🧠",
    moonshot: "🌙",
    zhipuai: "📊",
    bytedance: "📦",
    xai: "⚡",
  };
  const icon = providerIcon[response.provider] || "🤖";

  return html`
    <div class="askonce-response-card" data-status="${response.status}">
      <div class="response-header">
        <span class="provider-icon">${icon}</span>
        <span class="model-name">${response.modelName}</span>
        <span class="status-badge" style="background-color: ${statusColor}">
          ${renderModelStatusIcon(response.status)} ${response.status}
        </span>
        <span class="response-time">${response.responseTime}ms</span>
        <span class="char-count">${response.charCount} chars</span>
      </div>
      <div class="response-content">
        ${response.status === "completed"
          ? html`<pre class="content-text">${response.content || "(empty response)"}</pre>`
          : html`<div class="error-message">${response.error || "Unknown error"}</div>`}
      </div>
    </div>
  `;
}

function renderModelSelector(
  models: AskOnceModelInfo[],
  selectedModels: string[],
  onToggle: (modelId: string) => void,
  onSelectAll: () => void,
  onClearAll: () => void,
): unknown {
  const availableModels = models.filter((m) => m.available);
  const unavailableModels = models.filter((m) => !m.available);

  if (availableModels.length === 0) {
    return html`
      <div class="no-models">
        <p>No models available. Please configure authentication first:</p>
        <code>openclaw onboard</code>
      </div>
    `;
  }

  // Check if all available models are selected
  const allSelected = availableModels.length > 0 && availableModels.every((m) => selectedModels.includes(m.id));
  const selectedCount = selectedModels.length;

  return html`
    <div class="model-selector">
      <div class="selector-header">
        <div class="selector-label">
          ${selectedCount === 0
            ? html`Models: <span class="muted">(all available)</span>`
            : html`Models: ${selectedCount} selected`}
        </div>
        <div class="selector-actions">
          <button class="btn-link" @click=${allSelected ? onClearAll : onSelectAll} title="${allSelected ? "Clear all" : "Select all"}">
            ${allSelected ? "Clear All" : "Select All"}
          </button>
        </div>
      </div>
      <div class="model-chips">
        ${availableModels.map(
          (model) => html`
            <button class="model-chip ${selectedModels.includes(model.id) ? "selected" : ""}" @click=${() => onToggle(model.id)} title="${model.provider}">
              ${model.name}
            </button>
          `,
        )}
      </div>
      ${unavailableModels.length > 0
        ? html`
            <div class="unavailable-models">
              <span class="muted">Unavailable:</span>
              ${unavailableModels.map((m) => m.name).join(", ")}
            </div>
          `
        : null}
    </div>
  `;
}

export function renderAskOnceView(props: AskOnceViewProps): unknown {
  const {
    connected,
    modelsLoading,
    models,
    modelsError,
    queryLoading,
    queryQuestion,
    queryResult,
    queryError,
    selectedModels,
    onLoadModels,
    onExecuteQuery,
    onToggleModel,
    onSelectAllModels,
    onClearAllModels,
    onQuestionChange,
  } = props;

  // Load models when connected
  if (connected && !modelsLoading && models.length === 0 && !modelsError) {
    setTimeout(onLoadModels, 0);
  }

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const input = form.querySelector('input[name="question"]') as HTMLInputElement;
    const question = input?.value?.trim();
    if (question) {
      onExecuteQuery(question, selectedModels.length > 0 ? selectedModels : undefined);
    }
  };

  return html`
    <style>
      ${askonceStyles}
    </style>
    <div class="askonce-container">
      ${!connected
        ? html`
            <div class="not-connected">
              <p>Please connect to the gateway first.</p>
            </div>
          `
        : html`
            <!-- Model selector -->
            ${modelsLoading
              ? html`<div class="loading">Loading models...</div>`
              : modelsError
                ? html`<div class="error">${modelsError}</div>`
                : renderModelSelector(models, selectedModels, onToggleModel, onSelectAllModels, onClearAllModels)}

            <!-- Query form -->
            <form class="query-form" @submit=${handleSubmit}>
              <div class="input-wrapper">
                <label class="field">
                  <span>Question</span>
                  <input
                    type="text"
                    name="question"
                    .value=${queryQuestion}
                    @input=${(e: Event) =>
                      onQuestionChange((e.target as HTMLInputElement).value)}
                    placeholder="Enter your question..."
                    ?disabled=${queryLoading}
                  />
                </label>
                <button type="submit" class="btn primary" ?disabled=${queryLoading || !queryQuestion.trim()}>
                  ${queryLoading ? "Querying..." : "Ask All Models"}
                </button>
              </div>
            </form>

            <!-- Query error -->
            ${queryError ? html`<div class="error query-error">${queryError}</div>` : null}

            <!-- Query result -->
            ${queryResult
              ? html`
                  <div class="query-result">
                    <div class="result-header">
                      <span class="question">"${queryResult.question}"</span>
                      <span class="stats">
                        ${queryResult.successCount}/${queryResult.responses.length} succeeded
                        in ${formatDurationHuman(queryResult.totalTime)}
                      </span>
                    </div>
                    <div class="responses-grid">
                      ${queryResult.responses.map((r) => renderModelCard(r))}
                    </div>
                  </div>
                `
              : null}
          `}
    </div>
  `;
}

const askonceStyles = css`
  .askonce-container {
    padding: 16px;
    max-width: 1400px;
    margin: 0 auto;
  }

  .askonce-header {
    margin-bottom: 24px;
  }

  .askonce-header h2 {
    margin: 0 0 8px 0;
    font-size: 24px;
  }

  .header-subtitle {
    margin: 0;
    color: #888;
  }

  .not-connected {
    padding: 40px;
    text-align: center;
    background: #f5f5f5;
    border-radius: 8px;
  }

  .loading {
    padding: 20px;
    text-align: center;
    color: #666;
  }

  .error {
    padding: 12px 16px;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 6px;
    color: #dc2626;
  }

  .query-error {
    margin-top: 16px;
  }

  .model-selector {
    margin-bottom: 20px;
    padding: 16px;
    background: var(--bg-elevated, #f9fafb);
    border: 1px solid var(--border, #e5e7eb);
    border-radius: var(--radius-md, 8px);
  }

  .selector-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .selector-label {
    font-size: 13px;
    color: var(--text-muted, #666);
  }

  .selector-actions {
    display: flex;
    gap: 8px;
  }

  .btn-link {
    background: none;
    border: none;
    color: var(--accent, #3b82f6);
    cursor: pointer;
    font-size: 12px;
    padding: 4px 8px;
    text-decoration: none;
    transition: opacity 0.2s;
  }

  .btn-link:hover {
    opacity: 0.8;
    text-decoration: underline;
  }

  .model-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .model-chip {
    padding: 6px 12px;
    border: 1px solid #e5e7eb;
    border-radius: 16px;
    background: white;
    cursor: pointer;
    font-size: 13px;
    transition: all 0.2s;
  }

  .model-chip:hover {
    border-color: #3b82f6;
  }

  .model-chip.selected {
    background: #3b82f6;
    color: white;
    border-color: #3b82f6;
  }

  .unavailable-models {
    margin-top: 12px;
    font-size: 12px;
  }

  .no-models {
    padding: 20px;
    background: #fffbeb;
    border: 1px solid #fcd34d;
    border-radius: 8px;
    text-align: center;
  }

  .no-models code {
    display: block;
    margin-top: 8px;
    padding: 8px;
    background: #f5f5f5;
    border-radius: 4px;
  }

  .query-form {
    margin-bottom: 24px;
  }

  .query-form .input-wrapper {
    display: flex;
    gap: 8px;
    align-items: stretch;
  }

  .query-form .field {
    flex: 1;
    display: grid;
    gap: 6px;
  }

  .query-form .field > span {
    display: none;
  }

  .query-form .field input {
    padding: 10px 14px;
    border: 1px solid var(--border, #e5e7eb);
    border-radius: var(--radius-md, 8px);
    font-size: 14px;
    background: var(--bg, white);
    color: var(--fg, #374151);
    width: 100%;
    box-sizing: border-box;
  }

  .query-form .field input:focus {
    outline: none;
    border-color: var(--accent, #3b82f6);
    box-shadow: 0 0 0 2px var(--accent-subtle, rgba(59, 130, 246, 0.1));
  }

  .query-form .field input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .query-form .input-wrapper button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 1px solid var(--accent, #3b82f6);
    background: var(--accent, #3b82f6);
    color: var(--primary-foreground, white);
    padding: 10px 20px;
    border-radius: var(--radius-md, 8px);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition:
      border-color var(--duration-fast, 0.15s) var(--ease-out),
      background var(--duration-fast, 0.15s) var(--ease-out);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  }

  .query-form .input-wrapper button:hover:not(:disabled) {
    background: var(--accent-hover, #2563eb);
    border-color: var(--accent-hover, #2563eb);
    box-shadow: var(--shadow-md, 0 4px 6px rgba(0, 0, 0, 0.1));
  }

  .query-form .input-wrapper button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .input-wrapper button:disabled {
    background: #9ca3af;
    cursor: not-allowed;
  }

  .query-result {
    margin-top: 24px;
  }

  .result-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid #e5e7eb;
  }

  .result-header .question {
    font-size: 16px;
    font-weight: 500;
    color: #374151;
  }

  .result-header .stats {
    font-size: 13px;
    color: #6b7280;
  }

  .responses-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
    gap: 16px;
  }

  .askonce-response-card {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    overflow: hidden;
  }

  .askonce-response-card[data-status="error"] {
    border-color: #fecaca;
  }

  .askonce-response-card[data-status="timeout"] {
    border-color: #fed7aa;
  }

  .response-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    background: #f9fafb;
    border-bottom: 1px solid #e5e7eb;
    font-size: 13px;
  }

  .provider-icon {
    font-size: 16px;
  }

  .model-name {
    font-weight: 500;
    flex: 1;
  }

  .status-badge {
    padding: 2px 8px;
    border-radius: 12px;
    color: white;
    font-size: 11px;
    text-transform: uppercase;
  }

  .response-time,
  .char-count {
    color: #9ca3af;
    font-size: 11px;
  }

  .response-content {
    padding: 12px;
    max-height: 400px;
    overflow: auto;
  }

  .content-text {
    margin: 0;
    white-space: pre-wrap;
    word-wrap: break-word;
    font-family: inherit;
    font-size: 13px;
    line-height: 1.5;
  }

  .error-message {
    color: #dc2626;
    font-size: 13px;
  }

  .muted {
    color: #9ca3af;
  }
`;
