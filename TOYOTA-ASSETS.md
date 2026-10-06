# Toyota theme assets

- `public/toyota/toyota-logo.svg`: unmodified horizontal-logo artwork published at https://brand.toyota.com/content/dam/brandhub/guidelines/logo/two-column/BHUB_Logo_ToyotaLogo_01.svg. The image is displayed through a CSS viewport that removes its demonstration artboard margins. Source guidelines: https://brand.toyota.com/guidelines/visual/logos.
- Brand palette reference: https://brand.toyota.com/guidelines/visual/brand-colors (Toyota red `#EB0A1E`, black, white). The dark-mode UI uses a lighter red for readable small controls.
- `public/toyota/car-hero.webp`: AI-generated illustrative sports coupe, generated with the built-in image-generation tool in generation mode with `transparent_background: true`, then encoded as WebP using Sharp. It is decorative, and does not represent an offered vehicle or verified model specification. Original generated file remains in the local generated-images directory.
- `public/favicon.svg`: original code-native car icon; not a Toyota emblem.

## Car-image prompt

Use case: ads-marketing. Asset type: transparent product cutout for a premium Toyota-themed feedback website hero. Create a photorealistic scarlet-red Toyota GR86-inspired sports coupe, shown in a dynamic low front three-quarter view, front nose pointing to the left and rear extending to the right. Entire car visible, including all wheels and roof, with generous transparent margin around it. Deep glossy Toyota-red paint, black alloy wheels, crisp LED headlamps, black grille, convincing studio reflections and realistic automotive proportions. The car occupies most of a wide 3:2 composition. Clean alpha transparency, no floor, no environment, no opaque background, no text, no watermark, no extra graphic elements. Strong upper-right softbox highlights suitable for placing on a dark graphite background. A beautiful, realistic automotive campaign image, not a cartoon. Keep small existing vehicle badge natural and unobtrusive; do not add promotional lettering or invented model/specification labels.

## Motion

Ambient motion is CSS-based rather than a large GIF. Road markings and small lighting streaks animate behind the static car asset. A pause/play button stops all three loops. System reduced-motion preferences disable ambient motion and hide the unneeded control. No autoplay sound or video is used.
