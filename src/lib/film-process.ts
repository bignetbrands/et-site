import sharp from "sharp";

/**
 * Apply cinematic Super 8mm film artifacts to a DALL-E image.
 * Transforms clean AI output into something that looks like
 * a real analog film still — warm, grainy, intimate, documentary feel.
 *
 * Pipeline:
 * 1. Desaturate + warm amber/brown tint (Super 8mm color)
 * 2. Slightly underexpose
 * 3. Heavy film grain (coarse, with color variation)
 * 4. Dust & scratches overlay
 * 5. Warm light leak (amber/orange bleed from random edge)
 * 6. Heavy vignette (dark edges)
 * 7. Scan lines (subtle)
 * 8. Soft focus (kill AI sharpness)
 * 9. JPEG compression artifacts
 */
export async function applyFilmGrain(imageBuffer: Buffer): Promise<Buffer> {
  const size = 1024;

  // --- STEP 1: Base image — desaturate, warm tint, slight underexpose ---
  let processed = sharp(imageBuffer)
    .resize(size, size, { fit: "cover" })
    .modulate({
      saturation: 0.4, // Muted but not dead — warm film retains some color
      brightness: 0.75, // Slightly underexposed, cinematic
    })
    // Warm muted tint — amber/brown, like Super 8mm film stock
    .tint({ r: 200, g: 180, b: 155 })
    // Soften AI sharpness
    .blur(0.9);

  const baseBuffer = await processed.png().toBuffer();

  // --- STEP 2: Generate layers ---
  const grainBuffer = await generateGrainLayer(size);
  const vignetteBuffer = await generateVignette(size);
  const scanLineBuffer = await generateScanLines(size);
  const dustBuffer = await generateDustAndScratches(size);
  const lightLeakBuffer = await generateLightLeak(size);

  // --- STEP 3: Apply opacity to layers that need it ---
  const grainWithOpacity = await applyOpacity(grainBuffer, 0.55);
  const dustWithOpacity = await applyOpacity(dustBuffer, 0.3);
  const lightLeakWithOpacity = await applyOpacity(lightLeakBuffer, 0.2);
  const scanLineWithOpacity = await applyOpacity(scanLineBuffer, 0.08);

  // --- STEP 4: Composite all layers ---
  let final = sharp(baseBuffer)
    .composite([
      // Heavy film grain
      {
        input: grainWithOpacity,
        blend: "overlay",
      },
      // Dust and scratches
      {
        input: dustWithOpacity,
        blend: "screen",
      },
      // Light leak (warm amber edge bleed — subtle)
      {
        input: lightLeakWithOpacity,
        blend: "screen",
      },
      // Vignette (very dark edges)
      {
        input: vignetteBuffer,
        blend: "multiply",
      },
      // Scan lines
      {
        input: scanLineWithOpacity,
        blend: "overlay",
      },
    ]);

  // --- STEP 5: Final color grade ---
  const composited = await final.png().toBuffer();

  const result = await sharp(composited)
    .modulate({
      brightness: 0.9,
    })
    // Warm gamma — push amber/brown tones
    .gamma(1.6, 1.8)
    // JPEG compression artifacts — like resaved a few times, not completely destroyed
    .jpeg({ quality: 48 })
    .toBuffer();

  // Back to PNG for Twitter
  const finalPng = await sharp(result).png().toBuffer();

  return finalPng;
}

/**
 * Generate coarse film grain — visible grain structure, not smooth noise.
 */
async function generateGrainLayer(size: number): Promise<Buffer> {
  const channels = 4;
  const pixels = size * size * channels;
  const noiseData = Buffer.alloc(pixels);

  for (let i = 0; i < pixels; i += channels) {
    // Coarser grain — wider spread, more visible
    const grain = Math.floor(128 + (Math.random() - 0.5) * 200);
    // Slight color variation in grain (not pure gray — real film grain has color)
    const rShift = Math.floor((Math.random() - 0.5) * 20);
    const gShift = Math.floor((Math.random() - 0.5) * 15);
    noiseData[i] = Math.max(0, Math.min(255, grain + rShift));
    noiseData[i + 1] = Math.max(0, Math.min(255, grain + gShift));
    noiseData[i + 2] = grain;
    noiseData[i + 3] = 255;
  }

  // Slightly blur for organic grain clumps (not pixel-sharp noise)
  return sharp(noiseData, {
    raw: { width: size, height: size, channels: 4 },
  })
    .blur(0.8)
    .png()
    .toBuffer();
}

/**
 * Generate radial vignette — HEAVY dark edges, like a cheap lens.
 */
async function generateVignette(size: number): Promise<Buffer> {
  const channels = 4;
  const pixels = size * size * channels;
  const vignetteData = Buffer.alloc(pixels);

  const cx = size / 2;
  const cy = size / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * channels;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const normalized = dist / maxDist;

      // Aggressive but not total blackout — need to see figure proportions
      const brightness = Math.max(0, Math.min(255,
        Math.floor(255 * (1 - Math.pow(normalized, 1.4) * 0.85))
      ));

      vignetteData[i] = brightness;
      vignetteData[i + 1] = brightness;
      vignetteData[i + 2] = brightness;
      vignetteData[i + 3] = 255;
    }
  }

  return sharp(vignetteData, {
    raw: { width: size, height: size, channels: 4 },
  })
    .blur(25)
    .png()
    .toBuffer();
}

