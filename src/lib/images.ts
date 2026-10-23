import { join } from 'node:path';
import sharp from 'sharp';

type Size = { width: number; height: number };

const sizes = new Map<string, Promise<Size | undefined>>();

/**
 * The pixel size of a photo served from `public/`, given its site path (`/uploads/areas/old-dhaka.jpg`), read once per
 * build. Used for an image's width and height attributes, so the page reserves its space before it loads. Undefined
 * if the file isn't there or can't be read, in which case the image is rendered without them.
 */
export function imageSize(publicPath: string): Promise<Size | undefined> {
	let size = sizes.get(publicPath);
	if (!size) {
		size = sharp(join(process.cwd(), 'public', publicPath))
			.metadata()
			.then(({ width, height }) => (width && height ? { width, height } : undefined))
			.catch(() => undefined);
		sizes.set(publicPath, size);
	}
	return size;
}
