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
    // Dialog actions sit on the right, so footers take the buttons directly.
    modal: { slots: { footer: 'justify-end gap-2' } },
  },
})