/**
 * Generate horizontal scan lines — subtle CRT/VHS artifact.
 */
async function generateScanLines(size: number): Promise<Buffer> {
  const channels = 4;
  const pixels = size * size * channels;
  const scanData = Buffer.alloc(pixels);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * channels;
      const isLine = y % 4 === 0;
      const brightness = isLine ? 90 : 160;
      scanData[i] = brightness;
      scanData[i + 1] = brightness;
      scanData[i + 2] = brightness;
      scanData[i + 3] = 255;
    }
  }

  return sharp(scanData, {
    raw: { width: size, height: size, channels: 4 },
  })
    .png()
    .toBuffer();
}

/**
 * Generate dust and scratch overlay — random white specks and thin vertical lines.
 * Simulates dust on the negative/scanner and physical scratches on film.
 */
async function generateDustAndScratches(size: number): Promise<Buffer> {
  const channels = 4;
  const pixels = size * size * channels;
  const dustData = Buffer.alloc(pixels);

  // Fill with black (transparent in screen blend)
  for (let i = 0; i < pixels; i += channels) {
    dustData[i] = 0;
    dustData[i + 1] = 0;
    dustData[i + 2] = 0;
    dustData[i + 3] = 255;
  }

  // Add random dust particles (small bright specks)
  const numDust = 200 + Math.floor(Math.random() * 300);
  for (let d = 0; d < numDust; d++) {
    const x = Math.floor(Math.random() * size);
    const y = Math.floor(Math.random() * size);
    const brightness = 150 + Math.floor(Math.random() * 105);
    const spotSize = Math.random() < 0.7 ? 1 : 2;
    
    for (let dy = 0; dy < spotSize; dy++) {
      for (let dx = 0; dx < spotSize; dx++) {
        const px = Math.min(size - 1, x + dx);
        const py = Math.min(size - 1, y + dy);
        const i = (py * size + px) * channels;
        dustData[i] = brightness;
        dustData[i + 1] = brightness;
        dustData[i + 2] = brightness;
      }
    }
  }

  // Add 2-5 vertical scratches (thin bright lines running most of the image height)
  const numScratches = 2 + Math.floor(Math.random() * 4);
  for (let s = 0; s < numScratches; s++) {
    const scratchX = Math.floor(Math.random() * size);
    const startY = Math.floor(Math.random() * (size * 0.3));
    const endY = size - Math.floor(Math.random() * (size * 0.3));
    const brightness = 80 + Math.floor(Math.random() * 80);

    for (let y = startY; y < endY; y++) {
      // Slight wobble in the scratch line
      const wobble = Math.floor(Math.sin(y * 0.05) * 2);
      const x = Math.max(0, Math.min(size - 1, scratchX + wobble));
      const i = (y * size + x) * channels;
      dustData[i] = brightness;
      dustData[i + 1] = brightness;
      dustData[i + 2] = brightness;
    }
  }

  return sharp(dustData, {
    raw: { width: size, height: size, channels: 4 },
  })
    .blur(0.5)
    .png()
    .toBuffer();
}

/**
 * Generate a light leak — orange/magenta color bleed from a random edge.
 * Simulates light leaking into the camera body through a worn seal,
 * common in old/cheap cameras and expired film.
 */
async function generateLightLeak(size: number): Promise<Buffer> {
  const channels = 4;
  const pixels = size * size * channels;
  const leakData = Buffer.alloc(pixels);

  // Pick random edge and color
  const edge = Math.floor(Math.random() * 4); // 0=top, 1=right, 2=bottom, 3=left
  const colors = [
    { r: 255, g: 140, b: 40 },  // warm orange
    { r: 240, g: 180, b: 60 },  // golden amber
    { r: 255, g: 120, b: 50 },  // deep warm orange
    { r: 220, g: 160, b: 80 },  // muted gold
  ];
  const color = colors[Math.floor(Math.random() * colors.length)];
  const leakDepth = 0.15 + Math.random() * 0.2; // How far the leak extends (15-35%)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * channels;

      let intensity = 0;
      switch (edge) {
        case 0: // top
          intensity = Math.max(0, 1 - (y / (size * leakDepth)));
          break;
        case 1: // right
          intensity = Math.max(0, 1 - ((size - x) / (size * leakDepth)));
          break;
        case 2: // bottom
          intensity = Math.max(0, 1 - ((size - y) / (size * leakDepth)));
          break;
        case 3: // left
          intensity = Math.max(0, 1 - (x / (size * leakDepth)));
          break;
      }

      // Curve the falloff for more natural look
      intensity = Math.pow(intensity, 2);

      leakData[i] = Math.floor(color.r * intensity);
      leakData[i + 1] = Math.floor(color.g * intensity);
      leakData[i + 2] = Math.floor(color.b * intensity);
      leakData[i + 3] = 255;
    }
  }

  return sharp(leakData, {
    raw: { width: size, height: size, channels: 4 },
  })
    .blur(40) // Smooth, organic bleed
    .png()
    .toBuffer();
}

/**
 * Apply opacity to a layer by modifying its alpha channel.
 * Sharp's composite doesn't support opacity directly in all versions,
 * so we bake it into the buffer.
 */
async function applyOpacity(pngBuffer: Buffer, opacity: number): Promise<Buffer> {
  const { data, info } = await sharp(pngBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Modify alpha channel
  for (let i = 3; i < data.length; i += 4) {
    data[i] = Math.round(data[i] * opacity);
  }

  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();
}
