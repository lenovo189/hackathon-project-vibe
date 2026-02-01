console.log('[Lens] content.js script loaded and running.');

let lastMouseX = 0;
let lastMouseY = 0;
let inspectEnabled = true;
let lastElement = null;
let overlayElement = null;
let floatingPanel = null;
let selectedElement = null;
let pickingForAI = false;

// Consolidated state management
function setInspectState(enabled) {
    inspectEnabled = !!enabled;
    console.log('[Lens] Inspect Mode:', inspectEnabled ? 'ENABLED' : 'DISABLED');

    // Safety check for body
    if (document.body) {
        document.body.classList.toggle('lens-inspect-mode', inspectEnabled);
    }

    if (!inspectEnabled) {
        if (overlayElement) overlayElement.style.display = 'none';
        if (floatingPanel) floatingPanel.classList.remove('visible');
    } else {
        // Re-check whatever is under the mouse if enabled
        handleInteraction(lastMouseX, lastMouseY);
    }
}

// Sync on load
chrome.storage.local.get(['inspectEnabled'], (res) => {
    setInspectState(res.inspectEnabled !== false); // Default to true if undefined
});

// Sync on change
chrome.storage.onChanged.addListener((changes) => {
    if (changes.inspectEnabled) {
        setInspectState(changes.inspectEnabled.newValue);
    }
});

// Sync via direct message (instant fallback)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[Lens] Message received in content.js:', message);
    const target = selectedElement || lastElement;
    if (message.action === 'setInspect') {
        setInspectState(message.enabled);
    } else if (message.action === 'applyStyles' && message.styles) {
        if (target) {
            console.log('[Lens] Applying AI styles:', message.styles);
            Object.entries(message.styles).forEach(([prop, value]) => {
                target.style[prop] = value;
            });
            // Also notify popup to update its UI with new styles
            syncStoredElement(target);
        }
    } else if (message.action === 'applyEdits') {
        const edits = message.edits;
        console.log('[Lens] Applying AI edits:', edits);

        // Determine the target element for the edits
        let editTarget = null;
        if (edits.selector) {
            editTarget = document.querySelector(edits.selector);
            if (!editTarget) {
                console.warn(`[Lens] AI selector "${edits.selector}" did not find an element.`);
            }
        }

        // Fallback to the currently selected element if no selector is provided or found
        if (!editTarget) {
            editTarget = selectedElement || lastElement;
        }

        if (editTarget) {
            if (edits.styles) {
                Object.entries(edits.styles).forEach(([prop, value]) => {
                    // Only apply style if the value is not empty
                    if (value) {
                        editTarget.style[prop] = value;
                    }
                });
            }
            if (edits.text !== undefined) editTarget.innerText = edits.text;
            if (edits.html !== undefined) editTarget.innerHTML = edits.html;
            if (edits.classes) {
                if (edits.classes.add) edits.classes.add.split(' ').filter(c => c).forEach(c => editTarget.classList.add(c));
                if (edits.classes.remove) edits.classes.remove.split(' ').filter(c => c).forEach(c => editTarget.classList.remove(c));
                if (edits.classes.replace) editTarget.className = edits.classes.replace;
            }

            syncStoredElement(editTarget); // Sync with the element that was actually changed
        } else {
            console.error('[Lens] No target element found to apply edits.');
        }
    } else if (message.action === 'startPickingForAI') {
        pickingForAI = true;
        setInspectState(true); // Ensure inspect is on
        console.log('[Lens] Picking for AI started');
    }
});

function syncStoredElement(el) {
    chrome.storage.local.set({
        currentElement: {
            tagName: el.tagName.toLowerCase(),
            innerText: el.innerText ? el.innerText.substring(0, 50) : '',
            styles: getComputedStyles(el),
            assets: extractAssets(el),
            timestamp: Date.now()
        }
    });
}


