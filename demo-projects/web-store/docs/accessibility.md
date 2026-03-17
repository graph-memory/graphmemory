# Accessibility Guidelines

The ShopFlow Web Store targets WCAG 2.2 Level AA compliance. This document covers our accessibility standards, ARIA patterns, keyboard navigation requirements, and testing procedures.

## Principles

1. **Perceivable** — All content is available to all senses (visual, auditory, tactile)
2. **Operable** — All functionality is available via keyboard and assistive technology
3. **Understandable** — Content and navigation are predictable and clear
4. **Robust** — Content works with current and future assistive technologies

## Semantic HTML

Use native HTML elements before reaching for ARIA:

- `<button>` for clickable actions (not `<div onClick>`)
- `<a href>` for navigation links
- `<nav>` for navigation regions
- `<main>` for the primary content area
- `<header>` and `<footer>` for page structure
- `<ul>` / `<li>` for lists of items (product grids, cart items)
- `<form>` with `<label>` for all form inputs

## ARIA Patterns

### Product Card
The product card uses `role="button"` with `tabIndex={0}` since it is a clickable `<article>`. The entire card is focusable, and the add-to-cart button is a nested interactive element with `e.stopPropagation()` to prevent double navigation.

```html
<article role="button" tabIndex="0" aria-label="Product Name, $29.99">
  <button aria-label="Add Product Name to cart">Add to Cart</button>
</article>
```

### Cart Drawer
The cart drawer is a modal dialog with focus trapping:

```html
<aside role="dialog" aria-label="Shopping cart" aria-modal="true">
  <!-- Focus is trapped inside while open -->
  <!-- Escape key closes the drawer -->
</aside>
```

### Search Autocomplete
The search bar uses the combobox pattern:

```html
<div role="combobox" aria-expanded="true">
  <input role="searchbox" aria-autocomplete="list" aria-controls="suggestions" />
  <ul id="suggestions" role="listbox">
    <li role="option" aria-selected="true">Suggestion text</li>
  </ul>
</div>
```

### Checkout Steps
The step indicator uses `aria-current="step"` on the active step. Each step section has a descriptive `aria-label`.

## Keyboard Navigation

### Global Shortcuts
| Key       | Action                          |
|-----------|---------------------------------|
| Tab       | Move focus to next element      |
| Shift+Tab | Move focus to previous element  |
| Escape    | Close open overlays (cart, menus)|
| Enter     | Activate focused element        |
| Space     | Activate buttons, toggle checkboxes |

### Product Grid Navigation
- Tab moves between product cards
- Enter on a card navigates to the product detail page
- Tab into the card reaches the "Add to Cart" button

### Cart Drawer
- When opened, focus moves to the drawer container
- Tab cycles through cart items, quantity buttons, and checkout
- Escape closes the drawer and returns focus to the cart icon

### Search Bar
- Arrow Down/Up navigates through suggestions
- Enter selects the highlighted suggestion or submits the query
- Escape closes the dropdown and blurs the input

## Color and Contrast

- All text meets a minimum contrast ratio of 4.5:1 against its background
- Interactive elements have a 3:1 contrast ratio for borders and focus indicators
- Color is never the sole means of conveying information (e.g., low stock uses both color and text)
- Focus indicators use a visible 2px outline with sufficient contrast

## Motion and Animation

- All animations respect `prefers-reduced-motion: reduce`
- Cart drawer slide-in, product card hover effects, and loading spinners are disabled when reduced motion is preferred
- No content relies solely on animation to convey meaning

## Images

- All product images have descriptive `alt` text from the product data
- Decorative icons use `aria-hidden="true"`
- The cart badge count is announced via `aria-label` on the cart button, with `aria-hidden` on the visual badge

## Live Regions

Dynamic content updates use `aria-live` regions:
- Cart item count changes: `aria-live="polite"` on the quantity display
- Search results loading state: `aria-busy="true"` on the results container
- Error messages: `role="alert"` for immediate announcement
- Cart subtotal: `aria-live="polite"` to announce price changes

## Forms (Checkout)

- Every input has a visible `<label>` or `aria-label`
- Required fields use `aria-required="true"`
- Validation errors are linked to inputs via `aria-describedby`
- Radio groups (address, shipping, payment) use `role="radiogroup"` with group labels
- The submit button indicates loading state with `aria-busy`

## Testing Procedures

### Automated Testing
- **axe-core**: Run on every component via `vitest-axe` in unit tests
- **Lighthouse**: CI check for accessibility score >= 95
- **ESLint**: `eslint-plugin-jsx-a11y` catches common issues at lint time

### Manual Testing
- **Keyboard-only navigation**: Complete a full purchase flow without a mouse
- **Screen reader testing**: VoiceOver (macOS/iOS) and NVDA (Windows)
- **Zoom testing**: Verify layout at 200% and 400% zoom levels
- **High contrast mode**: Test in Windows High Contrast and forced-colors mode

### Testing Checklist
- [ ] All interactive elements are keyboard accessible
- [ ] Focus order is logical and follows visual layout
- [ ] Screen reader announces all dynamic changes
- [ ] No content is hidden from assistive technology unintentionally
- [ ] Error messages are associated with their form fields
- [ ] Modals trap focus and return focus on close
- [ ] Images have appropriate alt text
- [ ] Color contrast meets WCAG AA requirements
