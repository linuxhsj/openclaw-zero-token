import { LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { i18n, I18nController, isSupportedLocale } from "../i18n/index.ts";
import {
  handleChannelConfigReload as handleChannelConfigReloadInternal,
  handleChannelConfigSave as handleChannelConfigSaveInternal,
  handleNostrProfileCancel as handleNostrProfileCancelInternal,
  handleNostrProfileEdit as handleNostrProfileEditInternal,
  handleNostrProfileFieldChange as handleNostrProfileFieldChangeInternal,
  handleNostrProfileImport as handleNostrProfileImportInternal,
  handleNostrProfileSave as handleNostrProfileSaveInternal,
  handleNostrProfileToggleAdvanced as handleNostrProfileToggleAdvancedInternal,
  handleWhatsAppLogout as handleWhatsAppLogoutInternal,
  handleWhatsAppStart as handleWhatsAppStartInternal,
  handleWhatsAppWait as handleWhatsAppWaitInternal,
} from "./app-channels.ts";
import {
  handleAbortChat as handleAbortChatInternal,
  handleSendChat as handleSendChatInternal,
  removeQueuedMessage as removeQueuedMessageInternal,
} from "./app-chat.ts";
import { DEFAULT_CRON_FORM, DEFAULT_LOG_LEVEL_FILTERS } from "./app-defaults.ts";
import type { EventLogEntry } from "./app-events.ts";
import { connectGateway as connectGatewayInternal } from "./app-gateway.ts";
import {
  handleConnected,
  handleDisconnected,
  handleFirstUpdated,
  handleUpdated,
} from "./app-lifecycle.ts";
import { renderApp } from "./app-render.ts";
import {
  exportLogs as exportLogsInternal,
  handleChatScroll as handleChatScrollInternal,
  handleLogsScroll as handleLogsScrollInternal,
  resetChatScroll as resetChatScrollInternal,
  scheduleChatScroll as scheduleChatScrollInternal,
} from "./app-scroll.ts";
import {
  applySettings as applySettingsInternal,
  loadCron as loadCronInternal,
  loadOverview as loadOverviewInternal,
  setTab as setTabInternal,
  setTheme as setThemeInternal,
  onPopState as onPopStateInternal,
} from "./app-settings.ts";
import {
  resetToolStream as resetToolStreamInternal,
  type ToolStreamEntry,
  type CompactionStatus,
} from "./app-tool-stream.ts";
import type { AppViewState } from "./app-view-state.ts";
import { normalizeAssistantIdentity } from "./assistant-identity.ts";
import { loadAssistantIdentity as loadAssistantIdentityInternal } from "./controllers/assistant-identity.ts";
import type { DevicePairingList } from "./controllers/devices.ts";
import type { ExecApprovalRequest } from "./controllers/exec-approval.ts";
import type { ExecApprovalsFile, ExecApprovalsSnapshot } from "./controllers/exec-approvals.ts";
import type { SkillMessage } from "./controllers/skills.ts";
import type { GatewayBrowserClient, GatewayHelloOk } from "./gateway.ts";
import type { Tab } from "./navigation.ts";
import { loadSettings, type UiSettings } from "./storage.ts";
import type { ResolvedTheme, ThemeMode } from "./theme.ts";
import type {
  AgentsListResult,
  AgentsFilesListResult,
  AgentIdentityResult,
  ConfigSnapshot,
  ConfigUiHints,
  CronJob,
  CronRunLogEntry,
  CronStatus,
  HealthSnapshot,
  LogEntry,
  LogLevel,
  PresenceEntry,
  ChannelsStatusSnapshot,
  SessionsListResult,
  SkillStatusReport,
  StatusSummary,
  NostrProfile,
} from "./types.ts";
import { type ChatAttachment, type ChatQueueItem, type CronFormState } from "./ui-types.ts";
import type { NostrProfileFormState } from "./views/channels.nostr-profile-form.ts";

declare global {
  interface Window {
    __OPENCLAW_CONTROL_UI_BASE_PATH__?: string;
  }
}

const bootAssistantIdentity = normalizeAssistantIdentity({});

function resolveOnboardingMode(): boolean {
  if (!window.location.search) {
    return false;
  }
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("onboarding");
  if (!raw) {
    return false;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

@customElement("openclaw-app")
export class OpenClawApp extends LitElement {
  private i18nController = new I18nController(this);
  @state() accessor settings: UiSettings = loadSettings();
  constructor() {
    super();
    if (isSupportedLocale(this.settings.locale)) {
      void i18n.setLocale(this.settings.locale);
    }
  }
  @state() accessor password = "";
  @state() accessor tab: Tab = "chat";
  @state() accessor onboarding = resolveOnboardingMode();
  @state() accessor connected = false;
  @state() accessor theme: ThemeMode = this.settings.theme ?? "system";
  @state() accessor themeResolved: ResolvedTheme = "dark";
  @state() accessor hello: GatewayHelloOk | null = null;
  @state() accessor lastError: string | null = null;
  @state() accessor eventLog: EventLogEntry[] = [];
  private eventLogBuffer: EventLogEntry[] = [];
  private toolStreamSyncTimer: number | null = null;
  private sidebarCloseTimer: number | null = null;

  @state() accessor assistantName = bootAssistantIdentity.name;
  @state() accessor assistantAvatar = bootAssistantIdentity.avatar;
  @state() accessor assistantAgentId = bootAssistantIdentity.agentId ?? null;

  @state() accessor sessionKey = this.settings.sessionKey;
  @state() accessor chatLoading = false;
  @state() accessor chatSending = false;
  @state() accessor chatMessage = "";
  @state() accessor chatMessages: unknown[] = [];
  @state() accessor chatToolMessages: unknown[] = [];
  @state() accessor chatStream: string | null = null;
  @state() accessor chatStreamStartedAt: number | null = null;
  @state() accessor chatRunId: string | null = null;
  @state() accessor compactionStatus: CompactionStatus | null = null;
  @state() accessor chatAvatarUrl: string | null = null;
  @state() accessor chatThinkingLevel: string | null = null;
  @state() accessor chatQueue: ChatQueueItem[] = [];
  @state() accessor chatAttachments: ChatAttachment[] = [];
  @state() accessor chatManualRefreshInFlight = false;
  // Sidebar state for tool output viewing
  @state() accessor sidebarOpen = false;
  @state() accessor sidebarContent: string | null = null;
  @state() accessor sidebarError: string | null = null;
  @state() accessor splitRatio = this.settings.splitRatio;

  @state() accessor nodesLoading = false;
  @state() accessor nodes: Array<Record<string, unknown>> = [];
  @state() accessor devicesLoading = false;
  @state() accessor devicesError: string | null = null;
  @state() accessor devicesList: DevicePairingList | null = null;
  @state() accessor execApprovalsLoading = false;
  @state() accessor execApprovalsSaving = false;
  @state() accessor execApprovalsDirty = false;
  @state() accessor execApprovalsSnapshot: ExecApprovalsSnapshot | null = null;
  @state() accessor execApprovalsForm: ExecApprovalsFile | null = null;
  @state() accessor execApprovalsSelectedAgent: string | null = null;
  @state() accessor execApprovalsTarget: "gateway" | "node" = "gateway";
  @state() accessor execApprovalsTargetNodeId: string | null = null;
  @state() accessor execApprovalQueue: ExecApprovalRequest[] = [];
  @state() accessor execApprovalBusy = false;
  @state() accessor execApprovalError: string | null = null;
  @state() accessor pendingGatewayUrl: string | null = null;

  @state() accessor configLoading = false;
  @state() accessor configRaw = "{\n}\n";
  @state() accessor configRawOriginal = "";
  @state() accessor configValid: boolean | null = null;
  @state() accessor configIssues: unknown[] = [];
  @state() accessor configSaving = false;
  @state() accessor configApplying = false;
  @state() accessor updateRunning = false;
  @state() accessor applySessionKey = this.settings.lastActiveSessionKey;
  @state() accessor configSnapshot: ConfigSnapshot | null = null;
  @state() accessor configSchema: unknown = null;
  @state() accessor configSchemaVersion: string | null = null;
  @state() accessor configSchemaLoading = false;
  @state() accessor configUiHints: ConfigUiHints = {};
  @state() accessor configForm: Record<string, unknown> | null = null;
  @state() accessor configFormOriginal: Record<string, unknown> | null = null;
  @state() accessor configFormDirty = false;
  @state() accessor configFormMode: "form" | "raw" = "form";
  @state() accessor configSearchQuery = "";
  @state() accessor configActiveSection: string | null = null;
  @state() accessor configActiveSubsection: string | null = null;

  @state() accessor channelsLoading = false;
  @state() accessor channelsSnapshot: ChannelsStatusSnapshot | null = null;
  @state() accessor channelsError: string | null = null;
  @state() accessor channelsLastSuccess: number | null = null;
  @state() accessor whatsappLoginMessage: string | null = null;
  @state() accessor whatsappLoginQrDataUrl: string | null = null;
  @state() accessor whatsappLoginConnected: boolean | null = null;
  @state() accessor whatsappBusy = false;
  @state() accessor nostrProfileFormState: NostrProfileFormState | null = null;
  @state() accessor nostrProfileAccountId: string | null = null;

  @state() accessor presenceLoading = false;
  @state() accessor presenceEntries: PresenceEntry[] = [];
  @state() accessor presenceError: string | null = null;
  @state() accessor presenceStatus: string | null = null;

  @state() accessor agentsLoading = false;
  @state() accessor agentsList: AgentsListResult | null = null;
  @state() accessor agentsError: string | null = null;
  @state() accessor agentsSelectedId: string | null = null;
  @state() accessor agentsPanel: "overview" | "files" | "tools" | "skills" | "channels" | "cron" =
    "overview";
  @state() accessor agentFilesLoading = false;
  @state() accessor agentFilesError: string | null = null;
  @state() accessor agentFilesList: AgentsFilesListResult | null = null;
  @state() accessor agentFileContents: Record<string, string> = {};
  @state() accessor agentFileDrafts: Record<string, string> = {};
  @state() accessor agentFileActive: string | null = null;
  @state() accessor agentFileSaving = false;
  @state() accessor agentIdentityLoading = false;
  @state() accessor agentIdentityError: string | null = null;
  @state() accessor agentIdentityById: Record<string, AgentIdentityResult> = {};
  @state() accessor agentSkillsLoading = false;
  @state() accessor agentSkillsError: string | null = null;
  @state() accessor agentSkillsReport: SkillStatusReport | null = null;
  @state() accessor agentSkillsAgentId: string | null = null;

  @state() accessor sessionsLoading = false;
  @state() accessor sessionsResult: SessionsListResult | null = null;
  @state() accessor sessionsError: string | null = null;
  @state() accessor sessionsFilterActive = "";
  @state() accessor sessionsFilterLimit = "120";
  @state() accessor sessionsIncludeGlobal = true;
  @state() accessor sessionsIncludeUnknown = false;

  @state() accessor usageLoading = false;
  @state() accessor usageResult: import("./types.js").SessionsUsageResult | null = null;
  @state() accessor usageCostSummary: import("./types.js").CostUsageSummary | null = null;
  @state() accessor usageError: string | null = null;
  @state() accessor usageStartDate = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  @state() accessor usageEndDate = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  @state() accessor usageSelectedSessions: string[] = [];
  @state() accessor usageSelectedDays: string[] = [];
  @state() accessor usageSelectedHours: number[] = [];
  @state() accessor usageChartMode: "tokens" | "cost" = "tokens";
  @state() accessor usageDailyChartMode: "total" | "by-type" = "by-type";
  @state() accessor usageTimeSeriesMode: "cumulative" | "per-turn" = "per-turn";
  @state() accessor usageTimeSeriesBreakdownMode: "total" | "by-type" = "by-type";
  @state() accessor usageTimeSeries: import("./types.js").SessionUsageTimeSeries | null = null;
  @state() accessor usageTimeSeriesLoading = false;
  @state() accessor usageTimeSeriesCursorStart: number | null = null;
  @state() accessor usageTimeSeriesCursorEnd: number | null = null;
  @state() accessor usageSessionLogs: import("./views/usage.js").SessionLogEntry[] | null = null;
  @state() accessor usageSessionLogsLoading = false;
  @state() accessor usageSessionLogsExpanded = false;
  // Applied query (used to filter the already-loaded sessions list client-side).
  @state() accessor usageQuery = "";
  // Draft query text (updates immediately as the user types; applied via debounce or "Search").
  @state() accessor usageQueryDraft = "";
  @state() accessor usageSessionSort: "tokens" | "cost" | "recent" | "messages" | "errors" =
    "recent";
  @state() accessor usageSessionSortDir: "desc" | "asc" = "desc";
  @state() accessor usageRecentSessions: string[] = [];
  @state() accessor usageTimeZone: "local" | "utc" = "local";
  @state() accessor usageContextExpanded = false;
  @state() accessor usageHeaderPinned = false;
  @state() accessor usageSessionsTab: "all" | "recent" = "all";
  @state() accessor usageVisibleColumns: string[] = [
    "channel",
    "agent",
    "provider",
    "model",
    "messages",
    "tools",
    "errors",
    "duration",
  ];
  @state() accessor usageLogFilterRoles: import("./views/usage.js").SessionLogRole[] = [];
  @state() accessor usageLogFilterTools: string[] = [];
  @state() accessor usageLogFilterHasTools = false;
  @state() accessor usageLogFilterQuery = "";

  // Non-reactive (don’t trigger renders just for timer bookkeeping).
  usageQueryDebounceTimer: number | null = null;

  @state() accessor cronLoading = false;
  @state() accessor cronJobs: CronJob[] = [];
  @state() accessor cronStatus: CronStatus | null = null;
  @state() accessor cronError: string | null = null;
  @state() accessor cronForm: CronFormState = { ...DEFAULT_CRON_FORM };
  @state() accessor cronRunsJobId: string | null = null;
  @state() accessor cronRuns: CronRunLogEntry[] = [];
  @state() accessor cronBusy = false;

  @state() accessor updateAvailable: import("./types.js").UpdateAvailable | null = null;

  @state() accessor skillsLoading = false;
  @state() accessor skillsReport: SkillStatusReport | null = null;
  @state() accessor skillsError: string | null = null;
  @state() accessor skillsFilter = "";
  @state() accessor skillEdits: Record<string, string> = {};
  @state() accessor skillsBusyKey: string | null = null;
  @state() accessor skillMessages: Record<string, SkillMessage> = {};

  @state() accessor debugLoading = false;
  @state() accessor debugStatus: StatusSummary | null = null;
  @state() accessor debugHealth: HealthSnapshot | null = null;
  @state() accessor debugModels: unknown[] = [];
  @state() accessor debugHeartbeat: unknown = null;
  @state() accessor debugCallMethod = "";
  @state() accessor debugCallParams = "{}";
  @state() accessor debugCallResult: string | null = null;
  @state() accessor debugCallError: string | null = null;

  @state() accessor logsLoading = false;
  @state() accessor logsError: string | null = null;
  @state() accessor logsFile: string | null = null;
  @state() accessor logsEntries: LogEntry[] = [];
  @state() accessor logsFilterText = "";
  @state() accessor logsLevelFilters: Record<LogLevel, boolean> = {
    ...DEFAULT_LOG_LEVEL_FILTERS,
  };
  @state() accessor logsAutoFollow = true;
  @state() accessor logsTruncated = false;
  @state() accessor logsCursor: number | null = null;
  @state() accessor logsLastFetchAt: number | null = null;
  @state() accessor logsLimit = 500;
  @state() accessor logsMaxBytes = 250_000;
  @state() accessor logsAtBottom = true;

  // AskOnce state
  @state() accessor askonceModelsLoading = false;
  @state() accessor askonceModels: import("./controllers/askonce.js").AskOnceModelInfo[] = [];
  @state() accessor askonceModelsError: string | null = null;
  @state() accessor askonceQueryLoading = false;
  @state() accessor askonceQueryQuestion = "";
  @state() accessor askonceQueryResult:
    | import("./controllers/askonce.js").AskOnceQueryResult
    | null = null;
  @state() accessor askonceQueryError: string | null = null;
  @state() accessor askonceSelectedModels: string[] = [];

  client: GatewayBrowserClient | null = null;
  private chatScrollFrame: number | null = null;
  private chatScrollTimeout: number | null = null;
  private chatHasAutoScrolled = false;
  private chatUserNearBottom = true;
  @state() accessor chatNewMessagesBelow = false;
  private nodesPollInterval: number | null = null;
  private logsPollInterval: number | null = null;
  private debugPollInterval: number | null = null;
  private logsScrollFrame: number | null = null;
  private toolStreamById = new Map<string, ToolStreamEntry>();
  private toolStreamOrder: string[] = [];
  refreshSessionsAfterChat = new Set<string>();
  basePath = "";
  private popStateHandler = () =>
    onPopStateInternal(this as unknown as Parameters<typeof onPopStateInternal>[0]);
  private themeMedia: MediaQueryList | null = null;
  private themeMediaHandler: ((event: MediaQueryListEvent) => void) | null = null;
  private topbarObserver: ResizeObserver | null = null;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    handleConnected(this as unknown as Parameters<typeof handleConnected>[0]);
  }

  protected firstUpdated() {
    handleFirstUpdated(this as unknown as Parameters<typeof handleFirstUpdated>[0]);
  }

  disconnectedCallback() {
    handleDisconnected(this as unknown as Parameters<typeof handleDisconnected>[0]);
    super.disconnectedCallback();
  }

  protected updated(changed: Map<PropertyKey, unknown>) {
    handleUpdated(this as unknown as Parameters<typeof handleUpdated>[0], changed);
  }

  connect() {
    connectGatewayInternal(this as unknown as Parameters<typeof connectGatewayInternal>[0]);
  }

  handleChatScroll(event: Event) {
    handleChatScrollInternal(
      this as unknown as Parameters<typeof handleChatScrollInternal>[0],
      event,
    );
  }

  handleLogsScroll(event: Event) {
    handleLogsScrollInternal(
      this as unknown as Parameters<typeof handleLogsScrollInternal>[0],
      event,
    );
  }

  exportLogs(lines: string[], label: string) {
    exportLogsInternal(lines, label);
  }

  resetToolStream() {
    resetToolStreamInternal(this as unknown as Parameters<typeof resetToolStreamInternal>[0]);
  }

  resetChatScroll() {
    resetChatScrollInternal(this as unknown as Parameters<typeof resetChatScrollInternal>[0]);
  }

  scrollToBottom(opts?: { smooth?: boolean }) {
    resetChatScrollInternal(this as unknown as Parameters<typeof resetChatScrollInternal>[0]);
    scheduleChatScrollInternal(
      this as unknown as Parameters<typeof scheduleChatScrollInternal>[0],
      true,
      Boolean(opts?.smooth),
    );
  }

  async loadAssistantIdentity() {
    await loadAssistantIdentityInternal(this);
  }

  applySettings(next: UiSettings) {
    applySettingsInternal(this as unknown as Parameters<typeof applySettingsInternal>[0], next);
  }

  setTab(next: Tab) {
    setTabInternal(this as unknown as Parameters<typeof setTabInternal>[0], next);
  }

  setTheme(next: ThemeMode, context?: Parameters<typeof setThemeInternal>[2]) {
    setThemeInternal(this as unknown as Parameters<typeof setThemeInternal>[0], next, context);
  }

  async loadOverview() {
    await loadOverviewInternal(this as unknown as Parameters<typeof loadOverviewInternal>[0]);
  }

  async loadCron() {
    await loadCronInternal(this as unknown as Parameters<typeof loadCronInternal>[0]);
  }

  async handleAbortChat() {
    await handleAbortChatInternal(this as unknown as Parameters<typeof handleAbortChatInternal>[0]);
  }

  removeQueuedMessage(id: string) {
    removeQueuedMessageInternal(
      this as unknown as Parameters<typeof removeQueuedMessageInternal>[0],
      id,
    );
  }

  async handleSendChat(
    messageOverride?: string,
    opts?: Parameters<typeof handleSendChatInternal>[2],
  ) {
    await handleSendChatInternal(
      this as unknown as Parameters<typeof handleSendChatInternal>[0],
      messageOverride,
      opts,
    );
  }

  async handleWhatsAppStart(force: boolean) {
    await handleWhatsAppStartInternal(this, force);
  }

  async handleWhatsAppWait() {
    await handleWhatsAppWaitInternal(this);
  }

  async handleWhatsAppLogout() {
    await handleWhatsAppLogoutInternal(this);
  }

  async handleChannelConfigSave() {
    await handleChannelConfigSaveInternal(this);
  }

  async handleChannelConfigReload() {
    await handleChannelConfigReloadInternal(this);
  }

  handleNostrProfileEdit(accountId: string, profile: NostrProfile | null) {
    handleNostrProfileEditInternal(this, accountId, profile);
  }

  handleNostrProfileCancel() {
    handleNostrProfileCancelInternal(this);
  }

  handleNostrProfileFieldChange(field: keyof NostrProfile, value: string) {
    handleNostrProfileFieldChangeInternal(this, field, value);
  }

  async handleNostrProfileSave() {
    await handleNostrProfileSaveInternal(this);
  }

  async handleNostrProfileImport() {
    await handleNostrProfileImportInternal(this);
  }

  handleNostrProfileToggleAdvanced() {
    handleNostrProfileToggleAdvancedInternal(this);
  }

  async handleExecApprovalDecision(decision: "allow-once" | "allow-always" | "deny") {
    const active = this.execApprovalQueue[0];
    if (!active || !this.client || this.execApprovalBusy) {
      return;
    }
    this.execApprovalBusy = true;
    this.execApprovalError = null;
    try {
      await this.client.request("exec.approval.resolve", {
        id: active.id,
        decision,
      });
      this.execApprovalQueue = this.execApprovalQueue.filter((entry) => entry.id !== active.id);
    } catch (err) {
      this.execApprovalError = `Exec approval failed: ${String(err)}`;
    } finally {
      this.execApprovalBusy = false;
    }
  }

  handleGatewayUrlConfirm() {
    const nextGatewayUrl = this.pendingGatewayUrl;
    if (!nextGatewayUrl) {
      return;
    }
    this.pendingGatewayUrl = null;
    applySettingsInternal(this as unknown as Parameters<typeof applySettingsInternal>[0], {
      ...this.settings,
      gatewayUrl: nextGatewayUrl,
    });
    this.connect();
  }

  handleGatewayUrlCancel() {
    this.pendingGatewayUrl = null;
  }

  // Sidebar handlers for tool output viewing
  handleOpenSidebar(content: string) {
    if (this.sidebarCloseTimer != null) {
      window.clearTimeout(this.sidebarCloseTimer);
      this.sidebarCloseTimer = null;
    }
    this.sidebarContent = content;
    this.sidebarError = null;
    this.sidebarOpen = true;
  }

  handleCloseSidebar() {
    this.sidebarOpen = false;
    // Clear content after transition
    if (this.sidebarCloseTimer != null) {
      window.clearTimeout(this.sidebarCloseTimer);
    }
    this.sidebarCloseTimer = window.setTimeout(() => {
      if (this.sidebarOpen) {
        return;
      }
      this.sidebarContent = null;
      this.sidebarError = null;
      this.sidebarCloseTimer = null;
    }, 200);
  }

  handleSplitRatioChange(ratio: number) {
    const newRatio = Math.max(0.4, Math.min(0.7, ratio));
    this.splitRatio = newRatio;
    this.applySettings({ ...this.settings, splitRatio: newRatio });
  }

  render() {
    return renderApp(this as unknown as AppViewState);
  }
}
