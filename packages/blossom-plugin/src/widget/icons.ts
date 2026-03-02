/**
 * @blossom/plugin/icons — Centralised Material Symbol SVG icon library.
 *
 * Each export is a function that returns an SVG string at the requested size.
 * All icons use the Google Material Symbols "Rounded" variant (fill=1, 24 px
 * design grid mapped to `0 -960 960 960`).
 *
 * Usage inside Svelte templates:
 * ```svelte
 * {@html iconUploadFile(18)}
 * ```
 *
 * Usage in TypeScript (e.g. plugin `icon` field):
 * ```ts
 * icon: iconGroups(18),
 * ```
 *
 * @module
 */

// ─── Helper ──────────────────────────────────────────────────────────────────

/** Wrap a raw `<path>` in a sized `<svg>` using the Material 960×960 viewBox. */
function mat(d: string, size: number, style?: string): string {
  const s = style ? ` style="${style}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 -960 960 960" fill="currentColor"${s}><path d="${d}"/></svg>`;
}

// ─── Path data (deduplicated) ────────────────────────────────────────────────

/** upload_file — file with upward arrow */
const PATH_UPLOAD_FILE =
  'M440-200h80v-167l64 64 56-57-160-160-160 160 57 56 63-63v167ZM240-80q-33 0-56.5-23.5T160-160v-640q0-33 23.5-56.5T240-880h320l240 240v480q0 33-23.5 56.5T720-80H240Zm280-520v-200H240v640h480v-440H520ZM240-800v200-200 640-640Z';

/** photo_library — overlapping image frames (gallery / Mediathek) */
const PATH_GALLERY =
  'M360-440h400L622-620l-92 120-62-80-108 140ZM120-120q-33 0-56.5-23.5T40-200v-520h80v520h680v80H120Zm160-160q-33 0-56.5-23.5T200-360v-440q0-33 23.5-56.5T280-880h200l80 80h280q33 0 56.5 23.5T920-720v360q0 33-23.5 56.5T840-280H280Zm0-80h560v-360H527l-80-80H280v440Zm0 0v-440 440Z';

/** auto_awesome — sparkle / magic wand (image generation) */
const PATH_AUTO_AWESOME =
  'm176-120-56-56 301-302-181-45 198-123-17-234 179 151 216-88-87 217 151 178-234-16-124 198-45-181-301 301Zm24-520-80-80 80-80 80 80-80 80Zm355 197 48-79 93 7-60-71 35-86-86 35-71-59 7 92-79 49 90 22 23 90Zm165 323-80-80 80-80 80 80-80 80ZM569-570Z';

/** sync — two curved arrows (refresh / retry) */
const PATH_SYNC =
  'M204-318q-22-38-33-78t-11-82q0-134 93-228t227-94h7l-64-64 56-56 160 160-160 160-56-56 64-64h-7q-100 0-170 70.5T240-478q0 26 6 51t18 49l-60 60ZM481-40 321-200l160-160 56 56-64 64h7q100 0 170-70.5T720-482q0-26-6-51t-18-49l60-60q22 38 33 78t11 82q0 134-93 228t-227 94h-7l64 64-56 56Z';

/** edit — pencil (edit / new prompt) */
const PATH_EDIT =
  'M200-200h57l391-391-57-57-391 391v57Zm-80 80v-170l528-527q12-11 26.5-17t30.5-6q16 0 31 6t26 18l55 56q12 11 17.5 26t5.5 30q0 16-5.5 30.5T817-647L290-120H120Zm640-584-56-56 56 56Zm-141 85-28-29 57 57-29-28Z';

/** tune — horizontal sliders (settings / tune) */
const PATH_TUNE =
  'M520-600v-80h120v-160h80v160h120v80H520Zm120 480v-400h80v400h-80Zm-400 0v-160H120v-80h320v80H320v160h-80Zm0-320v-400h80v400h-80Z';

/** check — checkmark (success) */
const PATH_CHECK =
  'M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z';

/** warning — triangle with exclamation (error) */
const PATH_WARNING =
  'm40-120 440-760 440 760H40Zm138-80h604L480-720 178-200Zm302-40q17 0 28.5-11.5T520-280q0-17-11.5-28.5T480-320q-17 0-28.5 11.5T440-280q0 17 11.5 28.5T480-240Zm-40-120h80v-200h-80v200Zm40-100Z';

/** public — globe (publishing / broadcast) */
const PATH_PUBLIC =
  'M480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm-40-82v-78q-33 0-56.5-23.5T360-320v-40L168-552q-3 18-5.5 36t-2.5 36q0 121 79.5 212T440-162Zm276-68q26-36 43-77.5t23-87.5H660q-8 20-21 37t-31 31l108 97Z';

