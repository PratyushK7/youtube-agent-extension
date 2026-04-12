# Design System Usage Rules

## Component usage
- **Button**: use for primary or secondary actions only. Use `data-variant="primary"` for one main CTA per view, and `secondary` for supporting actions.
- **Input**: use for free-form text entry; always pair with a visible label.
- **Select**: use when users must pick from 3+ predefined options.
- **Modal**: use for blocking confirmations, destructive actions, and short focused forms.
- **Card**: use as the default surface container for grouped content sections.
- **Badge**: use for compact status labels (`brand`, `success`, `warning`, `danger`).
- **Toast**: use for transient feedback; never for critical blocking errors.

## Accessibility requirements
- Maintain minimum contrast: **4.5:1** for body text and **3:1** for large text/UI boundaries.
- All interactive controls must expose a visible `:focus-visible` ring from tokens (`--focus-ring`).
- Keyboard behavior:
  - Buttons, inputs, and selects are reachable via <kbd>Tab</kbd>.
  - Modal traps focus while open and closes with <kbd>Escape</kbd>.
  - Toasts are announced through an `aria-live="polite"` region.
- Disabled and loading states must use semantic attributes (`disabled`, `aria-busy="true"`) and not color alone.

## Spacing + typography do/don't
- **Do** use spacing tokens (`--space-*`) to separate blocks consistently.
- **Do** keep headings on `--line-height-tight` and body copy on `--line-height-normal`/`relaxed`.
- **Don’t** hardcode random pixel values that break rhythm (e.g., `margin-bottom: 13px`).
- **Don’t** mix more than two type sizes in the same small card.
- **Don’t** use color-only emphasis for state meaning; pair color with text/icon cues.