// Initialize UI Elements
function createUI() {
    if (!document.getElementById('lens-hover-overlay')) {
        overlayElement = document.createElement('div');
        overlayElement.id = 'lens-hover-overlay';
        overlayElement.className = 'miro-highlight-rect';
        document.documentElement.appendChild(overlayElement);
    }

    if (!document.getElementById('lens-floating-panel')) {
        floatingPanel = document.createElement('div');
        floatingPanel.id = 'lens-floating-panel';
        floatingPanel.style.position = 'fixed';
        floatingPanel.style.zIndex = '999999';
        floatingPanel.style.pointerEvents = 'none';
        document.documentElement.appendChild(floatingPanel);
    }
}

function getComputedStyles(el) {
    const styles = window.getComputedStyle(el);
    return {
        color: styles.color,
        backgroundColor: styles.backgroundColor,
        fontFamily: styles.fontFamily,
        fontSize: styles.fontSize,
        padding: styles.padding,
        margin: styles.margin,
        border: styles.border,
        borderRadius: styles.borderRadius,
        fontWeight: styles.fontWeight,
        lineHeight: styles.lineHeight,
        display: styles.display,
        width: styles.width,
        height: styles.height,
        marginTop: styles.marginTop,
        marginRight: styles.marginRight,
        marginBottom: styles.marginBottom,
        marginLeft: styles.marginLeft,
        backgroundImage: styles.backgroundImage
    };
}

let cachedPalette = [];
function extractGlobalPalette() {
    if (cachedPalette.length > 0) return cachedPalette;
    const colors = new Set();

    // Scan root styles
    [document.documentElement, document.body].forEach(r => {
        if (!r) return;
        const style = window.getComputedStyle(r);
        [style.color, style.backgroundColor].forEach(c => {
            if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') colors.add(c);
        });
    });

    // Scan CSS variables from all stylesheets
    for (let i = 0; i < document.styleSheets.length; i++) {
        try {
            const sheet = document.styleSheets[i];
            const rules = sheet.cssRules || sheet.rules;
            if (!rules) continue;
            for (let j = 0; j < rules.length; j++) {
                const rule = rules[j];
                if (rule.style) {
                    for (let k = 0; k < rule.style.length; k++) {
                        const name = rule.style[k];
                        if (name.startsWith('--')) {
                            const val = rule.style.getPropertyValue(name).trim();
                            if (/^#|rgb|hsl/.test(val)) colors.add(val);
                        }
                    }
                }
            }
        } catch (e) { }
    }

    // Prominent samples
    ['header', 'footer', 'nav', 'h1', 'button'].forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
            const style = window.getComputedStyle(el);
            if (style.backgroundColor && style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent') colors.add(style.backgroundColor);
        });
    });

    cachedPalette = Array.from(colors).slice(0, 18);
    return cachedPalette;
}

