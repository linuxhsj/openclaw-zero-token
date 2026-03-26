import { html, nothing, type TemplateResult, css } from "lit";
import { LitElement } from "lit";
import { property, state } from "lit/decorators.js";
import { customElement } from "lit/decorators.js";
import { styleMap } from "lit/directives/style-map.js";
import { createRef, ref, type Ref } from "lit/directives/ref.js";

type VirtualScrollItem = {
  id: string;
  height: number;
  offsetTop: number;
};

@customElement("config-virtual-scroll")
export class ConfigVirtualScroll extends LitElement {
  @property({ attribute: false })
  items: Array<{ id: string; render: () => TemplateResult; estimatedHeight?: number }> = [];

  @property({ attribute: false })
  containerHeight = 600;

  @property({ attribute: false })
  itemHeight = 60;

  @state()
  private scrollPosition = 0;

  @state()
  private visibleStart = 0;

  @state()
  private visibleEnd = 0;

  private scrollContainerRef: Ref<HTMLDivElement> = createRef();
  private itemHeights = new Map<string, number>();
  private itemOffsets = new Map<string, number>();
  private totalHeight = 0;
  private rafId: number | null = null;

  override firstUpdated(): void {
    this.calculatePositions();
  }

  override willUpdate(changes: Map<string, unknown>): void {
    if (changes.has("items")) {
      this.calculatePositions();
    }
  }

  private calculatePositions(): void {
    let offset = 0;
    this.itemOffsets.clear();

    for (const item of this.items) {
      const height = this.itemHeights.get(item.id) ?? item.estimatedHeight ?? this.itemHeight;
      this.itemOffsets.set(item.id, offset);
      offset += height;
    }

    this.totalHeight = offset;
    this.updateVisibleRange();
  }

  private updateVisibleRange(): void {
    const buffer = this.itemHeight * 2;
    const startOffset = Math.max(0, this.scrollPosition - buffer);
    const endOffset = this.scrollPosition + this.containerHeight + buffer;

    let startIndex = 0;
    let endIndex = this.items.length;

    for (let i = 0; i < this.items.length; i++) {
      const offset = this.itemOffsets.get(this.items[i].id) ?? 0;
      const height = this.itemHeights.get(this.items[i].id) ?? this.itemHeight;

      if (offset + height < startOffset) {
        startIndex = i + 1;
      }
      if (offset > endOffset && endIndex === this.items.length) {
        endIndex = i;
        break;
      }
    }

    this.visibleStart = startIndex;
    this.visibleEnd = Math.min(endIndex + 1, this.items.length);
  }

  private handleScroll(): void {
    if (!this.scrollContainerRef.value) return;

    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
    }

    this.rafId = requestAnimationFrame(() => {
      this.scrollPosition = this.scrollContainerRef.value!.scrollTop;
      this.updateVisibleRange();
      this.rafId = null;
    });
  }

  private measureItem(id: string, element: HTMLElement | null): void {
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newHeight = entry.contentRect.height;
        const oldHeight = this.itemHeights.get(id) ?? this.itemHeight;

        if (Math.abs(newHeight - oldHeight) > 1) {
          this.itemHeights.set(id, newHeight);
          this.calculatePositions();
        }
      }
    });

    observer.observe(element);
  }

  override render(): TemplateResult {
    const visibleItems = this.items.slice(this.visibleStart, this.visibleEnd);
    const offsetY =
      this.visibleStart > 0
        ? this.itemOffsets.get(this.items[this.visibleStart]?.id) ?? 0
        : 0;

    return html`
      <div
        ${this.scrollContainerRef}
        class="virtual-scroll-container"
        style=${styleMap({
          height: `${this.containerHeight}px`,
          overflow: "auto",
          position: "relative",
        })}
        @scroll=${this.handleScroll}
      >
        <div
          class="virtual-scroll-spacer"
          style=${styleMap({
            height: `${this.totalHeight}px`,
            position: "absolute",
            top: "0",
            left: "0",
            right: "0",
          })}
        ></div>
        <div
          class="virtual-scroll-content"
          style=${styleMap({
            position: "absolute",
            top: "0",
            left: "0",
            right: "0",
            transform: `translateY(${offsetY}px)`,
          })}
        >
          ${visibleItems.map(
            (item, index) => html`
              <div
                data-item-id=${item.id}
                @ref=${(e: Element) => this.measureItem(item.id, e as HTMLElement)}
              >
                ${item.render()}
              </div>
            `,
          )}
        </div>
      </div>
    `;
  }

  static styles = css`
    .virtual-scroll-container {
      contain: strict;
    }
    
    .virtual-scroll-content {
      will-change: transform;
    }
  `;

  scrollToTop(): void {
    if (this.scrollContainerRef.value) {
      this.scrollContainerRef.value.scrollTop = 0;
    }
  }

  scrollToItem(id: string): void {
    const offset = this.itemOffsets.get(id);
    if (offset !== undefined && this.scrollContainerRef.value) {
      this.scrollContainerRef.value.scrollTop = offset;
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "config-virtual-scroll": ConfigVirtualScroll;
  }
}
