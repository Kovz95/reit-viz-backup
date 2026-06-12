// Hand-written stub — BasketEditorPanel used in Baskets.tsx
// The Baskets page imports this component; stub it with a minimal placeholder.
import { createElement } from "react";

export interface BasketEditorPanelProps {
  basketId?: string | null;
  onClose?: () => void;
  [key: string]: any;
}

export function BasketEditorPanel({ basketId, onClose, ...props }: BasketEditorPanelProps) {
  return createElement(
    "div",
    { className: "p-4 text-muted-foreground text-sm" },
    basketId
      ? `Basket editor for ${basketId}`
      : "Select a basket to edit."
  );
}

export default BasketEditorPanel;
