const State = {
    stream: null,
    currentScan: null,
    history: JSON.parse(localStorage.getItem('upfi_history')) || []
};

// UI Elements
const els = {
    video: document.getElementById('camera-stream'),
    canvas: document.getElementById('camera-canvas'),
    captureBtn: document.getElementById('capture-btn'),
    statusText: document.getElementById('status-indicator'),
    scanResults: document.getElementById('scan-results'),
    novaBadge: document.getElementById('nova-badge'),
    novaScore: document.querySelector('.nova-score'),
    novaDesc: document.querySelector('.nova-desc'),
    ingredientsList: document.getElementById('ingredients-list'),
    saveBtn: document.getElementById('save-btn'),
    shareBtn: document.getElementById('share-btn'),
    discardBtn: document.getElementById('discard-btn'),
    navItems: document.querySelectorAll('.nav-item'),
    views: document.querySelectorAll('.view'),
    historyList: document.getElementById('history-list')
};

// Application Init
async function init() {
    setupNavigation();
    setupButtons();
    await startCamera();
    renderHistory();
}

// Navigation Logic
function setupNavigation() {
    els.navItems.forEach(item => {
        item.addEventListener('click', () => {
            const target = item.dataset.target;
            
            // Switch tabs
            els.navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            
            // Switch views
            els.views.forEach(view => {
                if (view.id === target) {
                    view.classList.remove('hidden');
                    view.classList.add('active');
                    if (target === 'scanner-view') startCamera();
                } else {
                    view.classList.add('hidden');
                    view.classList.remove('active');
                    if (view.id === 'scanner-view') stopCamera();
                }
            });
            
            if (target === 'history-view') renderHistory();
        });
    });
}

function setupButtons() {
    els.captureBtn.addEventListener('click', handleCapture);
    els.discardBtn.addEventListener('click', resetScanner);
    els.saveBtn.addEventListener('click', saveToHistory);
    els.shareBtn.addEventListener('click', shareResults);
}

// Camera Logic
async function startCamera() {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }
            });
            els.video.srcObject = stream;
            State.stream = stream;
            els.statusText.innerText = "Ready to scan. Align ingredients within frame.";
            
            // Ensure video plays when returning to tab
            els.video.play().catch(e => console.error("Play prevented", e)); 
        } catch (err) {
            console.error(err);
            els.statusText.innerText = "Camera access denied or unavailable. " + err.message;
        }
    } else {
        els.statusText.innerText = "Camera API not supported on this device/browser.";
    }
}

function stopCamera() {
    if (State.stream) {
        State.stream.getTracks().forEach(track => track.stop());
        State.stream = null;
    }
}

// OCR Processing
async function handleCapture() {
    if (!State.stream) return;
    
    // UI Update to processing
    els.captureBtn.innerText = "Processing...";
    els.captureBtn.disabled = true;
    els.statusText.innerText = "Analyzing image... (This may take a few seconds)";
    
    // Draw video frame to canvas
    const videoWidth = els.video.videoWidth;
    const videoHeight = els.video.videoHeight;
    els.canvas.width = videoWidth;
    els.canvas.height = videoHeight;
    const ctx = els.canvas.getContext('2d');
    ctx.drawImage(els.video, 0, 0, videoWidth, videoHeight);

    // Stop video feed to look like a snapshot
    els.video.pause();

    try {
        const langPath = '.';
        console.log('Tesseract is trying to fetch language data from:', langPath + '/eng.traineddata');

        // Init Tesseract Worker for local offline handling
        const worker = await window.Tesseract.createWorker({
            workerPath: './assets/worker.min.js',
            corePath: './assets/tesseract-core.wasm.js',
            langPath: langPath,
            gzip: false
        });
        
        await worker.loadLanguage('eng');
        await worker.initialize('eng');
        
        // Recognize Text
        const { data: { text } } = await worker.recognize(els.canvas);
        await worker.terminate();

        // Process extraction
        const analysisResults = window.analyzeIngredients(text);
        displayResults(analysisResults);

    } catch (e) {
        console.error(e);
        els.statusText.innerText = "Scan failed. Please Ensure you have enough light and try again.";
        els.video.play();
    } finally {
        els.captureBtn.innerText = "Take Snapshot";
        els.captureBtn.disabled = false;
    }
}

function displayResults(data) {
    State.currentScan = {
        id: Date.now(),
        date: new Date().toLocaleString(),
        ...data
    };

    els.statusText.innerText = "Scan Complete.";
    els.scanResults.classList.remove('hidden');
    els.captureBtn.classList.add('hidden');

    // Update Badge
    els.novaBadge.className = 'nova-badge group-' + data.novaGroup;
    els.novaScore.innerText = `NOVA ${data.novaGroup}`;
    els.novaDesc.innerText = data.novaDesc;

    // Update Ingredients List
    els.ingredientsList.innerHTML = '';
    
    if (data.additives.length === 0) {
        els.ingredientsList.innerHTML = `<div style="text-align:center; padding:1rem; color:var(--color-text-light);">No recognized high-risk additives found.</div>`;
    } else {
        data.additives.forEach(add => {
            const item = document.createElement('div');
            item.className = 'additive-item risk-' + add.risk;
            item.innerHTML = `
                <strong>${add.name} ${add.id.startsWith('E') ? `(${add.id})` : ''}</strong>
                <span>Risk: ${add.risk}</span>
                <small>${add.effects}</small>
            `;
            els.ingredientsList.appendChild(item);
        });
    }
}

function resetScanner() {
    State.currentScan = null;
    els.scanResults.classList.add('hidden');
    els.captureBtn.classList.remove('hidden');
    els.statusText.innerText = "Ready to scan. Align ingredients within frame.";
    if (State.stream) els.video.play();
}

// History & Storage
function saveToHistory() {
    if (State.currentScan) {
        State.history.unshift(State.currentScan); // prepend
        localStorage.setItem('upfi_history', JSON.stringify(State.history));
        alert('Saved to history!');
        resetScanner();
    }
}

function renderHistory() {
    els.historyList.innerHTML = '';
    
    if (State.history.length === 0) {
        els.historyList.innerHTML = '<p style="text-align:center; color:gray;">No scans saved yet.</p>';
        return;
    }

    State.history.forEach(item => {
        const card = document.createElement('div');
        card.className = 'history-card';
        card.innerHTML = `
            <div class="info">
                <h3>Product Scan</h3>
                <span class="date">${item.date}</span>
                <div style="font-size:0.8rem; margin-top:4px;">${item.additives.length} flagged ingredients</div>
            </div>
            <div class="badge bg-${item.novaGroup}">N${item.novaGroup}</div>
        `;
        els.historyList.appendChild(card);
    });
}

// Email Sharing via mailto:
function shareResults() {
    if (!State.currentScan) return;
    
    const s = State.currentScan;
    const subject = encodeURIComponent('UPFI Scan Results');
    
    let bodyText = `UPFI Food Additive Scan\nDate: ${s.date}\n\n`;
    bodyText += `Overall Classification: NOVA Group ${s.novaGroup} (${s.novaDesc})\n\n`;
    
    if (s.additives.length > 0) {
        bodyText += `Flagged Ingredients Found:\n`;
        s.additives.forEach(add => {
            bodyText += `- ${add.name}: Risk level ${add.risk}. ${add.effects}\n`;
        });
    } else {
        bodyText += `No significant additives detected.\n`;
    }
    
    const body = encodeURIComponent(bodyText);
    const mailto = `mailto:?subject=${subject}&body=${body}`;
    
    window.location.href = mailto;
}

// Run Initialization
window.addEventListener('DOMContentLoaded', init);