function extractAssets(el) {
    const assets = {
        images: [],
        svgs: [],
        lotties: [],
        gradients: [],
        videos: [],
        palette: extractGlobalPalette()
    };
    if (el.tagName === 'IMG') assets.images.push(el.src);
    if (el.tagName === 'svg') assets.svgs.push(el.outerHTML);

    if (el.tagName === 'VIDEO') {
        const videoSrc = el.src || (el.querySelector('source') && el.querySelector('source').src);
        if (videoSrc) {
            assets.videos.push({
                src: videoSrc,
                poster: el.poster || null
            });
        }
    }

    const bgImg = window.getComputedStyle(el).backgroundImage;
    if (bgImg && bgImg !== 'none') {
        const urlMatch = bgImg.match(/url\(['"]?(.*?)['"]?\)/);
        if (urlMatch) {
            assets.images.push(urlMatch[1]);
        } else if (bgImg.includes('-gradient(')) {
            assets.gradients.push(bgImg);
        }
    }

    el.querySelectorAll('img').forEach(img => assets.images.push(img.src));
    el.querySelectorAll('svg').forEach(svg => assets.svgs.push(svg.outerHTML));
    el.querySelectorAll('video').forEach(vid => {
        const vSrc = vid.src || (vid.querySelector('source') && vid.querySelector('source').src);
        if (vSrc) assets.videos.push({ src: vSrc, poster: vid.poster || null });
    });

    document.querySelectorAll('script[type="application/json"]').forEach(script => {
        if (script.textContent.includes('"v":') && script.textContent.includes('"fr":')) {
            if (el.contains(script.parentElement)) assets.lotties.push(script.textContent);
        }
    });
    return assets;
}

function getCSSVariables(el) {
    const vars = {};
    let curr = el;
    while (curr && curr !== document.documentElement) {
        const style = curr.style;
        for (let i = 0; i < style.length; i++) {
            const name = style[i];
            if (name.startsWith('--')) {
                vars[name] = getComputedStyle(curr).getPropertyValue(name).trim();
            }
        }
        curr = curr.parentElement;
    }
    return vars;
}

function updateHighlight(el, mouseX, mouseY) {
    if (!el || el === document.body || el === document.documentElement) {
        if (overlayElement) overlayElement.style.display = 'none';
        if (floatingPanel) floatingPanel.classList.remove('visible');
        return;
    }

    const rect = el.getBoundingClientRect();
    overlayElement.style.display = 'block';
    overlayElement.style.top = `${rect.top}px`;
    overlayElement.style.left = `${rect.left}px`;
    overlayElement.style.width = `${rect.width}px`;
    overlayElement.style.height = `${rect.height}px`;
    overlayElement.style.borderColor = pickingForAI ? '#10b981' : '#6366f1'; // Green for AI pick
    overlayElement.style.borderStyle = pickingForAI ? 'solid' : 'dashed';

    floatingPanel.classList.add('visible');
    floatingPanel.style.left = `${mouseX + 15}px`;
    floatingPanel.style.top = `${mouseY + 15}px`;

    const styles = getComputedStyles(el);
    const fontName = styles.fontFamily.split(',')[0].replace(/"/g, '');
    let bodyHtml = '';

    const allVars = getCSSVariables(el);
    const varEntries = Object.entries(allVars);
    if (varEntries.length > 0) {
        bodyHtml += `<div class="miro-section-label">Variables</div>`;
        varEntries.slice(0, 5).forEach(([name, val]) => {
            const isColor = val.startsWith('#') || val.startsWith('rgba') || val.startsWith('rgb');
            bodyHtml += `
                <div class="miro-value-text" style="grid-column: span 2; display: flex; align-items: center; gap: 4px; font-size: 10px; margin-bottom: 2px;">
                    <span style="color: #6366f1; font-family: monospace;">${name}:</span>
                    ${isColor ? `<div class="miro-color-swatch" style="width: 8px; height: 8px; background-color: ${val}"></div>` : ''}
                    <span style="opacity: 0.7; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${val}</span>
                </div>
            `;
        });
    }

    bodyHtml += `<div class="miro-section-label">Font</div>`;
    bodyHtml += `<div class="miro-value-text" style="grid-column: span 2;">${fontName} · ${styles.fontSize} · ${styles.fontWeight}</div>`;

    if (styles.color !== 'rgba(0, 0, 0, 0)' && el.innerText.trim().length > 0) {
        bodyHtml += `<div class="miro-section-label">Color</div><div class="miro-color-row"><div class="miro-color-swatch" style="background-color: ${styles.color}"></div><div class="miro-value-text">${styles.color}</div></div>`;
    }

    if (styles.backgroundImage && styles.backgroundImage !== 'none' && styles.backgroundImage.includes('-gradient(')) {
        bodyHtml += `<div class="miro-section-label">Gradient</div><div class="miro-color-row"><div class="miro-color-swatch" style="background: ${styles.backgroundImage}; border-radius: 4px;"></div><div class="miro-value-text" style="font-size: 9px; opacity: 0.8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${styles.backgroundImage.substring(0, 20)}...</div></div>`;
    } else if (styles.backgroundColor !== 'rgba(0, 0, 0, 0)' && styles.backgroundColor !== 'transparent') {
        bodyHtml += `<div class="miro-section-label">Background</div><div class="miro-color-row"><div class="miro-color-swatch" style="background-color: ${styles.backgroundColor}"></div><div class="miro-value-text">${styles.backgroundColor}</div></div>`;
    }

    const marginStr = `${styles.marginTop} ${styles.marginRight} ${styles.marginBottom} ${styles.marginLeft}`;
    if (marginStr.replace(/0px/g, '').trim().length > 0) {
        bodyHtml += `<div class="miro-section-label">Margin</div><div class="miro-value-text" style="grid-column: span 2;">${marginStr}</div>`;
    }

    const hasPadding = styles.padding !== '0px';
    const hasRadius = styles.borderRadius !== '0px';
    if (hasPadding || hasRadius) {
        if (hasPadding) bodyHtml += `<div class="miro-section-label" style="grid-column: span 1;">Padding</div>`;
        if (hasRadius) bodyHtml += `<div class="miro-section-label" style="grid-column: span 1;">Radius</div>`;
        if (hasPadding) bodyHtml += `<div class="miro-value-text" style="grid-column: span 1;">${styles.padding}</div>`;
        if (hasRadius) bodyHtml += `<div class="miro-value-text" style="grid-column: span 1;">${styles.borderRadius}</div>`;
    }

    const classStr = el.className && typeof el.className === 'string' ? el.className.split(' ').filter(c => c).join('.') : '';
    const headerTitle = `${el.tagName.toLowerCase()}${classStr ? '.' + classStr : ''}`;

    floatingPanel.innerHTML = `
        <div class="miro-panel-header"><span>${headerTitle.substring(0, 25)}${headerTitle.length > 25 ? '...' : ''}</span></div>
        <div class="miro-panel-body">${bodyHtml}</div>
    `;
}

function handleInteraction(mouseX, mouseY) {
    if (!inspectEnabled) return;
    const el = document.elementFromPoint(mouseX, mouseY);
    if (!el || !(el instanceof Element) || el === overlayElement || el === floatingPanel || (el.closest && el.closest('[id^="lens-"]'))) return;


    if (el !== lastElement) {
        lastElement = el;
    }
    updateHighlight(el, mouseX, mouseY);
}

// Global interactions
const blockedEvents = ['mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu'];
blockedEvents.forEach(type => {
    document.addEventListener(type, (e) => {
        if (!inspectEnabled) return;
        // Don't block our own UI
        if (e.target && e.target instanceof Element && (e.target.id && e.target.id.startsWith('lens-'))) return;
        if (e.target && e.target instanceof Element && e.target.closest && e.target.closest('[id^="lens-"]')) return;

        e.preventDefault();
        e.stopPropagation();

        if (type === 'click') {
            const el = document.elementFromPoint(e.clientX, e.clientY);
            if (!el || !(el instanceof Element) || (el.closest && el.closest('[id^="lens-"]'))) return;

            if (pickingForAI) {
                pickingForAI = false;
                chrome.runtime.sendMessage({
                    action: 'elementPickedForAI',
                    element: {
                        tagName: el.tagName.toLowerCase(),
                        innerText: el.innerText ? el.innerText.substring(0, 50) : '',
                        styles: getComputedStyles(el),
                        assets: extractAssets(el),
                        outerHTML: el.outerHTML,
                        timestamp: Date.now()
                    }
                });
                overlayElement.style.borderColor = '';
                overlayElement.style.borderStyle = '';
                return;
            }

            selectedElement = el;

            syncStoredElement(el);

            if (overlayElement) {
                overlayElement.style.transition = 'all 0.1s ease';
                overlayElement.style.boxShadow = '0 0 20px #6366f1';
                setTimeout(() => {
                    overlayElement.style.boxShadow = '';
                    overlayElement.style.transition = '';
                }, 200);
            }
        }
    }, true);
});

document.addEventListener('mousemove', (e) => {
    lastMouseX = e.clientX; lastMouseY = e.clientY;
    handleInteraction(e.clientX, e.clientY);
}, true);

document.addEventListener('scroll', () => handleInteraction(lastMouseX, lastMouseY), true);
window.addEventListener('resize', () => handleInteraction(lastMouseX, lastMouseY), true);

createUI();