/** groups — community / people cluster */
const PATH_GROUPS =
  'M617.5-587.5Q600-605 600-630t17.5-42.5Q635-690 660-690t42.5 17.5Q720-655 720-630t-17.5 42.5Q685-570 660-570t-42.5-17.5Zm-360 0Q240-605 240-630t17.5-42.5Q275-690 300-690t42.5 17.5Q360-655 360-630t-17.5 42.5Q325-570 300-570t-42.5-17.5Zm180 110Q420-495 420-520t17.5-42.5Q455-580 480-580t42.5 17.5Q540-545 540-520t-17.5 42.5Q505-460 480-460t-42.5-17.5Zm0-220Q420-715 420-740t17.5-42.5Q455-800 480-800t42.5 17.5Q540-765 540-740t-17.5 42.5Q505-680 480-680t-42.5-17.5Zm2 534.5q-20.5-3-39.5-8v-143q0-35 23.5-60.5T480-400q33 0 56.5 25.5T560-314v143q-19 5-39.5 8t-40.5 3q-20 0-40.5-3ZM340-192q-20-8-38.5-18T266-232q-28-20-44.5-52T205-352q0-26-5.5-48.5T180-443q-10-13-37.5-39.5T92-532q-11-11-11-28t11-28q11-11 28-11t28 11l153 145q20 18 29.5 42.5T340-350v158Zm280 0v-158q0-26 10-51t29-42l153-145q12-11 28.5-11t27.5 11q11 11 11 28t-11 28q-23 23-50.5 49T780-443q-14 20-19.5 42.5T755-352q0 36-16.5 68.5T693-231q-16 11-34.5 21T620-192Z';

/** school — graduation cap with broadcast (OER / Edufeed) */
const PATH_SCHOOL =
  'm590-488 160-92-160-92-160 92 160 92Zm0 122 110-64v-84l-110 64-110-64v84l110 64ZM480-480Zm320 320H600q0-20-1.5-40t-4.5-40h206v-480H160v46q-20-3-40-4.5T80-680v-40q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720v480q0 33-23.5 56.5T800-160Zm-720 0v-120q50 0 85 35t35 85H80Zm200 0q0-83-58.5-141.5T80-360v-80q117 0 198.5 81.5T360-160h-80Zm160 0q0-75-28.5-140.5t-77-114q-48.5-48.5-114-77T80-520v-80q91 0 171 34.5T391-471q60 60 94.5 140T520-160h-80Z';

/** content_paste_go — paste/insert into target field */
const PATH_CONTENT_PASTE =
  'm720-120-56-57 63-63H480v-80h247l-63-64 56-56 160 160-160 160Zm120-400h-80v-240h-80v120H280v-120h-80v560h200v80H200q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h167q11-35 43-57.5t70-22.5q40 0 71.5 22.5T594-840h166q33 0 56.5 23.5T840-760v240ZM508.5-771.5Q520-783 520-800t-11.5-28.5Q497-840 480-840t-28.5 11.5Q440-817 440-800t11.5 28.5Q463-760 480-760t28.5-11.5Z';

// ─── Public API ──────────────────────────────────────────────────────────────

/** File upload icon. */
export const iconUploadFile = (size = 18, style?: string) => mat(PATH_UPLOAD_FILE, size, style);

/** Photo library / gallery icon (Mediathek). */
export const iconGallery = (size = 18, style?: string) => mat(PATH_GALLERY, size, style);

/** Auto-awesome / sparkle icon (image generation). */
export const iconAutoAwesome = (size = 18, style?: string) => mat(PATH_AUTO_AWESOME, size, style);

/** Sync / refresh icon. */
export const iconSync = (size = 18, style?: string) => mat(PATH_SYNC, size, style);

/** Edit / pencil icon. */
export const iconEdit = (size = 18, style?: string) => mat(PATH_EDIT, size, style);

/** Tune / settings sliders icon. */
export const iconTune = (size = 18, style?: string) => mat(PATH_TUNE, size, style);

/** Checkmark / success icon. */
export const iconCheck = (size = 18, style?: string) => mat(PATH_CHECK, size, style);

/** Warning / error triangle icon. */
export const iconWarning = (size = 18, style?: string) => mat(PATH_WARNING, size, style);

/** Globe / publish icon. */
export const iconPublic = (size = 18, style?: string) => mat(PATH_PUBLIC, size, style);

/** Groups / community icon. */
export const iconGroups = (size = 18, style?: string) => mat(PATH_GROUPS, size, style);

/** Graduation cap / OER-Edufeed icon. */
export const iconSchool = (size = 18, style?: string) => mat(PATH_SCHOOL, size, style);

/** Paste / insert-into-field icon. */
export const iconPaste = (size = 18, style?: string) => mat(PATH_CONTENT_PASTE, size, style);
