# SignVerse Professional Illustration Master

## Decision

The runtime avatar must not be redrawn from procedural circles, capsules, or generic geometric
primitives. The approved character artwork in `assets/avatar/` is now the visual source of truth for
future rig integration.

The illustration preserves the established SignVerse identity: warm brown skin, a dark side-parted
short bob, a violet short-sleeve tunic, white V neckline, teal checkmark badge, and dark indigo
trousers. Its proportions, silhouette, hands, and joint transitions were designed before adapting
the artwork to the existing skeleton.

## Assets

- `source/signverse-interpreter-master.png`: transparent full-character illustration source.
- `vector/signverse-interpreter-master.svg`: traced full-character vector master.
- `source/signverse-interpreter-parts.png`: transparent separated-parts source.
- `vector/signverse-interpreter-parts.svg`: traced separated-parts vector master.
- `vector/parts/*.svg`: cleaned individual vector components for rig authoring.
- `avatar-artwork.json`: provenance, identity, and integration constraints.

The PNG files are retained as visual references for reviewing trace fidelity. Runtime integration
must use cleaned, layered vector components derived from the vector masters.

## Quality gates

The full-character vector was rendered at full scale and at floating-interpreter scale. Review
confirmed that the face, hair, uniform, badge, hand silhouette, and body proportions remain readable
after vectorization.

The separated-parts sheet provides consistent artwork for the head, neck, torso, sleeves, arms,
forearms, palms, fingers, pelvis, legs, and shoes. It is an authoring reference, not a sprite sheet
to display directly. Each individual component was cropped, alpha-cleaned, vectorized, and rendered
independently to ensure that neighboring artwork fragments were not retained in the rig assets.

## Runtime integration

The current playback system, `RendererFactory`, `AvatarAnimationEngine`, MediaPipe-derived clip
format, skeletal joint names, and MP4 fallback remain unchanged. The runtime now:

1. loads the traced head, neck, torso, pelvis, upper-arm, and forearm artwork through Vite-managed
   asset URLs;
2. registers those components inside the existing torso, neck, shoulder, elbow, and wrist hierarchy;
3. retains the articulated palms and MCP, PIP, DIP, and thumb joints needed for ISL hand shapes;
4. preserves fixed bone lengths and joint-local rotation playback;
5. keeps compact facial controls aligned to the illustrated face for blinking, gaze, and non-manual
   expression markers; and
6. falls back to validated MP4 assets through the unchanged renderer contract when an animation
   clip is unavailable.

The full-character master remains a review reference rather than a static runtime sprite. Using the
layered parts prevents a visual upgrade from removing real-time signing or finger articulation.

Visual regression checks cover neutral rest and locally authorized active clips. Generated runtime
screenshots remain local and are intentionally excluded from source control.

## Prompt record

The final concept requested an original commercial editorial-vector accessibility assistant in the
existing SignVerse violet, indigo, white, and teal identity, with correct human proportions, visible
hands, natural shoulder and arm anatomy, flat chroma-key background, and no third-party character,
photograph, dataset signer, primitive mannequin construction, or watermark.
