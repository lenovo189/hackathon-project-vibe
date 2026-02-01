/**
 * MiroMiro Clone - Popup Logic
 */

document.addEventListener('DOMContentLoaded', () => {
    const tagNameEl = document.getElementById('tag-name');
    const innerTextEl = document.getElementById('inner-text');
    const colorEl = document.getElementById('style-color');
    const colorDot = document.getElementById('color-preview');
    const bgEl = document.getElementById('style-bg');
    const bgDot = document.getElementById('bg-preview');
    const fontSizeEl = document.getElementById('style-font-size');
    const paddingEl = document.getElementById('style-padding');
    const marginEl = document.getElementById('style-margin');
    const contrastEl = document.getElementById('style-contrast');
    const fontFamilyEl = document.getElementById('style-font-family');

    const assetsContainer = document.getElementById('assets-container');

    const copyCssBtn = document.getElementById('copy-css');
    const copyTailwindBtn = document.getElementById('copy-tailwind');
    const exportBtn = document.getElementById('export-json');
    const saveBtn = document.getElementById('save-btn');
    const inspectToggle = document.getElementById('inspect-toggle');

    const tabButtons = document.querySelectorAll('.nav-item');
    const tabContents = document.querySelectorAll('.tab-content');

    const designAssetsContainer = document.getElementById('design-assets-container');
    const paletteContainer = document.getElementById('palette-container');
    const mediaAssetsContainer = document.getElementById('media-assets-container');


    let currentElementData = null;

    // Load initial data
    chrome.storage.local.get(['currentElement', 'inspectEnabled'], (result) => {
        if (result.currentElement) {
            updateUI(result.currentElement);
        }
        if (result.inspectEnabled !== undefined) {
            inspectToggle.checked = result.inspectEnabled;
        }
    });

    inspectToggle.onchange = () => {
        const enabled = inspectToggle.checked;
        chrome.storage.local.set({ inspectEnabled: enabled });

        // Notify active tab immediately
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, { action: 'setInspect', enabled: enabled });
            }
        });
    };

    // Tab Switching Logic
    tabButtons.forEach(btn => {
        btn.onclick = () => {
            const tabName = btn.getAttribute('data-tab');

            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === `${tabName}-tab`) {
                    content.classList.add('active');
                }
            });
        };
    });



    // Listen for messages from content script
    chrome.runtime.onMessage.addListener((message) => {
        if (message.action === 'elementPickedForAI') {
            attachedContext.element = message.element;
            renderContextBar();
            addMessage('system', `Attached component: ${message.element.tagName}`);
        }
    });

    // Listen for storage changes
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.currentElement) {
            updateUI(changes.currentElement.newValue);
        }
    });

    function updateUI(data) {
        currentElementData = data;
        const styles = data.styles;

        tagNameEl.textContent = data.tagName;
        innerTextEl.textContent = data.innerText || 'No text content';

        colorEl.textContent = styles.color;
        colorDot.style.backgroundColor = styles.color;

        bgEl.textContent = styles.backgroundColor;
        bgDot.style.backgroundColor = styles.backgroundColor;

        fontSizeEl.textContent = styles.fontSize;
        paddingEl.textContent = styles.padding;
        marginEl.textContent = styles.margin;
        fontFamilyEl.textContent = styles.fontFamily.replace(/"/g, '');

        // Contrast Check
        const contrastResult = checkContrast(styles.color, styles.backgroundColor);
        contrastEl.textContent = contrastResult;
        if (contrastResult.includes('Fail')) contrastEl.style.color = '#ef4444';
        else contrastEl.style.color = '#4ade80';


        // Render assets
        designAssetsContainer.innerHTML = '';
        mediaAssetsContainer.innerHTML = '';
        paletteContainer.innerHTML = '';

        // Color Palette (Design Tab)
        if (data.assets.palette && data.assets.palette.length > 0) {
            // Deduplicate and filter out near-white/near-black if too many
            const uniqueColors = [...new Set(data.assets.palette)];
            uniqueColors.forEach(color => {
                const swatch = document.createElement('div');
                swatch.className = 'palette-swatch';
                swatch.style.backgroundColor = color;
                swatch.title = `Click to copy ${color}`;
                swatch.onclick = () => {
                    copyToClipboard(color);
                    swatch.style.transform = 'scale(0.9)';
                    setTimeout(() => swatch.style.transform = '', 100);
                };
                paletteContainer.appendChild(swatch);
            });
        }

        // Design Tab Assets: SVGs
        if (data.assets.svgs && data.assets.svgs.length > 0) {
            data.assets.svgs.forEach((svg, index) => {
                const thumb = document.createElement('div');
                thumb.className = 'asset-thumb';
                thumb.innerHTML = svg;
                thumb.title = 'Click to download SVG';
                thumb.onclick = () => downloadSVG(svg, `icon-${index}.svg`);
                designAssetsContainer.appendChild(thumb);
            });
        }

        // Design Tab Assets: Gradients
        if (data.assets.gradients && data.assets.gradients.length > 0) {
            data.assets.gradients.forEach((gradient, index) => {
                const thumb = document.createElement('div');
                thumb.className = 'asset-thumb';
                thumb.style.background = gradient;
                thumb.title = 'Click to copy gradient CSS';
                thumb.onclick = () => {
                    copyToClipboard(gradient);
                    thumb.style.border = '2px solid #4ade80';
                    setTimeout(() => thumb.style.border = '', 1000);
                };
                designAssetsContainer.appendChild(thumb);
            });
        }

        // Media Tab Assets: Images
        if (data.assets.images && data.assets.images.length > 0) {
            data.assets.images.forEach(src => {
                const img = document.createElement('img');
                img.src = src;
                const thumb = document.createElement('div');
                thumb.className = 'asset-thumb';
                thumb.title = 'Click to download';
                thumb.appendChild(img);
                thumb.onclick = () => downloadAsset(src, 'image.png');
                mediaAssetsContainer.appendChild(thumb);
            });
        }

        // Media Tab Assets: Lotties
        if (data.assets.lotties && data.assets.lotties.length > 0) {
            data.assets.lotties.forEach((json, index) => {
                const thumb = document.createElement('div');
                thumb.className = 'asset-thumb';
                thumb.textContent = 'JSON';
                thumb.style.fontSize = '10px';
                thumb.title = 'Click to download Lottie JSON';
                thumb.onclick = () => downloadLottie(json, `animation-${index}.json`);
                mediaAssetsContainer.appendChild(thumb);
            });
        }

        // Media Tab Assets: Videos
        if (data.assets.videos && data.assets.videos.length > 0) {
            data.assets.videos.forEach((vid, index) => {
                const thumb = document.createElement('div');
                thumb.className = 'asset-thumb video-thumb';

                const videoEl = document.createElement('video');
                videoEl.src = vid.src;
                videoEl.muted = true;
                videoEl.loop = true;
                videoEl.playsInline = true;
                if (vid.poster) videoEl.poster = vid.poster;

                thumb.appendChild(videoEl);
                thumb.title = 'Hover to play, click to open';

                thumb.onmouseenter = () => videoEl.play().catch(e => console.log('Play blocked', e));
                thumb.onmouseleave = () => videoEl.pause();

                thumb.onclick = () => window.open(vid.src, '_blank');
                mediaAssetsContainer.appendChild(thumb);
            });
        }
    }

    // AI Tab Elements
    const aiApiSetup = document.getElementById('ai-api-setup');
    const aiChatInterface = document.getElementById('ai-chat-interface');
    const geminiApiKeyInput = document.getElementById('gemini-api-key');
    const saveApiKeyBtn = document.getElementById('save-api-key');
    const aiChatMessages = document.getElementById('ai-chat-messages');
    const aiContextBar = document.getElementById('ai-context-bar');
    const aiQueryInput = document.getElementById('ai-query');
    const sendAiQueryBtn = document.getElementById('send-ai-query');
    const attachElementBtn = document.getElementById('attach-element');
    const attachImageBtn = document.getElementById('attach-image');
    const aiImageInput = document.getElementById('ai-image-input');
    const aiApiMissing = document.getElementById('ai-api-missing');
    const goToSettingsBtn = document.getElementById('go-to-settings');

    let attachedContext = {
        element: null,
        images: []
    };

    // Load API Key
    chrome.storage.local.get(['geminiApiKey'], (result) => {
        if (result.geminiApiKey) {
            showChatInterface();
            geminiApiKeyInput.value = result.geminiApiKey;
        }
    });

    goToSettingsBtn.onclick = () => {
        const settingsTabBtn = document.querySelector('.nav-item[data-tab="settings"]');
        if (settingsTabBtn) settingsTabBtn.click();
    };

    saveApiKeyBtn.onclick = () => {
        const key = geminiApiKeyInput.value.trim();
        if (key) {
            chrome.storage.local.set({ geminiApiKey: key }, () => {
                showChatInterface();
            });
        }
    };

    function showChatInterface() {
        if (aiApiMissing) aiApiMissing.classList.add('ai-chat-hidden');
        if (aiChatInterface) aiChatInterface.classList.remove('ai-chat-hidden');
    }

    // AI Logic
    attachElementBtn.onclick = () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, { action: 'startPickingForAI' });
                addMessage('system', 'Click an element on the page to attach it to the chat...');
            }
        });
    };

    attachImageBtn.onclick = () => aiImageInput.click();

    aiImageInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                attachedContext.images.push(event.target.result);
                renderContextBar();
            };
            reader.readAsDataURL(file);
        }
    };

    function renderContextBar() {
        aiContextBar.innerHTML = '';
        if (attachedContext.element) {
            const chip = createChip(`Comp: ${attachedContext.element.tagName}`, () => {
                attachedContext.element = null;
                renderContextBar();
            });
            aiContextBar.appendChild(chip);
        }
        attachedContext.images.forEach((img, idx) => {
            const chip = createChip(`Img ${idx + 1}`, () => {
                attachedContext.images.splice(idx, 1);
                renderContextBar();
            }, img);
            aiContextBar.appendChild(chip);
        });
    }

    function createChip(text, onRemove, imgSrc) {
        const chip = document.createElement('div');
        chip.className = 'context-chip';
        if (imgSrc) {
            const thumb = document.createElement('img');
            thumb.src = imgSrc;
            thumb.className = 'thumbnail-preview';
            chip.appendChild(thumb);
        }
        const span = document.createElement('span');
        span.textContent = text;
        chip.appendChild(span);
        const remove = document.createElement('span');
        remove.textContent = '×';
        remove.className = 'remove-chip';
        remove.onclick = onRemove;
        chip.appendChild(remove);
        return chip;
    }

    aiQueryInput.oninput = () => {
        aiQueryInput.style.height = 'auto';
        aiQueryInput.style.height = (aiQueryInput.scrollHeight) + 'px';
    };

    aiQueryInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendAiQueryBtn.click();
        }
    });

    sendAiQueryBtn.onclick = async () => {
        const query = aiQueryInput.value.trim();
        if (!query) return;

        addMessage('user', query);
        aiQueryInput.value = '';
        aiQueryInput.style.height = 'auto';

        const typingMsg = addMessage('ai', 'Thinking...');
        typingMsg.classList.add('thinking');

        try {
            const result = await callGemini(query, attachedContext);
            typingMsg.classList.remove('thinking');

            // Try to extract JSON from result
            const jsonMatch = result.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    const aiData = JSON.parse(jsonMatch[0]);
                    if (aiData.styles || aiData.text !== undefined || aiData.html !== undefined || aiData.classes) {
                        // Send edits to content script
                        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                            if (tabs[0]) {
                                chrome.tabs.sendMessage(tabs[0].id, {
                                    action: 'applyEdits',
                                    edits: aiData
                                });
                            }
                        });

                        // If result is ONLY JSON, show a nice success message
                        if (result.trim() === jsonMatch[0]) {
                            typingMsg.textContent = 'Edits applied successfully! ✨';
                            return;
                        }
                    }
                } catch (e) {
                    console.log('Not a valid edit JSON', e);
                }
            }

            typingMsg.textContent = result;
        } catch (error) {
            typingMsg.textContent = 'Error: ' + error.message;
            typingMsg.classList.remove('thinking');
        }
    };

    function addMessage(sender, text) {
        const msg = document.createElement('div');
        msg.className = `message ${sender}`;

        // Basic Markdown-ish formatting for system and AI messages
        if (sender !== 'user') {
            text = text.replace(/`([^`]+)`/g, '<code style="background: rgba(0,0,0,0.05); padding: 2px 4px; border-radius: 4px;">$1</code>');
        }

        msg.innerHTML = text;
        aiChatMessages.appendChild(msg);
        aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
        return msg;
    }

    async function callGemini(prompt, context) {
        const result = await chrome.storage.local.get(['geminiApiKey']);
        const apiKey = result.geminiApiKey;
        if (!apiKey) throw new Error('API Key not found');

        const contents = [];
        const parts = [{ text: prompt }];

        if (context.element) {
            parts.push({ text: `Here is the HTML of the component you are editing:\n\`\`\`html\n${context.element.outerHTML}\n\`\`\`` });
        }

        context.images.forEach(img => {
            const base64Data = img.split(',')[1];
            const mimeType = img.split(',')[0].split(':')[1].split(';')[0];
            parts.push({
                inline_data: {
                    mime_type: mimeType,
                    data: base64Data
                }
            });
        });

        contents.push({ parts });

        const systemInstruction = {
            parts: [{
                text: `You are MiroMiro AI, a premium web design assistant.\nYou will be given the HTML of a component to edit. Use this as the primary context for your response.\nWhen user asks to edit an element, respond with a JSON block and a short explanation.

Capabilities:
- "styles": Use standard CSS (camelCase for JS style object).
- "text": Replace inner text.
- "html": Replace inner HTML.
- "classes": { "add": "...", "remove": "...", "replace": "..." }

Tailwind Reference (IMPORTANT):
Always prefer Tailwind classes for layout and common styles.
- Layout: flex, grid, block, hidden, items-center, justify-center, gap-4
- Spacing: p-1..64, m-1..64 (e.g., p-4, mt-8, mx-auto)
- Text: text-xs..9xl, font-bold, text-center, text-blue-500, leading-relaxed
- Background: bg-white, bg-slate-900, bg-gradient-to-r from-cyan-500 to-blue-500
- Borders: border, border-2, rounded-lg, rounded-full, border-indigo-500
- Shadows: shadow-sm, shadow-lg, shadow-2xl, shadow-indigo-500/50
- Effects: opacity-50, blur-sm, hover:scale-105, focus:ring-2
- Responsive: sm:, md:, lg:, xl:

Example JSON:
{
  "classes": { "add": "bg-indigo-600 px-6 py-3 rounded-full shadow-lg hover:bg-indigo-700 transition-all", "remove": "bg-blue-500" },
  "text": "Start Free Trial",
  "styles": { "transform": "scale(1.05)" }
}`
            }]
        };

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                system_instruction: systemInstruction,
                contents
            })
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        return data.candidates[0].content.parts[0].text;
    }
});

