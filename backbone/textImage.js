const path = require('path');
const { createCanvas, registerFont } = require('canvas');

const registeredFonts = new Set();

function registerFontIfNeeded(fontPath, fontFamily, fontWeight) {
  if (!fontPath || !fontFamily) return;

  const resolvedPath = path.resolve(fontPath);
  const key = `${resolvedPath}:${fontFamily}:${fontWeight || 'normal'}`;
  if (registeredFonts.has(key)) return;

  registerFont(resolvedPath, {
    family: fontFamily,
    weight: fontWeight || 'normal'
  });
  registeredFonts.add(key);
}

function cssFont({ fontSize, fontFamily, fontWeight }) {
  const size = fontSize || 24;
  const family = fontFamily || 'sans-serif';
  return `${fontWeight || '400'} ${size}px "${family}"`;
}

function wrapText(ctx, text, maxWidth) {
  const paragraphs = String(text).split(/\r?\n/);
  const lines = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }

    let line = '';
    for (const word of words) {
      const nextLine = line ? `${line} ${word}` : word;
      if (ctx.measureText(nextLine).width <= maxWidth || !line) {
        line = nextLine;
      } else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }

  return lines;
}

async function generate(text, options = {}) {
  const {
    maxWidth = 500,
    customHeight,
    fontSize = 24,
    fontPath,
    fontFamily = 'sans-serif',
    fontWeight = '400',
    lineHeight = fontSize * 1.2,
    bgColor = 'transparent',
    textColor = 'black',
    textAlign = 'left',
    verticalAlign = 'top',
    margin = 0
  } = options;

  registerFontIfNeeded(fontPath, fontFamily, fontWeight);

  const width = Math.max(1, Math.ceil(maxWidth));
  const measureCanvas = createCanvas(width, 1);
  const measureCtx = measureCanvas.getContext('2d');
  measureCtx.font = cssFont({ fontSize, fontFamily, fontWeight });

  const usableWidth = Math.max(1, width - margin * 2);
  const lines = wrapText(measureCtx, text, usableWidth);
  const height = Math.max(1, Math.ceil(customHeight || (lines.length * lineHeight + margin * 2)));

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.font = cssFont({ fontSize, fontFamily, fontWeight });
  ctx.fillStyle = bgColor;
  if (bgColor !== 'transparent') {
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.clearRect(0, 0, width, height);
  }

  ctx.fillStyle = textColor;
  ctx.textBaseline = 'top';
  ctx.textAlign = textAlign;

  let x = margin;
  if (textAlign === 'center') x = width / 2;
  if (textAlign === 'right') x = width - margin;

  let y = margin;
  const textHeight = lines.length * lineHeight;
  if (verticalAlign === 'center') {
    y = (height - textHeight) / 2;
  } else if (verticalAlign === 'bottom') {
    y = height - textHeight - margin;
  }

  for (const line of lines) {
    ctx.fillText(line, x, y, usableWidth);
    y += lineHeight;
  }

  return canvas.toDataURL('image/png');
}

module.exports = { generate };
