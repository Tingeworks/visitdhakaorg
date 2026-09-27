// Fluted glass over the top and bottom of the homepage hero photo, drawn with WebGL.
//
// The photo is split into vertical ribs. Each rib acts like a strip of reeded glass: it flips and magnifies the image
// behind it and smears it vertically. The effect is full strength at the top and bottom edges of the hero and clears
// within about a quarter of its height, at a slightly different depth per rib, so the inner edges read as drips rather
// than straight lines. The middle, behind the text, stays clear. The photo and its crop come from --vd-hero-image and
// --vd-hero-focus-y in custom.css, so the canvas lines up with the CSS fallback.
//
// The canvas is drawn only when something changes (load, resize, pointer). Without WebGL, or if the image fails to load,
// no canvas is added and the plain CSS photo shows.

const VERTEX = `
attribute vec2 aPos;
void main() {
	gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const FRAGMENT = `
precision highp float;
uniform sampler2D uImage;
uniform vec2 uRes;
uniform vec2 uImg;
uniform float uFocusY;
uniform float uRib;
uniform float uShift;

float hash(float n) {
	return fract(sin(n * 127.1) * 43758.5453);
}

// The photo at a point in canvas pixels (top-left origin), cropped like background-size: cover.
vec3 photo(vec2 p) {
	float scale = max(uRes.x / uImg.x, uRes.y / uImg.y);
	vec2 size = uImg * scale;
	vec2 offset = (uRes - size) * vec2(0.5, uFocusY);
	return texture2D(uImage, clamp((p - offset) / size, 0.0, 1.0)).rgb;
}

void main() {
	vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
	float rib = floor(p.x / uRib);
	float across = fract(p.x / uRib) * 2.0 - 1.0;
	float r1 = hash(rib + 1.0);
	float r2 = hash(rib + 17.0);
	float r3 = hash(rib + 43.0);

	// A band at the top and a shallower one at the bottom, each with its own drip depth per rib.
	float y = p.y / uRes.y;
	float top = 1.0 - smoothstep(0.02, 0.12 + 0.14 * r1, y);
	float bottom = 1.0 - smoothstep(0.02, 0.1 + 0.12 * r3, 1.0 - y);
	float strength = max(top, bottom);
	if (strength <= 0.0) {
		gl_FragColor = vec4(photo(p), 1.0);
		return;
	}

	// Each rib flips and magnifies the strip behind it, offset a little per rib and by the pointer.
	float center = (rib + 0.5) * uRib + (r1 - 0.5 + uShift * 0.5) * uRib * 0.8 * strength;
	float x = center + across * uRib * 0.5 * mix(1.0, -0.45, strength);

	// Vertical smear, longer on some ribs than others, pulled towards the edge each band hangs from.
	float spread = strength * uRes.y * (0.03 + 0.07 * r2);
	float lift = strength * uRes.y * 0.04 * r1 * (top >= bottom ? 1.0 : -1.0);
	vec3 color = vec3(0.0);
	for (int i = 0; i < 12; i++) {
		float t = float(i) / 11.0 - 0.5;
		color += photo(vec2(x, p.y - lift + t * spread));
	}
	color /= 12.0;

	// Light catching each rib's crest, and shade where ribs meet.
	color += strength * 0.05 * (1.0 - across * across);
	color *= 1.0 - strength * 0.18 * pow(abs(across), 5.0);
	gl_FragColor = vec4(color, 1.0);
}
`;

function compile(gl: WebGLRenderingContext, type: number, source: string) {
	const shader = gl.createShader(type)!;
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'shader');
	return shader;
}

function start(hero: HTMLElement) {
	const style = getComputedStyle(hero);
	const src = style.getPropertyValue('--vd-hero-image').match(/url\(\s*['"]?([^'")]+)/)?.[1];
	const focusY = parseFloat(style.getPropertyValue('--vd-hero-focus-y')) / 100;
	if (!src || Number.isNaN(focusY)) return;

	const canvas = document.createElement('canvas');
	canvas.className = 'vd-hero-glass';
	canvas.setAttribute('aria-hidden', 'true');
	const gl = canvas.getContext('webgl', { alpha: false, antialias: false });
	if (!gl) return;

	let program: WebGLProgram;
	try {
		program = gl.createProgram()!;
		gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
		gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
		gl.linkProgram(program);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
	} catch {
		return;
	}
	gl.useProgram(program);

	gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
	const aPos = gl.getAttribLocation(program, 'aPos');
	gl.enableVertexAttribArray(aPos);
	gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

	const uniform = (name: string) => gl.getUniformLocation(program, name);
	const uRes = uniform('uRes');
	const uImg = uniform('uImg');
	const uRib = uniform('uRib');
	const uShift = uniform('uShift');
	gl.uniform1f(uniform('uFocusY'), focusY);

	let shift = 0;
	let targetShift = 0;
	let frame = 0;

	const draw = () => {
		frame = 0;
		shift += (targetShift - shift) * 0.08;
		if (Math.abs(targetShift - shift) < 0.001) shift = targetShift;
		gl.uniform1f(uShift, shift);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
		if (shift !== targetShift) frame = requestAnimationFrame(draw);
	};
	const requestDraw = () => {
		if (!frame) frame = requestAnimationFrame(draw);
	};

	const resize = () => {
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		const width = Math.round(canvas.clientWidth * dpr);
		const height = Math.round(canvas.clientHeight * dpr);
		if (!width || !height) return;
		canvas.width = width;
		canvas.height = height;
		gl.viewport(0, 0, width, height);
		gl.uniform2f(uRes, width, height);
		// Fewer, wider ribs on smaller screens: 6 ribs (about 62px each) on a 375px phone, rising steadily to 36 (40px)
		// at 1440px, and at most 48. A whole number of ribs spans the width, so none is cut off at the edge.
		const ribs = Math.min(48, Math.max(6, Math.round(6 + ((canvas.clientWidth - 375) * 30) / 1065)));
		gl.uniform1f(uRib, (canvas.clientWidth / ribs) * dpr);
		// Resizing clears the canvas, so redraw straight away rather than on the next frame.
		cancelAnimationFrame(frame);
		draw();
	};

	const image = new Image();
	image.decoding = 'async';
	image.onload = () => {
		gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
		gl.uniform2f(uImg, image.naturalWidth, image.naturalHeight);

		hero.prepend(canvas);
		resize();
		new ResizeObserver(resize).observe(canvas);
		// Fade in: read the layout once so the starting opacity is applied before the class changes it.
		canvas.getBoundingClientRect();
		canvas.classList.add('is-ready');

		// The glass shifts a little as the pointer moves across the hero. Not for touch, or with reduced motion.
		const still = matchMedia('(prefers-reduced-motion: reduce)');
		hero.addEventListener('pointermove', (event) => {
			if (still.matches || event.pointerType !== 'mouse') return;
			targetShift = (event.clientX / window.innerWidth) * 2 - 1;
			requestDraw();
		});
		hero.addEventListener('pointerleave', () => {
			targetShift = 0;
			requestDraw();
		});
	};
	image.src = src;

	// If the GPU drops the context, fall back to the CSS photo.
	canvas.addEventListener('webglcontextlost', () => canvas.remove());
}

const hero = document.querySelector<HTMLElement>('[data-has-hero] .hero');
if (hero) start(hero);
