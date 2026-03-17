/**
 * Image URL transformations for the product catalog.
 * Generates CDN-compatible URLs with resize parameters, format conversion,
 * and responsive srcset attributes for product images.
 *
 * All transformations are URL-based (no server-side processing) — the CDN
 * handles actual resizing via query parameters or path segments.
 *
 * @see {@link ../models/product.ts} for Product.images field
 */

/** Supported image formats for CDN conversion */
export type ImageFormat = 'webp' | 'avif' | 'jpeg' | 'png';

/** Standard thumbnail sizes for product listings */
export interface ThumbnailPreset {
  name: string;
  width: number;
  height: number;
  quality: number;
}

/** Default thumbnail presets used across the catalog */
export const THUMBNAIL_PRESETS: ThumbnailPreset[] = [
  { name: 'thumb', width: 150, height: 150, quality: 80 },
  { name: 'card', width: 400, height: 400, quality: 85 },
  { name: 'detail', width: 800, height: 800, quality: 90 },
  { name: 'zoom', width: 1600, height: 1600, quality: 95 },
];

/** CDN configuration for image URL generation */
export interface CdnConfig {
  baseUrl: string;
  pathPrefix: string;
}

const DEFAULT_CDN: CdnConfig = {
  baseUrl: 'https://cdn.shopflow.io',
  pathPrefix: '/images/products',
};

/**
 * Build a CDN URL for a product image with resize and format parameters.
 * The CDN interprets width, height, quality, and format as query params.
 */
export function buildImageUrl(
  imagePath: string,
  width: number,
  height: number,
  options: { quality?: number; format?: ImageFormat; cdn?: CdnConfig } = {},
): string {
  const cdn = options.cdn ?? DEFAULT_CDN;
  const quality = options.quality ?? 85;
  const format = options.format ?? 'webp';
  const cleanPath = imagePath.replace(/^\/+/, '');

  return `${cdn.baseUrl}${cdn.pathPrefix}/${cleanPath}?w=${width}&h=${height}&q=${quality}&fm=${format}&fit=cover`;
}

/**
 * Generate a thumbnail URL using a named preset.
 * Falls back to the 'card' preset if the name is not recognized.
 */
export function getThumbnailUrl(imagePath: string, presetName: string, cdn?: CdnConfig): string {
  const preset = THUMBNAIL_PRESETS.find(p => p.name === presetName) ?? THUMBNAIL_PRESETS[1];
  return buildImageUrl(imagePath, preset.width, preset.height, {
    quality: preset.quality,
    cdn,
  });
}

/**
 * Generate a responsive srcset string for an image.
 * Produces entries at 1x, 1.5x, and 2x of the base dimensions.
 */
export function generateSrcSet(
  imagePath: string,
  baseWidth: number,
  baseHeight: number,
): string {
  const multipliers = [1, 1.5, 2];
  return multipliers
    .map(m => {
      const w = Math.round(baseWidth * m);
      const h = Math.round(baseHeight * m);
      const url = buildImageUrl(imagePath, w, h);
      return `${url} ${m}x`;
    })
    .join(', ');
}
