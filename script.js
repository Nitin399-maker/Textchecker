class OCRSpellChecker {
    constructor() {
        this.state = {
            uploadedImage: null,
            extractedText: '',
            detectedIssues: [],
            acceptedCorrections: [],
            currentIssueIndex: 0,
            originalImageBase64: null,
            processedImageBase64: null,
            currentModel: "gpt-4o-mini"
        };
        
        this.dictionary = null;
        this.progressModal = null;
        this.llmProvider = null;
        this.elements = this.cacheElements();
        this.compatibleFormats = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        this.skipPatterns = [/^[A-Z]{2,}$/, /^\d+[A-Z]+$/, /^[A-Z]+\d+$/, /^www\./, /\.com$/, /^\w+@\w+\./];
        
        this.init();
    }

    cacheElements() {
        const $ = id => document.getElementById(id);
        return {
            imageInput: $('imageInput'),
            dropArea: $('dropArea'),
            processBtn: $('processBtn'),
            downloadBtn: $('downloadBtn'),
            newProcessBtn: $('btn-new-process'),
            modelSelect: $('model-select'),
            configBtn: $('config-btn'),
            imagePreview: $('imagePreview'),
            previewContainer: $('preview-container'),
            resultsContainer: $('results-container'),
            resultsContent: $('results-content'),
            progressText: $('progressText'),
            originalText: $('originalText'),
            suggestedText: $('suggestedText'),
            issueType: $('issueType'),
            issueSource: $('issueSource'),
            issueDescription: $('issueDescription'),
            acceptBtn: $('acceptBtn'),
            rejectBtn: $('rejectBtn'),
            demoCards: $('demo-cards')
        };
    }

    async init() {
        await Promise.all([
            this.initSpellChecker(),
            this.initLLMProvider()
        ]);
        this.setupEventListeners();
    }

    async initLLMProvider() {
        try {
            const { openaiConfig } = await import('https://cdn.jsdelivr.net/npm/bootstrap-llm-provider@1.2/+esm');
            this.llmProvider = {
                config: null,
                async getConfig(show = false) {
                    if (!this.config || show) {
                        this.config = await openaiConfig({
                            title: "OCR LLM Configuration",
                            defaultBaseUrls: [
                                "https://api.openai.com/v1", 
                                "https://openrouter.ai/api/v1",
                                "https://api.anthropic.com/v1"
                            ],
                            show
                        });
                    }
                    return this.config;
                }
            };
        } catch (error) {
            console.warn('LLM provider initialization failed:', error);
        }
    }

    async initSpellChecker() {
        try {
            const [affData, dicData] = await Promise.all([
                this.fetchFile("en_US.aff").catch(() => null),
                this.fetchFile("en_US.dic").catch(() => null)
            ]);
            
            if (affData && dicData) {
                this.dictionary = new Typo("en_US", affData, dicData);
                console.log('Spell checker ready');
            }
        } catch (error) {
            console.warn('Spell checker unavailable, AI-only mode');
        }
    }

    async fetchFile(path) {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`Failed to fetch ${path}`);
        return response.text();
    }

    setupEventListeners() {
        const { elements } = this;
        
        // File handling
        elements.imageInput.addEventListener('change', e => this.handleFileSelect(e));
        elements.dropArea.addEventListener('click', () => elements.imageInput.click());
        elements.dropArea.addEventListener('dragover', e => this.handleDragOver(e));
        elements.dropArea.addEventListener('dragleave', e => this.handleDragLeave(e));
        elements.dropArea.addEventListener('drop', e => this.handleDrop(e));

        // Process buttons
        elements.processBtn.addEventListener('click', () => this.processImage());
        elements.downloadBtn.addEventListener('click', () => this.downloadPDF());
        elements.newProcessBtn.addEventListener('click', () => this.resetApp());

        // Configuration
        elements.configBtn.addEventListener('click', () => this.configLLM());
        elements.modelSelect.addEventListener('change', e => {
            this.state.currentModel = e.target.value;
        });

        // Correction modal
        elements.acceptBtn.addEventListener('click', () => this.acceptCorrection());
        elements.rejectBtn.addEventListener('click', () => this.rejectCorrection());
    }

    async convertImageForLLM(file) {
        if (this.compatibleFormats.includes(file.type.toLowerCase())) {
            return this.convertImageToBase64(file);
        }
        
        console.log(`Converting ${file.type} to JPEG for LLM compatibility...`);
        
        return new Promise((resolve, reject) => {
            const img = new Image();
            const reader = new FileReader();
            
            reader.onload = () => {
                img.onload = () => {
                    try {
                        const canvas = document.createElement('canvas');
                        const ctx = canvas.getContext('2d');
                        
                        canvas.width = img.width;
                        canvas.height = img.height;
                        
                        // White background for better OCR
                        ctx.fillStyle = '#FFFFFF';
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                        ctx.drawImage(img, 0, 0);
                        
                        // Convert to JPEG for better LLM compatibility and smaller size
                        const convertedBase64 = canvas.toDataURL('image/jpeg', 0.95);
                        console.log(`Successfully converted ${file.type} to JPEG format`);
                        resolve(convertedBase64);
                        
                    } catch (error) {
                        reject(new Error(`Image conversion failed: ${error.message}`));
                    }
                };
                
                img.onerror = () => reject(new Error(`Failed to load ${file.type} image for conversion`));
                img.src = reader.result;
            };
            
            reader.onerror = () => reject(new Error('Failed to read image file'));
            reader.readAsDataURL(file);
        });
    }

    showElements(...elements) {
        elements.forEach(el => {
            const element = typeof el === 'string' ? document.getElementById(el) : el;
            element?.classList.remove('d-none');
        });
    }

    hideElements(...elements) {
        elements.forEach(el => {
            const element = typeof el === 'string' ? document.getElementById(el) : el;
            element?.classList.add('d-none');
        });
    }

    showAlert(message, type = 'info') {
        if (typeof bootstrapAlert !== 'undefined') {
            return bootstrapAlert({ body: message, color: type });
        }
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show mt-3`;
        alertDiv.innerHTML = `${message}<button type="button" class="btn-close" data-bs-dismiss="alert"></button>`;
        document.querySelector('.container').appendChild(alertDiv);
        setTimeout(() => alertDiv.remove(), 5000);
    }

    setButtonState(button, loading = false, text = '') {
        if (loading) {
            button.disabled = true;
            button.dataset.originalText = button.innerHTML;
            button.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>${text}`;
        } else {
            button.disabled = false;
            button.innerHTML = button.dataset.originalText || text;
        }
    }

    sanitizeTextForPDF(text) {
        if (!text) return '';
        const charMap = {
            '\u2192': '->', '\u2190': '<-', '\u2191': '^', '\u2193': 'v', 
            '\u2713': 'OK', '\u2717': 'X', '\u2022': '*',
            '\u2013': '-', '\u2014': '--', 
            '\u201C': '"', '\u201D': '"', '\u2018': "'", '\u2019': "'", 
            '\u2026': '...',
            '\u00A9': '(c)', '\u00AE': '(R)', '\u2122': '(TM)',
            '\u00B0': 'deg', '\u00B1': '+/-', '\u2248': '~=',
            '\u2264': '<=', '\u2265': '>=', '\u2260': '!=',
            '\u00D7': 'x', '\u00F7': '/'
        };
        return text.replace(/[\u2192\u2190\u2191\u2193\u2713\u2717\u2022\u2013\u2014\u201C\u201D\u2018\u2019\u2026\u00A9\u00AE\u2122\u00B0\u00B1\u2248\u2264\u2265\u2260\u00D7\u00F7]/g, c => charMap[c])
                   .replace(/[^\x20-\x7E]/g, '?');
    }

    handleDemoCardClick(event) {
        const card = event.target.closest(".demo-card");
        if (!card) return;

        const messages = {
            document: 'Upload a document image for professional text extraction',
            handwritten: 'Upload handwritten notes for OCR processing', 
            financial: 'Upload financial documents to detect decimal formatting issues'
        };

        const demoType = card.dataset.demoType;
        const { dropArea } = this.elements;
        const originalHTML = dropArea.innerHTML;
        
        document.querySelectorAll(".demo-card").forEach(c => c.classList.remove("border-primary"));
        card.classList.add("border-primary");
        
        dropArea.innerHTML = `<i class="bi bi-cloud-upload fs-1 text-primary"></i>
            <p class="mt-3 mb-2 h5 text-primary">${messages[demoType]}</p>
            <p class="text-muted small">Click here to upload your ${demoType} image</p>`;

        setTimeout(() => {
            dropArea.innerHTML = originalHTML;
            card.classList.remove("border-primary");
        }, 3000);

        dropArea.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    handleFileSelect(event) {
        const file = event.target.files[0];
        if (file) this.validateAndProcessFile(file);
    }

    handleDragOver(event) {
        event.preventDefault();
        this.elements.dropArea.classList.add('border-primary', 'bg-primary', 'bg-opacity-10');
    }

    handleDragLeave(event) {
        event.preventDefault();
        this.elements.dropArea.classList.remove('border-primary', 'bg-primary', 'bg-opacity-10');
    }

    handleDrop(event) {
        event.preventDefault();
        this.elements.dropArea.classList.remove('border-primary', 'bg-primary', 'bg-opacity-10');
        
        const files = Array.from(event.dataTransfer.files);
        if (files.length > 0) this.validateAndProcessFile(files[0]);
    }

    validateAndProcessFile(file) {
        // Accept all image formats - we'll convert unsupported ones later
        if (!file.type.startsWith('image/')) {
            this.showAlert('Only image formats are allowed.', 'danger');
            return;
        }

        this.state.uploadedImage = file;
        this.displayImagePreview(file);
        this.elements.processBtn.disabled = false;
    }

    displayImagePreview(file) {
        const reader = new FileReader();
        reader.onload = e => {
            this.state.originalImageBase64 = e.target.result;
            this.elements.imagePreview.innerHTML = `
                <img src="${e.target.result}" class="img-fluid rounded shadow" alt="Uploaded image">
                <p class="mt-2 text-muted small">${file.name}</p>
            `;
        };
        reader.readAsDataURL(file);
        this.showElements(this.elements.previewContainer);
    }

    async configLLM() {
        if (this.llmProvider) {
            try {
                await this.llmProvider.getConfig(true);
                this.showAlert('LLM configuration updated successfully', 'success');
            } catch (error) {
                this.showAlert('LLM configuration failed', 'danger');
            }
        } else {
            this.showAlert('LLM provider not available', 'warning');
        }
    }

    async processImage() {
        if (!this.llmProvider) {
            return this.showAlert('Please configure LLM first', 'warning');
        }

        let config;
        try {
            config = await this.llmProvider.getConfig();
        } catch (error) {
            return this.showAlert('Please configure LLM first', 'warning');
        }

        this.setButtonState(this.elements.processBtn, true, 'Processing...');
        this.showProgressModal();

        try {
            const fileType = this.state.uploadedImage.type;
            const isCompatible = this.compatibleFormats.includes(fileType.toLowerCase());
            this.updateProgress(isCompatible ? 'Preparing image for AI processing...' : `Converting ${fileType} to JPEG for AI compatibility...`);
            
            this.state.processedImageBase64 = await this.convertImageForLLM(this.state.uploadedImage);
            
            this.updateProgress('Extracting text and detecting errors with AI...');
            const aiResults = await this.extractTextAndDetectErrors(config);
            
            this.updateProgress('Validating with Typo.js spell checker...');
            const typoIssues = this.validateWithTypoJS(aiResults.text);
            
            // Merge results
            this.state.detectedIssues = this.mergeIssues(aiResults.issues, typoIssues);
            this.state.extractedText = aiResults.text;
            
            this.displayResults();
            this.hideProgressModal();
            
            if (this.state.detectedIssues.length > 0) {
                this.state.currentIssueIndex = 0;
                this.state.acceptedCorrections = [];
                this.showNextCorrection();
            } else {
                this.showElements(this.elements.downloadBtn);
                this.showAlert('No spelling or decimal issues found! ✅', 'success');
            }
            
            this.showElements(this.elements.newProcessBtn);
            
        } catch (error) {
            this.hideProgressModal();
            this.showAlert(`Processing failed: ${error.message}`, 'danger');
        } finally {
            this.setButtonState(this.elements.processBtn, false, '<i class="bi bi-play-circle me-2"></i>Process Image');
        }
    }

    async extractTextAndDetectErrors(config) {
        // Use the already converted/optimized image
        const base64Image = this.state.processedImageBase64;
        
        const prompt = `Extract ALL visible text (very very must be exact spelling as the image) from this image and analyze it for errors. Return a JSON response in this exact format:

{
"extracted_text": "the complete text exactly as it appears",
"issues": [
{
"type": "spelling",
"original": "misspelled word",
"suggested": "correct word",
"description": "explanation of the issue",
"source": "AI"
},
{
"type": "decimal",
"original": "1,5",
"suggested": "1.5", 
"description": "decimal comma should be decimal point",
"source": "AI"
}
]
}

RULES:
1. Extract text exactly as written (preserve original formatting)
2. Find spelling mistakes and suggest corrections
3. Find decimal comma errors (like 1,5 should be 1.5) and convert to decimal points
4. Only return valid JSON, no other text
5. If no issues found, return empty issues array
6. Focus on obvious errors - don't be overly aggressive`;

        const response = await this.callLLM(config, [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: base64Image, detail: "high" } }
        ]);

        try {
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error('No valid JSON found in AI response');

            const result = JSON.parse(jsonMatch[0]);
            if (!result.extracted_text) throw new Error('No extracted text found in AI response');

            return { text: result.extracted_text, issues: Array.isArray(result.issues) ? result.issues : [] };
        } catch (error) {
            console.warn('Failed to parse AI response, using fallback:', error);
            return { text: response.trim(), issues: [] };
        }
    }

    validateWithTypoJS(text) {
        if (!this.dictionary || !text?.trim()) return [];

        const issues = [];
        const words = text.split(/\s+/);
        const nonWordRegex = /[^\w]/g;
        const digitRegex = /^\d+$/;
        
        words.forEach((word, index) => {
            if (!word.trim()) return;

            const cleanWord = word.replace(nonWordRegex, '').toLowerCase();
            if (cleanWord.length <= 2 || digitRegex.test(cleanWord)) return;
            
            const originalWord = word.replace(nonWordRegex, '');
            if (this.skipPatterns.some(p => p.test(originalWord)) || this.dictionary.check(cleanWord)) return;
            
            const suggestions = this.dictionary.suggest(cleanWord);
            if (suggestions?.length) {
                issues.push({
                    type: 'spelling',
                    original: word,
                    suggested: word.replace(new RegExp(cleanWord, 'i'), suggestions[0]),
                    position: index,
                    description: 'Potential spelling error detected by Typo.js',
                    source: 'Typo.js'
                });
            }
        });

        return issues;
    }

    mergeIssues(aiIssues, typoIssues) {
        const merged = [...aiIssues];
        
        typoIssues.forEach(typoIssue => {
            const isDuplicate = aiIssues.some(aiIssue => 
                aiIssue.original.toLowerCase() === typoIssue.original.toLowerCase() && aiIssue.type === typoIssue.type
            );
            if (!isDuplicate) merged.push(typoIssue);
        });

        return merged.sort((a, b) => 
            a.position !== undefined && b.position !== undefined ? a.position - b.position : a.type.localeCompare(b.type)
        );
    }

    async callLLM(config, content) {
        const response = await fetch(`${config.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`
            },
            body: JSON.stringify({
                model: this.state.currentModel,
                messages: [{ role: "user", content }],
                temperature: 0.1
            })
        });

        if (!response.ok) throw new Error(`LLM API failed: ${response.status}`);
        const data = await response.json();
        return data.choices[0].message.content;
    }

    convertImageToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    displayResults() {
        this.showElements(this.elements.resultsContainer);
        const { extractedText, detectedIssues } = this.state;
        
        const issuesHTML = detectedIssues.length === 0 
            ? '<div class="alert alert-success"><i class="bi bi-check-circle me-2"></i>No issues found! 🎉</div>'
            : `<div class="alert alert-warning"><i class="bi bi-exclamation-triangle me-2"></i>${detectedIssues.length} issue(s) found using AI + Typo.js validation</div>` +
              detectedIssues.map(issue => {
                const badgeClass = issue.type === 'spelling' ? 'bg-warning' : 'bg-info';
                const sourceBadge = issue.source === 'AI' ? 'bg-primary' : 'bg-secondary';
                return `<div class="border rounded p-3 mb-2"><div><span class="badge ${badgeClass} me-2">${issue.type.toUpperCase()}</span><span class="badge ${sourceBadge}">${issue.source}</span></div><div class="mt-2"><strong class="text-danger">"${issue.original}"</strong> <i class="bi bi-arrow-right mx-2"></i> <em class="text-success">"${issue.suggested}"</em></div><small class="text-muted d-block mt-2">${issue.description}</small></div>`;
              }).join('');
        
        this.elements.resultsContent.innerHTML = `<div class="mb-4"><h6 class="fw-bold"><i class="bi bi-file-text me-2"></i>Extracted Text:</h6><div class="p-3 border rounded font-monospace" style="white-space: pre-wrap; max-height: 200px; overflow-y: auto;">${extractedText}</div></div><div><h6 class="fw-bold"><i class="bi bi-exclamation-triangle me-2"></i>Issues Found:</h6>${issuesHTML}</div>`;
    }

    showProgressModal() {
        this.progressModal = new bootstrap.Modal(document.getElementById('progressModal'));
        this.progressModal.show();
    }

    hideProgressModal() {
        const cleanup = () => {
            document.querySelectorAll('.modal-backdrop').forEach(b => b.remove());
            document.body.classList.remove('modal-open');
            Object.assign(document.body.style, { paddingRight: '', overflow: '' });
            
            const modalElement = document.getElementById('progressModal');
            if (modalElement) {
                modalElement.classList.remove('show');
                Object.assign(modalElement.style, { display: 'none' });
                modalElement.setAttribute('aria-hidden', 'true');
                modalElement.removeAttribute('aria-modal');
            }
        };

        try {
            if (this.progressModal) {
                this.progressModal.hide();
                this.progressModal = null;
            }
            const existingModal = bootstrap.Modal.getInstance(document.getElementById('progressModal'));
            if (existingModal) existingModal.hide();
            setTimeout(cleanup, 150);
        } catch (error) {
            console.warn('Modal cleanup error:', error);
            setTimeout(cleanup, 100);
        }
    }

    updateProgress(text) {
        this.elements.progressText.textContent = text;
    }

    showNextCorrection() {
        const { detectedIssues, currentIssueIndex, acceptedCorrections } = this.state;
        
        if (currentIssueIndex >= detectedIssues.length) {
            this.showElements(this.elements.downloadBtn);
            return this.showAlert(`Review complete! ${acceptedCorrections.length} correction(s) accepted.`, 'success');
        }

        const issue = detectedIssues[currentIssueIndex];
        const { originalText, suggestedText, issueType, issueSource, issueDescription } = this.elements;
        
        originalText.textContent = issue.original;
        suggestedText.textContent = issue.suggested;
        issueType.textContent = issue.type.toUpperCase();
        issueSource.textContent = issue.source || 'AI';
        issueDescription.textContent = issue.description;

        new bootstrap.Modal(document.getElementById('correctionModal')).show();
    }

    acceptCorrection() {
        this.state.acceptedCorrections.push(this.state.detectedIssues[this.state.currentIssueIndex]);
        this.hideModalAndContinue();
    }

    rejectCorrection() {
        this.hideModalAndContinue();
    }

    hideModalAndContinue() {
        bootstrap.Modal.getInstance(document.getElementById('correctionModal'))?.hide();
        this.state.currentIssueIndex++;
        setTimeout(() => this.showNextCorrection(), 300);
    }

    async downloadPDF() {
        this.setButtonState(this.elements.downloadBtn, true, 'Generating PDF...');
        this.showProgressModal();

        try {
            this.updateProgress('Processing image for PDF...');
            const processedImageData = await this.convertImageForPDFLib();
            
            this.updateProgress('Creating PDF with interactive comments...');
            const pdfBytes = await this.createPDFWithComments(processedImageData);
            
            this.updateProgress('Finalizing download...');
            this.downloadFile(pdfBytes, this.generateFilename(), 'application/pdf');
            
            setTimeout(() => {
                this.hideProgressModal();
                this.showAlert('Interactive PDF generated successfully! Click comment icons to see corrections. 📄✅', 'success');
            }, 500);
            
        } catch (error) {
            console.error('PDF generation error:', error);
            this.hideProgressModal();
            this.showAlert(`PDF generation failed: ${error.message}`, 'danger');
        } finally {
            setTimeout(() => {
                this.setButtonState(this.elements.downloadBtn, false, '<i class="bi bi-download me-2"></i>Download Interactive PDF');
            }, 600);
        }
    }

    downloadFile(data, filename, mimeType) {
        const url = URL.createObjectURL(new Blob([data], { type: mimeType }));
        const a = Object.assign(document.createElement('a'), {
            href: url,
            download: filename,
            style: 'display: none'
        });
        
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async convertImageForPDFLib() {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            
            const processCanvas = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                Object.assign(canvas, { width: img.width, height: img.height });
                
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);
                
                canvas.toBlob(blob => {
                    if (!blob) return reject(new Error('Failed to create image blob'));
                    const reader = new FileReader();
                    reader.onload = () => resolve(new Uint8Array(reader.result));
                    reader.onerror = () => reject(new Error('Failed to read image blob'));
                    reader.readAsArrayBuffer(blob);
                }, 'image/jpeg', 0.9);
            };
            
            img.onload = () => {
                try { processCanvas(); }
                catch (error) { reject(new Error(`Canvas processing failed: ${error.message}`)); }
            };
            img.onerror = () => reject(new Error('Failed to load image'));
            
            const imageSource = this.state.processedImageBase64 || this.state.originalImageBase64;
            if (imageSource) {
                img.src = imageSource;
            } else {
                const reader = new FileReader();
                reader.onload = e => img.src = e.target.result;
                reader.onerror = () => reject(new Error('Failed to read uploaded file'));
                reader.readAsDataURL(this.state.uploadedImage);
            }
        });
    }

    async createPDFWithComments(imageBytes) {
        const { PDFDocument, PDFName, PDFNumber, PDFString, rgb } = PDFLib;
        
        try {
            const pdfDoc = await PDFDocument.create();
            
            let image;
            try {
                image = await pdfDoc.embedJpg(imageBytes);
            } catch (jpgError) {
                console.warn('JPG embedding failed, trying PNG:', jpgError);
                image = await pdfDoc.embedPng(imageBytes);
            }
            
            const page = pdfDoc.addPage();
            const { width: pageWidth, height: pageHeight } = page.getSize();
            const imageLayout = this.calculateImageLayout(image.width, image.height, pageWidth, pageHeight);
            
            // Draw image
            page.drawImage(image, {
                x: imageLayout.x,
                y: imageLayout.y,
                width: imageLayout.width,
                height: imageLayout.height,
            });

            // Add comments only
            await this.addInteractiveComments(pdfDoc, page, imageLayout, { PDFName, PDFNumber, PDFString, rgb });

            return await pdfDoc.save();
            
        } catch (error) {
            throw new Error(`PDF creation failed: ${error.message}`);
        }
    }

    async addInteractiveComments(pdfDoc, page, imageLayout, { PDFName, PDFNumber, PDFString, rgb }) {
        const { acceptedCorrections } = this.state;
        if (acceptedCorrections.length === 0) return;

        const ctx = pdfDoc.context;
        let annots = page.node.lookup(PDFName.of("Annots"));
        if (!annots) {
            annots = ctx.obj([]);
            page.node.set(PDFName.of("Annots"), annots);
        }

        acceptedCorrections.forEach((correction, index) => {
            try {
                const x = imageLayout.x + imageLayout.width + 20;
                const y = imageLayout.y + imageLayout.height - (index * 50) - 50;
                const iconSize = 18;

                const commentText = this.sanitizeTextForPDF(
                    `Changed (${correction.original}) into (${correction.suggested})`
                );

                const safeX = Math.max(20, Math.min(x, page.getSize().width - iconSize - 5));
                const safeY = Math.max(50, Math.min(y, page.getSize().height - 50));

                const iconRect = [safeX, safeY, safeX + iconSize, safeY + iconSize];
                const popupRect = [safeX - 310, safeY - 80, safeX - 10, safeY + 20];

                const popupAnnot = ctx.obj({
                    Type: PDFName.of("Annot"),
                    Subtype: PDFName.of("Popup"),
                    Rect: ctx.obj(popupRect.map(PDFNumber.of)),
                    Open: false,
                });

                const textAnnot = ctx.obj({
                    Type: PDFName.of("Annot"),
                    Subtype: PDFName.of("Text"),
                    Rect: ctx.obj(iconRect.map(PDFNumber.of)),
                    Contents: PDFString.of(commentText),
                    T: PDFString.of('OCR Checker'),
                    C: ctx.obj(correction.type === 'spelling' ? 
                        [PDFNumber.of(1), PDFNumber.of(0.8), PDFNumber.of(0)] : 
                        [PDFNumber.of(0), PDFNumber.of(0.8), PDFNumber.of(1)]
                    ),
                    Name: PDFName.of("Comment"),
                    M: PDFString.of(new Date().toISOString()),
                    Open: false,
                    Popup: popupAnnot,
                });

                annots.push(textAnnot);
                annots.push(popupAnnot);
            } catch (annotError) {
                console.warn(`Failed to create annotation:`, annotError);
            }
        });
    }



    calculateImageLayout(imageWidth, imageHeight, pageWidth, pageHeight) {
        const margin = 50;
        const availableWidth = pageWidth - (margin * 2) - 100;
        const availableHeight = pageHeight - 150;
        
        let width = imageWidth, height = imageHeight;
        const aspectRatio = imageWidth / imageHeight;
        
        if (width > availableWidth) {
            width = availableWidth;
            height = width / aspectRatio;
        }
        if (height > availableHeight) {
            height = availableHeight;
            width = height * aspectRatio;
        }
        
        return { x: margin, y: pageHeight - height - 120, width, height };
    }

    generateFilename() {
        const originalName = this.state.uploadedImage.name;
        const nameWithoutExt = originalName.substring(0, originalName.lastIndexOf('.')) || originalName;
        return `${nameWithoutExt}_OCR_Interactive_Report.pdf`;
    }

    resetApp() {
        Object.assign(this.state, {
            uploadedImage: null,
            extractedText: '',
            detectedIssues: [],
            acceptedCorrections: [],
            currentIssueIndex: 0,
            originalImageBase64: null,
            processedImageBase64: null,
            currentModel: this.state.currentModel
        });

        this.hideElements(
            this.elements.previewContainer, 
            this.elements.resultsContainer, 
            this.elements.downloadBtn, 
            this.elements.newProcessBtn
        );
        
        this.elements.processBtn.disabled = true;
        this.elements.imageInput.value = '';
        this.elements.dropArea.innerHTML = `<i class="bi bi-cloud-upload fs-1 text-muted"></i>
            <p class="mt-3 mb-2 h5">Drag and drop an image here or click to browse</p>
            <p class="text-muted small">Supported formats: BMP, GIF, TIFF, JPEG, PNG, EPS, WEBP</p>`;

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.ocrApp = new OCRSpellChecker();
});