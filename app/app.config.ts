export default defineAppConfig({
  ui: {
    // Fork-only: the Flytower palette (app/assets/css/main.css).
    colors: { primary: 'tungsten', neutral: 'steel' },
    // Form controls fill their field. Pass a width class (w-32, flex-1, w-auto) to size one differently.
    input: { slots: { root: 'w-full' } },
    inputNumber: { slots: { root: 'w-full' } },
    textarea: { slots: { root: 'w-full' } },
    select: { slots: { base: 'w-full' } },
    selectMenu: { slots: { base: 'w-full' } },
    // Tables carry their own frame, so pages need no wrapping card.
    table: { slots: { root: 'rounded-lg border border-default', thead: 'bg-elevated/50' } },
    // Soft and subtle badges sit on a tint of their own colour, where the 700 text shade falls just
    // short of 4.5:1 (4.3:1 on green and amber); 800 passes. Dark mode keeps Nuxt UI's 400.
    badge: {
      compoundVariants: [
        { color: 'success', variant: ['soft', 'subtle'], class: 'text-(--ui-color-success-800) dark:text-success' },
        { color: 'info', variant: ['soft', 'subtle'], class: 'text-(--ui-color-info-800) dark:text-info' },
        { color: 'warning', variant: ['soft', 'subtle'], class: 'text-(--ui-color-warning-800) dark:text-warning' },
        { color: 'error', variant: ['soft', 'subtle'], class: 'text-(--ui-color-error-800) dark:text-error' },
      ],
    },
    // Dialog actions sit on the right, so footers take the buttons directly.
    modal: { slots: { footer: 'justify-end gap-2' } },
  },
})
