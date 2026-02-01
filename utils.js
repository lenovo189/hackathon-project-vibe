/**
 * Lens - Utilities
 */

function convertToTailwind(styles) {
    const classes = [];

    // Color mapping (simplified)
    if (styles.color !== 'rgba(0, 0, 0, 0)') {
        // Just as an example, actual mapping needs a color library or heuristic
        classes.push('text-[' + styles.color + ']');
    }

    // BG Color
    if (styles.backgroundColor !== 'rgba(0, 0, 0, 0)' && styles.backgroundColor !== 'transparent') {
        classes.push('bg-[' + styles.backgroundColor + ']');
    }

    // Font Size
    const size = parseInt(styles.fontSize);
    if (size) {
        if (size <= 12) classes.push('text-xs');
        else if (size <= 14) classes.push('text-sm');
        else if (size <= 16) classes.push('text-base');
        else if (size <= 18) classes.push('text-lg');
        else if (size <= 20) classes.push('text-xl');
        else classes.push(`text-[${styles.fontSize}]`);
    }

    // Padding
    if (styles.padding !== '0px') {
        classes.push(`p-[${styles.padding}]`);
    }

    // Margin
    if (styles.margin !== '0px') {
        classes.push(`m-[${styles.margin}]`);
    }

    // Border Radius
    if (styles.borderRadius !== '0px') {
        classes.push(`rounded-[${styles.borderRadius}]`);
    }

    return classes.join(' ');
}

// Basic WCAG Contrast Check
function checkContrast(color, bgColor) {
    if (!color || !bgColor) return "N/A";

    function getLuminance(c) {
        const rgb = c.match(/\d+/g);
        if (!rgb) return 0;
        const [r, g, b] = rgb.map(v => {
            const s = v / 255;
            return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }

    const l1 = getLuminance(color);
    const l2 = getLuminance(bgColor);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

    if (ratio >= 7) return "AAA (" + ratio.toFixed(1) + ")";
    if (ratio >= 4.5) return "AA (" + ratio.toFixed(1) + ")";
    return "Fail (" + ratio.toFixed(1) + ")";
}

