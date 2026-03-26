import { html, nothing, type TemplateResult, css } from "lit";
import { LitElement, } from "lit";
import { property, state } from "lit/decorators.js";
import { createRef, ref, type Ref } from "lit/directives/ref.js";
import { customElement } from "lit/decorators.js";
import { styleMap } from "lit/directives/style-map.js";

@customElement("config-lazy-section")
export class ConfigLazySection extends LitElement {
  @property({ attribute: false })
  renderContent?: () => TemplateResult;

  @property({ attribute: true, type: Boolean })
  open = false;

  @property({ attribute: false })
  placeholder?: string;

  @state()
  private isHovered = false;

  @state()
  private hasLoaded = false;

  override connectedCallback(): void {
    super.connectedCallback();
    // Use IntersectionObserver to detect visibility
    this.setupIntersectionObserver();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
  }

  private setupIntersectionObserver(): void {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !this.open) {
            // Component is visible but not expanded - mark as ready to load
            this.hasLoaded = true;
          }
        }
      },
      {
        rootMargin: "200px",
        threshold: 0.1,
      },
    );

    // Observe after next render
    requestAnimationFrame(() => {
      if (this.renderRoot.firstElementChild) {
        observer.observe(this.renderRoot.firstElementChild);
      }
    });
  }

  private handleToggle(event: Event): void {
    const target = event.target as HTMLDetailsElement;
    this.open = target.open;

    // Load content on first expand
    if (target.open && !this.hasLoaded) {
      this.hasLoaded = true;
    }
  }

  override render(): TemplateResult {
    const isLoading = !this.hasLoaded && !this.open;

    return html`
      <details
        class="config-lazy-section"
        ?open=${this.open}
        @toggle=${this.handleToggle}
        @mouseenter=${() => (this.isHovered = true)}
        @mouseleave=${() => (this.isHovered = false)}
      >
        <summary class="config-lazy-section__header">
          <slot name="header"></slot>
        </summary>
        <div class="config-lazy-section__content">
          ${isLoading
            ? html`<div class="config-lazy-section__placeholder">
                ${this.placeholder ?? "Click to load..."}
              </div>`
            : this.renderContent?.()}
        </div>
      </details>
    `;
  }

  static styles = css`
    .config-lazy-section {
      border: 1px solid var(--cfg-border, #e5e7eb);
      border-radius: 8px;
      margin-bottom: 12px;
      overflow: hidden;
    }

    .config-lazy-section__header {
      padding: 12px 16px;
      background: var(--cfg-header-bg, #f9fafb);
      cursor: pointer;
      font-weight: 500;
      user-select: none;
    }

    .config-lazy-section__header:hover {
      background: var(--cfg-header-hover, #f3f4f6);
    }

    .config-lazy-section__content {
      padding: 16px;
    }

    .config-lazy-section__placeholder {
      color: var(--cfg-muted, #9ca3af);
      font-style: italic;
      text-align: center;
      padding: 24px;
    }
  `;

  expand(): void {
    this.open = true;
    if (!this.hasLoaded) {
      this.hasLoaded = true;
    }
  }

  collapse(): void {
    this.open = false;
  }

  toggle(): void {
    this.open = !this.open;
    if (this.open && !this.hasLoaded) {
      this.hasLoaded = true;
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "config-lazy-section": ConfigLazySection;
  }
}
