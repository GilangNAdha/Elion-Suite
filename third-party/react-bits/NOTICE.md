# React Bits application adaptations

Copyright (c) 2026 David Haz.

Source: https://github.com/DavidHDev/react-bits

Inspected revision: `0e69e737242df1d257b4e5e399b01ae1d7901375`.

The following components were adapted for use **inside the Elion application**, not redistributed as a component library:

- `src/ts-default/Components/SpotlightCard/SpotlightCard.tsx`: pointer-position spotlight, implemented in `src/components/motion/SpotlightCard.tsx` with Elion tokens and reduced-motion handling.
- `src/ts-default/Animations/StarBorder/StarBorder.tsx`: moving light on one functional action, implemented in `src/components/motion/StarBorder.tsx` using native button semantics and decorative spans.
- `src/ts-default/Components/Dock/Dock.tsx`: motion-value proximity and spring response, adapted in `src/components/shell/BottomDock.tsx`. Elion uses real route links, transform-only magnification, keyboard focus, and motion preferences.

The full MIT + Commons Clause notice is in `LICENSE.md`. That notice permits use as part of an application and restricts selling/sublicensing/redistributing the components themselves. It must not be replaced by the Elion application's MIT declaration.

The `motion` dependency supplies the animation runtime and retains its own MIT licence.
