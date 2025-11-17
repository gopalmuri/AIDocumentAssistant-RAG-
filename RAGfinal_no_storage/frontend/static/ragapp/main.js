// Main frontend script - cleaned and deduplicated

(function() {
  'use strict';

class DocumentAssistant {
  constructor() {
    this.selectedFiles = [];
    this.chatHistory = [];
    this.conversationId = null;
    this.pdfLibrary = [];
    this.currentSearchQuery = '';
    this.initializeElements();
    this.attachEventListeners();
    this.loadPDFLibrary();
  }

    initializeElements() {
    // PDF Library elements
    this.pdfGrid = document.getElementById('pdfGrid');
    this.pdfSearchInput = document.getElementById('pdfSearchInput');
    this.clearSearchBtn = document.getElementById('clearSearchBtn');
    this.pdfStats = document.getElementById('pdfStats');
    this.pdfCount = document.getElementById('pdfCount');
    
    // Legacy upload elements (may not exist in new layout)
    this.uploadArea = document.getElementById('uploadArea');
    this.fileInput = document.getElementById('fileInput');
    this.fileList = document.getElementById('fileList');
    this.processBtn = document.getElementById('processBtn');
    this.processingLoading = document.getElementById('processingLoading');
    this.statusMessage = document.getElementById('statusMessage');
    
    this.chatMessages = document.getElementById('chatMessages');
    this.chatInput = document.getElementById('chatInput');
    this.sendBtn = document.getElementById('sendBtn');
    
    this.themeToggle = document.getElementById('themeToggle');
    this.exportBtn = document.getElementById('exportBtn');
    this.exportOptions = document.getElementById('exportOptions');
    this.clearChatBtn = document.getElementById('clearChatBtn');
    this.clearFilesBtn = document.getElementById('clearFilesBtn');
    this.copySuccess = document.getElementById('copySuccess');

    // History UI
    this.historyBtn = document.getElementById('historyBtn');
    this.newChatBtn = document.getElementById('newChatBtn');
    this.historySidebar = document.getElementById('historySidebar');
    this.historyList = document.getElementById('historyList');
    this.closeHistoryBtn = document.getElementById('closeHistoryBtn');
    this.historySearch = document.getElementById('historySearch');
    
    // PDF Viewer
    this.pdfViewerOverlay = document.getElementById('pdfViewerOverlay');
    this.pdfViewerFrame = document.getElementById('pdfViewerFrame');
    this.pdfViewerTitle = document.getElementById('pdfViewerTitle');
    this.backToLibraryBtn = document.getElementById('backToLibraryBtn');
    this.pdfChatTitle = document.getElementById('pdfChatTitle');
    this.pdfChatInput = document.getElementById('pdfChatInput');
    this.pdfChatSend = document.getElementById('pdfChatSend');
    this.pdfChatClose = document.getElementById('pdfChatClose');
    this.pdfPageInfo = document.getElementById('pdfPageInfo');
    this.currentPDF = null;
  }

  attachEventListeners() {
      const safeAdd = (el, evt, handler, opts) => {
        if (el && el.addEventListener) el.addEventListener(evt, handler, opts || false);
      };

      safeAdd(this.uploadArea, 'click', () => this.fileInput && this.fileInput.click());
      safeAdd(this.uploadArea, 'dragover', this.handleDragOver.bind(this));
      safeAdd(this.uploadArea, 'dragleave', this.handleDragLeave.bind(this));
      safeAdd(this.uploadArea, 'drop', this.handleDrop.bind(this));

      safeAdd(this.fileInput, 'change', this.handleFileSelect.bind(this));
      safeAdd(this.processBtn, 'click', this.processFiles.bind(this));

      safeAdd(this.sendBtn, 'click', this.sendMessage.bind(this));
      safeAdd(this.chatInput, 'keypress', this.handleKeyPress.bind(this));
      safeAdd(this.chatInput, 'input', this.autoResize.bind(this));
      safeAdd(this.chatInput, 'input', this.checkSendButton.bind(this));

      safeAdd(this.themeToggle, 'click', this.toggleTheme.bind(this));
      safeAdd(this.exportBtn, 'click', this.toggleExportOptions.bind(this));
      safeAdd(this.clearChatBtn, 'click', this.clearChat.bind(this));
      safeAdd(this.clearFilesBtn, 'click', this.clearFiles.bind(this));

      // History controls
      safeAdd(this.historyBtn, 'click', this.toggleHistory.bind(this));
      safeAdd(this.closeHistoryBtn, 'click', this.toggleHistory.bind(this));
      safeAdd(this.newChatBtn, 'click', this.startNewChat.bind(this));
      safeAdd(this.historySearch, 'input', this.filterHistory.bind(this));

      // PDF Library event listeners with debouncing for smooth search
      let searchTimeout;
      safeAdd(this.pdfSearchInput, 'input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => this.searchPDFs(), 300); // 300ms debounce
      });
      safeAdd(this.clearSearchBtn, 'click', this.clearSearch.bind(this));
      
      // PDF Viewer event listeners
      safeAdd(this.backToLibraryBtn, 'click', (e) => {
        console.log('Back button clicked');
        e.preventDefault();
        this.hidePDFViewer();
      });
      
      safeAdd(this.pdfChatSend, 'click', this.sendPDFMessage.bind(this));
      safeAdd(this.pdfChatInput, 'keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.sendPDFMessage();
        }
      });
      safeAdd(this.pdfChatClose, 'click', this.hidePDFViewer.bind(this));

    document.addEventListener('click', (e) => {
        if (this.exportBtn && this.exportOptions &&
            !this.exportBtn.contains(e.target) && !this.exportOptions.contains(e.target)) {
        this.exportOptions.classList.remove('show');
      }
    });

      // Close citation overlay on back/forward
      window.addEventListener('popstate', () => {
        this.hideCitationOverlay();
      });

      // Keyboard navigation for chat history
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          this.hideCitationOverlay();
          if (this.pdfViewerOverlay && this.pdfViewerOverlay.style.display === 'flex') {
            this.hidePDFViewer();
          }
        }
      });

    this.initializeTheme();
    }

    handleDragOver(e) { e.preventDefault(); this.uploadArea.classList.add('dragover'); }
    handleDragLeave(e) { e.preventDefault(); this.uploadArea.classList.remove('dragover'); }
    handleDrop(e) { e.preventDefault(); this.uploadArea.classList.remove('dragover'); if (e.dataTransfer) this.handleFiles(e.dataTransfer.files); }
    handleFileSelect(e) { this.handleFiles(e.target.files); }

  handleFiles(files) {
    const pdfFiles = Array.from(files).filter(file => file.type === 'application/pdf');
      if (pdfFiles.length === 0) { this.showStatus('Please select valid PDF files.', 'error'); return; }
    this.selectedFiles = [...this.selectedFiles, ...pdfFiles];
    this.renderFileList();
    this.updateButtonStates();
    this.hideStatus();
  }

  // Removed checkDocumentStatus - no persistent storage

  updateButtonStates() {
    const hasFiles = this.selectedFiles.length > 0;
    // Removed document status checking - no persistent storage
    
    if (this.processBtn) {
      this.processBtn.disabled = !hasFiles;
      
      if (hasFiles) {
        this.processBtn.innerHTML = '<i class="fas fa-cog"></i> Process Documents';
        this.processBtn.style.backgroundColor = '';
        this.processBtn.style.color = '';
        this.processBtn.style.fontWeight = '';
      }
    }
    
    this.clearFilesBtn && (this.clearFilesBtn.disabled = !hasFiles);
  }

  
  renderFileList() {
      if (!this.fileList) return;
    this.fileList.innerHTML = '';
    
    this.selectedFiles.forEach((file, index) => {
      const fileItem = document.createElement('div');
      fileItem.className = 'file-item';
      
      fileItem.innerHTML = `
        <i class="fas fa-file-pdf file-icon"></i>
        <span class="file-name">${file.name}</span>
        <span class="file-size">${this.formatFileSize(file.size)}</span>
        <button class="remove-file" onclick="app.removeFile(${index})"><i class="fas fa-times"></i></button>
      `;
      this.fileList.appendChild(fileItem);
    });
  }

    removeFile(index) { this.selectedFiles.splice(index, 1); this.renderFileList(); this.updateButtonStates(); }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
      const k = 1024; const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async processFiles() {
      if (!this.selectedFiles.length) return;
      if (this.processBtn) this.processBtn.disabled = true;
      if (this.processingLoading) this.processingLoading.style.display = 'flex';
    this.showStatus('Processing your documents...', 'info');

    const formData = new FormData();
    this.selectedFiles.forEach(file => formData.append('files', file));
    if (this.conversationId) formData.append('conversation_id', this.conversationId);

    let response;
    try {
        response = await fetch('/upload/', { method: 'POST', body: formData });
      const data = await response.json();
      if (response.ok) {
        this.showStatus(data.message || 'Documents processed successfully!', 'success');
        if (data.conversation_id) this.conversationId = data.conversation_id;
          if (this.processBtn) {
        this.processBtn.innerHTML = '<i class="fas fa-check"></i> Documents Processed Successfully!';
        this.processBtn.disabled = true;
            this.processBtn.style.setProperty('background-color', '#10b92d', 'important');
        this.processBtn.style.setProperty('color', 'white', 'important');
          }
          this.fileInput && (this.fileInput.value = '');
      } else {
        this.showStatus(data.error || 'Failed to process documents.', 'error');
      }
      } catch (err) { this.showStatus('Error processing documents: ' + err.message, 'error'); }
      finally {
        if (this.processingLoading) this.processingLoading.style.display = 'none';
        if (response && !response.ok && this.processBtn) this.processBtn.disabled = false;
    }
  }

  async sendMessage() {
      const message = (this.chatInput && this.chatInput.value || '').trim();
    if (!message) return;
    this.addMessage(message, 'user');
    this.chatInput.value = '';
    this.autoResize();
      if (this.sendBtn) this.sendBtn.disabled = true;
    this.addThinkingIndicator();

    try {
        // Include current PDF context if available
        const requestBody = { 
          query: message, 
          conversation_id: this.conversationId 
        };
        
        if (this.currentPDF) {
          requestBody.document_context = this.currentPDF;
        }
        
        const response = await fetch('/query/', { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify(requestBody) 
        });
        const data = await response.json();
        this.removeThinkingIndicator();
        if (response.ok) {
          // Track conversation for continued chat
          if (data.conversation_id) this.conversationId = data.conversation_id;
          
          // Handle document-specific responses
          if (this.currentPDF && (!data.answer || data.answer.includes('not found'))) {
            this.addMessage("I could not find an answer to your question in this document. Please try asking about a different aspect of the document or select a different document.", 'assistant');
          } else {
            this.addMessage(data.answer, 'assistant', data.citations || [], data.follow_up_questions || []);
          }
        }
        else this.addMessage(data.error || 'Sorry, I encountered an error.', 'assistant');
      } catch (err) {
      this.removeThinkingIndicator();
        this.addMessage('Sorry, I encountered an error: ' + err.message, 'assistant');
      } finally { if (this.sendBtn) this.sendBtn.disabled = false; }
    }

    addMessage(content, sender, citations = [], followUpQuestions = []) {
      if (this.chatMessages) {
    const emptyState = this.chatMessages.querySelector('.empty-state');
        if (emptyState) emptyState.remove();

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}`;
    const avatar = sender === 'user' ? 'U' : 'AI';
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const actionsHtml = sender === 'assistant' ? `<div class="message-actions"><button class="action-btn" onclick="app.copyMessage(this)" title="Copy message"><i class="fas fa-copy"></i></button></div>` : '';
        // Convert markdown-style formatting to HTML for better display
        const formattedContent = this.formatStructuredContent(content);
        messageDiv.innerHTML = `<div class="message-avatar">${avatar}</div><div class="message-content">${formattedContent}${actionsHtml}<div class="message-time">${time}</div></div>`;
    this.chatMessages.appendChild(messageDiv);
    
    if (sender === 'assistant' && citations && citations.length) {
      const contentDiv = messageDiv.querySelector('.message-content');
      const chipsWrap = document.createElement('div');
      chipsWrap.className = 'citations';
      const sourcesLabel = document.createElement('div');
      sourcesLabel.className = 'sources-label';
      sourcesLabel.textContent = 'Sources:';
      chipsWrap.appendChild(sourcesLabel);
      // Use the new page_display format from backend
      console.log('📋 Citations received:', citations);
      citations.forEach((citation, idx) => {
        console.log('📄 Processing citation:', citation);
        const chip = document.createElement('span');
        chip.className = 'citation-chip';
        
        // Use the formatted page display from backend, with fallback
        let pageDisplay;
        if (citation.page_display) {
          pageDisplay = citation.page_display;
        } else if (citation.page_numbers && citation.page_numbers.length > 0) {
          // Fallback to page_numbers array
          pageDisplay = citation.page_numbers.join(', ');
        } else if (citation.page_no) {
          // Fallback to old page_no field
          pageDisplay = citation.page_no;
        } else {
          pageDisplay = 'N/A';
        }

        // Format: [filename.pdf] | TF-IDF: 0.234 | Similarity: 0.650 | Pages: 26, 25, 6
        const tfidfScore = typeof citation.tfidf_score === 'number' ? citation.tfidf_score.toFixed(3) : 'N/A';
        const similarityScore = typeof citation.similarity_score === 'number' ? citation.similarity_score.toFixed(3) : 'N/A';
        const filename = citation.source_pdf || 'Unknown.pdf';
        
        chip.innerHTML = `<strong>[${idx + 1}]</strong> ${filename} | TF-IDF: ${tfidfScore} | Similarity: ${similarityScore} | Pages: ${pageDisplay}`;
        chip.title = `Click to open ${filename}`;
        chip.style.cursor = 'pointer';
        chip.addEventListener('click', () => this.openPDFFromCitation(filename));
        chipsWrap.appendChild(chip);
      });
      contentDiv.appendChild(chipsWrap);
        }

        // Add follow-up questions for AI responses
        if (sender === 'assistant' && followUpQuestions && followUpQuestions.length > 0) {
          const contentDiv = messageDiv.querySelector('.message-content');
          const followUpWrap = document.createElement('div');
          followUpWrap.className = 'follow-up-questions';
          const followUpLabel = document.createElement('div');
          followUpLabel.className = 'follow-up-label';
          followUpLabel.textContent = 'Suggested follow-up questions:';
          followUpWrap.appendChild(followUpLabel);
          
          followUpQuestions.forEach((question) => {
            const suggestionChip = document.createElement('div');
            suggestionChip.className = 'suggestion-chip follow-up-chip';
            suggestionChip.textContent = question;
            suggestionChip.addEventListener('click', () => this.useSuggestion(question));
            followUpWrap.appendChild(suggestionChip);
          });
          
          contentDiv.appendChild(followUpWrap);
        }

        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
      }

      this.chatHistory.push({ content, sender, timestamp: new Date().toISOString() });
    }

    // Show citation in overlay without leaving page. Back closes overlay.
    openCitationFromData(citation) {
      history.pushState({ type: 'citation' }, '');
      this.showCitationOverlay(citation);
    }

    showCitationOverlay(citation) {
      this.hideCitationOverlay();
      const overlay = document.createElement('div');
      overlay.id = 'citation-overlay';
      overlay.style.position = 'fixed';
      overlay.style.inset = '0';
      overlay.style.zIndex = '9999';
      overlay.style.display = 'flex';
      overlay.style.flexDirection = 'column';

      const simHdr = typeof citation.similarity_score === 'number' ? ` · Similarity: ${citation.similarity_score.toFixed(2)}` : '';
      overlay.innerHTML = `
        <div style="background:#111827;color:#fff;padding:12px 16px;display:flex;gap:8px;align-items:center">
          <button id="citationBackBtn" style="background:#374151;color:#fff;border:none;border-radius:8px;padding:8px 12px;cursor:pointer">← Back</button>
          <a id="citationOpenPdf" style="background:#3b82f6;color:#fff;border:none;border-radius:8px;padding:8px 12px;text-decoration:none" target="_blank">Open PDF</a>
        </div>
        <div style="flex:1;overflow:auto;background:#f8fafc;padding:24px">
          <h2 style="margin:0 0 12px 0">${(citation.source_pdf || 'source')} - ${citation.page_display || `Page: ${citation.page_no ?? 1}`}${simHdr}</h2>
          <pre style="white-space:pre-wrap;word-break:break-word;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;padding:18px;line-height:1.8">${(citation.chunk_text || '').toString().replace(/</g,'&lt;')}</pre>
      </div>
    `;

      document.body.appendChild(overlay);

      const backBtn = document.getElementById('citationBackBtn');
      const openPdfBtn = document.getElementById('citationOpenPdf');
      const pdfHref = `/uploaded_pdfs/${encodeURIComponent(citation.source_pdf || '')}`;
      openPdfBtn.href = pdfHref;
      openPdfBtn.addEventListener('click', (e) => {
        // Ensure it tries to open even if blocked
        const win = window.open(pdfHref, '_blank');
        if (!win) { e.preventDefault(); window.location.href = pdfHref; }
      });
      backBtn.addEventListener('click', () => history.back());
    }

    hideCitationOverlay() {
      const existing = document.getElementById('citation-overlay');
      if (existing) existing.remove();
    }

    addThinkingIndicator() { if (!this.chatMessages) return; const d = document.createElement('div'); d.className='message thinking'; d.id='thinking-indicator'; d.innerHTML=`<div class="message-avatar">AI</div><div class="message-content thinking-content"><div class="thinking-dots"><span></span><span></span><span></span></div></div>`; this.chatMessages.appendChild(d); this.chatMessages.scrollTop=this.chatMessages.scrollHeight; }
    removeThinkingIndicator() { const t = document.getElementById('thinking-indicator'); if (t) t.remove(); }
    handleKeyPress(e) { if (e.key==='Enter' && !e.shiftKey){ e.preventDefault(); this.sendMessage(); } }
    autoResize() { if (!this.chatInput) return; this.chatInput.style.height='auto'; this.chatInput.style.height=Math.min(this.chatInput.scrollHeight,120)+'px'; }
    checkSendButton() { if (!this.sendBtn || !this.chatInput) return; this.sendBtn.disabled = this.chatInput.value.trim().length===0; }

    showStatus(message, type) { if (!this.statusMessage) return; this.statusMessage.textContent=message; this.statusMessage.className=`status-message status-${type}`; this.statusMessage.style.display='block'; if (type==='success'){ setTimeout(()=>this.hideStatus(),5000);} }
    hideStatus() { if (this.statusMessage) this.statusMessage.style.display='none'; }

    useSuggestion(s) { if (!this.chatInput) return; this.chatInput.value=s; this.autoResize(); this.chatInput.focus(); }
    copyMessage(btn) { try { const mc=btn.closest('.message-content'); const text=mc.childNodes[0].textContent.trim(); navigator.clipboard.writeText(text).then(()=>this.showCopySuccess()).catch(()=>{ const ta=document.createElement('textarea'); ta.value=text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); this.showCopySuccess(); }); } catch(e){ console.error('Copy failed:',e); alert('Failed to copy message.'); } }
    showCopySuccess() { if (!this.copySuccess) return; this.copySuccess.classList.add('show'); setTimeout(()=>this.copySuccess.classList.remove('show'),2000); }

    toggleTheme() { try { const current=document.documentElement.getAttribute('data-theme'); const next=current==='dark'?'light':'dark'; document.documentElement.setAttribute('data-theme',next); localStorage.setItem('theme',next); const icon=this.themeToggle && this.themeToggle.querySelector('i'); if (icon) icon.className = next==='dark'?'fas fa-sun':'fas fa-moon'; } catch(e){ console.error('Theme toggle failed:',e);} }
    initializeTheme() { const saved=localStorage.getItem('theme')||'light'; document.documentElement.setAttribute('data-theme',saved); const icon=this.themeToggle && this.themeToggle.querySelector('i'); if (icon) icon.className = saved==='dark'?'fas fa-sun':'fas fa-moon'; }

    toggleExportOptions() { if (this.exportOptions) this.exportOptions.classList.toggle('show'); }

  // -------- History UI --------
  toggleHistory() {
    if (!this.historySidebar) return;
    const isHidden = this.historySidebar.style.right !== '0px';
    if (isHidden) {
      this.historySidebar.style.right = '0px';
      this.loadConversations();
    } else {
      this.historySidebar.style.right = '-360px';
    }
  }

  async loadConversations() {
    try {
      const resp = await fetch('/conversations/', { method: 'GET' });
      if (!resp.ok) throw new Error('Failed to load conversations');
      const data = await resp.json();
      const list = data.conversations || [];
      // Keep an immutable baseline list for filtering so backspacing restores matches
      this._historyAll = list.slice();
      this.renderConversations(this._historyAll);
    } catch (e) {
      this._historyAll = [];
      this.renderConversations([]);
    }
  }

  renderConversations(list) {
    if (!this.historyList) return;
    this.historyList.innerHTML = '';
    if (!list.length) {
      const empty = document.createElement('div');
      empty.style.padding = '12px 10px';
      empty.style.color = '#9ca3af';
      empty.textContent = 'No conversations yet';
      this.historyList.appendChild(empty);
      return;
    }
    list.forEach(item => {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.flexDirection = 'column';
      row.style.width = '100%';
      row.style.border = '1px solid #1f2937';
      row.style.background = '#0b1220';
      row.style.color = '#e5e7eb';
      row.style.padding = '10px 12px';
      row.style.borderRadius = '10px';
      row.style.margin = '8px';

      const titleBtn = document.createElement('button');
      titleBtn.style.textAlign = 'left';
      titleBtn.style.background = 'transparent';
      titleBtn.style.border = 'none';
      titleBtn.style.color = 'inherit';
      titleBtn.style.cursor = 'pointer';
      titleBtn.style.marginBottom = '8px';
      titleBtn.innerHTML = `<div style="white-space:normal;word-break:break-word;line-height:1.4">${this.escapeHtml(item.title || 'Conversation')}</div><div style="font-size:12px;color:#9ca3af;margin-top:4px">${new Date(item.updated_at).toLocaleString()}</div>`;
      titleBtn.addEventListener('click', () => this.openConversation(item.id));

      const actionsRow = document.createElement('div');
      actionsRow.style.display = 'flex';
      actionsRow.style.gap = '8px';
      actionsRow.style.flexWrap = 'nowrap';

      const shareBtn = document.createElement('button');
      shareBtn.title = 'Download conversation';
      shareBtn.style.background = '#374151';
      shareBtn.style.color = '#fff';
      shareBtn.style.border = 'none';
      shareBtn.style.borderRadius = '8px';
      shareBtn.style.padding = '6px 10px';
      shareBtn.style.cursor = 'pointer';
      shareBtn.innerHTML = '<i class="fas fa-download"></i> Download';
      shareBtn.addEventListener('click', (e) => { e.stopPropagation(); this.downloadConversation(item.id); });

      const delBtn = document.createElement('button');
      delBtn.title = 'Delete conversation';
      delBtn.style.background = '#b91c1c';
      delBtn.style.color = '#fff';
      delBtn.style.border = 'none';
      delBtn.style.borderRadius = '8px';
      delBtn.style.padding = '6px 10px';
      delBtn.style.cursor = 'pointer';
      delBtn.innerHTML = '<i class="fas fa-trash"></i> Delete';
      delBtn.addEventListener('click', (e) => { e.stopPropagation(); this.deleteConversation(item.id); });

      actionsRow.appendChild(shareBtn);
      actionsRow.appendChild(delBtn);

      row.appendChild(titleBtn);
      row.appendChild(actionsRow);
      this.historyList.appendChild(row);
    });
  }

  filterHistory() {
    const q = (this.historySearch && this.historySearch.value || '').toLowerCase();
    const base = this._historyAll || [];
    const query = q.trim();
    if (!query) { this.renderConversations(base); return; }
    // Support multi-keyword AND search
    const terms = query.split(/\s+/).filter(Boolean);
    const filtered = base.filter(it => {
      const hay = `${it.title || ''} ${new Date(it.updated_at).toLocaleString()}`.toLowerCase();
      return terms.every(t => hay.includes(t));
    });
    this.renderConversations(filtered);
  }

  async openConversation(id) {
    try {
      const resp = await fetch(`/conversations/${id}/`, { method: 'GET' });
      if (!resp.ok) throw new Error('Failed to load conversation');
      const data = await resp.json();
      this.conversationId = data.id;
      this.restoreMessages(data.messages || []);

      // Render citations immediately if available (ensure user sees which PDFs)
      if (Array.isArray(data.citations) && data.citations.length) {
        // Attach a lightweight assistant message header to host the chips
        this.addMessage('Restored citations for this conversation:', 'assistant', data.citations, []);
      }
      // If no citations came back, still show associated documents as info
      if ((!data.citations || !data.citations.length) && data.documents && data.documents.length) {
        const infoCitations = (data.documents || []).slice(0,3).map(name => ({ source_pdf: name, page_display: 'Page: -', chunk_text: '' }));
        this.addMessage('Associated documents for this conversation:', 'assistant', infoCitations, []);
      }

      // Render follow-up questions immediately if available
      if (Array.isArray(data.follow_up_questions) && data.follow_up_questions.length) {
        // Attach a lightweight assistant message to host follow-ups
        this.addMessage('Here are suggested follow-up questions:', 'assistant', [], data.follow_up_questions);
      }

      // Show message about restored documents
      if (data.documents && data.documents.length > 0) {
        this.showStatus(`Restored conversation with ${data.documents.length} document(s): ${data.documents.join(', ')}`, 'success');
      }
      
      // Close sidebar after loading
      if (this.historySidebar) this.historySidebar.style.right = '-360px';
    } catch (e) { 
      alert('Failed to open conversation'); 
    }
  }

  restoreMessages(messages) {
    if (this.chatMessages) this.chatMessages.innerHTML = '';
    this.chatHistory = [];
    messages.forEach(m => this.addMessage(m.content, m.sender));
  }

  startNewChat() {
    this.conversationId = null;
    this.clearChat();
    // Clear uploaded files list
    this.clearFiles();
    // Clear all in-memory embeddings when starting fresh
    this.clearAllEmbeddings();
  }

  async downloadConversation(id) {
    try {
      const resp = await fetch(`/conversations/${id}/`, { method: 'GET' });
      if (!resp.ok) throw new Error('Failed to fetch conversation');
      const data = await resp.json();
      const lines = [];
      lines.push(`Title: ${data.title || 'Conversation'}`);
      lines.push(`Created: ${new Date(data.created_at).toLocaleString()}`);
      lines.push(`Updated: ${new Date(data.updated_at).toLocaleString()}`);
      lines.push('');
      (data.messages || []).forEach(m => {
        lines.push(`[${m.timestamp || ''}] ${String(m.sender || '').toUpperCase()}: ${m.content || ''}`);
      });
      const content = lines.join('\n');
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const datePart = new Date(data.updated_at).toISOString().split('T')[0];
      a.download = `conversation-${data.id}-${datePart}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Failed to download conversation');
    }
  }

  async deleteConversation(id) {
    if (!confirm('Delete this conversation?')) return;
    try {
      const resp = await fetch(`/conversations/${id}/`, { method: 'DELETE' });
      if (!resp.ok) throw new Error('Failed');
      // Remove locally from in-memory list and rerender respecting current search
      this._historyAll = (this._historyAll || []).filter(it => it.id !== id);
      this.filterHistory();
    } catch (e) {
      alert('Failed to delete conversation');
    }
  }

  async clearAllEmbeddings() {
    try {
      // Call backend to clear all embeddings
      const response = await fetch('/clear-embeddings/', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (response.ok) {
        console.log('[DEBUG] Cleared all embeddings for new chat');
      }
    } catch (e) {
      console.error('Failed to clear embeddings:', e);
    }
  }

  escapeHtml(str) {
    return (str || '').toString().replace(/[&<>"]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s]));
  }

  exportChat(format) {
    try {
        if (this.chatHistory.length===0) { alert('No chat history to export'); return; }
        let content, filename, mime;
        if (format==='txt') { content=this.chatHistory.map(msg=>`${msg.sender.toUpperCase()}: ${msg.content}\n${new Date(msg.timestamp).toLocaleString()}\n`).join('\n'); filename=`chat-export-${new Date().toISOString().split('T')[0]}.txt`; mime='text/plain'; }
        else { content=JSON.stringify(this.chatHistory,null,2); filename=`chat-export-${new Date().toISOString().split('T')[0]}.json`; mime='application/json'; }
        const blob=new Blob([content],{type:mime}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); this.exportOptions && this.exportOptions.classList.remove('show');
      } catch(e){ console.error('Export failed:',e); alert('Failed to export chat.'); }
    }

    clearChat() { if (confirm('Are you sure you want to clear the chat history?')) { if (this.chatMessages){ this.chatMessages.innerHTML = `<div class="empty-state"><i class="lucide lucide-message-circle-plus"></i><div>Start a conversation by asking a question about your documents</div><div class="suggested-questions"><h4>Try asking:</h4><div class="suggestion-chip" onclick="app.useSuggestion('What is the main topic of this document?')">What is the main topic of this document?</div><div class="suggestion-chip" onclick="app.useSuggestion('Summarize the key points')">Summarize the key points</div><div class="suggestion-chip" onclick="app.useSuggestion('What are the important conclusions?')">What are the important conclusions?</div><div class="suggestion-chip" onclick="app.useSuggestion('Explain the main concepts')">Explain the main concepts</div></div></div>`; } this.chatHistory=[]; } }

    clearFiles() { if (confirm('Are you sure you want to clear all uploaded files?')) { this.selectedFiles=[]; this.renderFileList(); this.updateButtonStates(); if (this.fileInput) this.fileInput.value=''; this.hideStatus(); } }

    resetProcessButton() { if (!this.processBtn) return; this.processBtn.innerHTML='<i class="fas fa-cog"></i> Process Documents'; this.processBtn.disabled=false; this.processBtn.style.background=''; this.processBtn.style.color=''; this.processBtn.style.cursor=''; this.processBtn.style.border=''; this.processBtn.style.boxShadow=''; this.processBtn.style.transform=''; this.processBtn.style.transition=''; this.processBtn.style.fontWeight=''; this.processBtn.style.letterSpacing=''; this.processBtn.style.textShadow=''; this.processBtn.style.borderRadius=''; this.processBtn.style.position=''; this.processBtn.style.overflow=''; }

    formatStructuredContent(content) {
      // Convert markdown-style formatting to HTML
      let formatted = content
        // Convert **text** to <strong>text</strong>
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        // Convert section headers like "**Main Answer:**" to <h3>Main Answer</h3>
        .replace(/\*\*(.*?):\*\*/g, '<h3>$1</h3>')
        // Convert bullet points to proper HTML lists
        .replace(/•\s*(.*?)(?=\n•|\n\n|$)/g, '<li>$1</li>')
        // Wrap consecutive <li> elements in <ul>
        .replace(/(<li>.*?<\/li>)/gs, '<ul>$1</ul>')
        // Clean up multiple <ul> tags
        .replace(/<\/ul>\s*<ul>/g, '')
        // Convert line breaks to <br> for better spacing
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>');
      
      // Wrap in paragraphs if not already wrapped
      if (!formatted.includes('<h3>') && !formatted.includes('<ul>')) {
        formatted = '<p>' + formatted + '</p>';
      }
      
      return formatted;
    }

    // -------- PDF Library Methods --------
    
    async loadPDFLibrary() {
      try {
        console.log('[DEBUG] Loading PDF library...');
        const response = await fetch('/pdf-library/', {
          credentials: 'same-origin'
        });
        if (!response.ok) throw new Error('Failed to load PDF library');
        const data = await response.json();
        console.log('[DEBUG] PDF library response:', data);
        
        this.pdfLibrary = data.pdfs || [];
        console.log('[DEBUG] PDFs loaded:', this.pdfLibrary.length);
        
        if (this.pdfLibrary.length === 0) {
          console.log('[DEBUG] No PDFs found, showing empty state');
          this.showPDFEmptyState();
          // Auto-refresh after 3 seconds to check if PDFs are being processed
          setTimeout(() => {
            console.log('[DEBUG] Auto-refreshing PDF library...');
            this.loadPDFLibrary();
          }, 3000);
        } else {
          console.log('[DEBUG] Rendering PDF grid with', this.pdfLibrary.length, 'PDFs');
          this.renderPDFGrid(this.pdfLibrary);
          this.updatePDFStats(this.pdfLibrary.length);
        }
      } catch (error) {
        console.error('Failed to load PDF library:', error);
        this.showPDFError('Failed to load PDF library. Please refresh the page.');
      }
    }

    async processExistingPDFs() {
      try {
        this.showProcessingState();
        const response = await fetch('/process-existing-pdfs/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin'
        });
        
        if (!response.ok) throw new Error('Failed to process PDFs');
        const data = await response.json();
        
        console.log(`[SUCCESS] Processed ${data.processed_count} PDFs`);
        if (data.errors && data.errors.length > 0) {
          console.warn('[WARNINGS]', data.errors);
        }
        
        // Reload the PDF library after processing
        await this.loadPDFLibrary();
        
      } catch (error) {
        console.error('Failed to process PDFs:', error);
        this.showPDFError('Failed to process PDFs. Please try again.');
      }
    }

    showProcessingState() {
      if (!this.pdfGrid) return;
      this.pdfGrid.innerHTML = `
        <div class="pdf-loading">
          <div class="spinner"></div>
          <span>Processing existing PDFs...</span>
        </div>
      `;
    }

    showPDFEmptyState() {
      if (!this.pdfGrid) return;
      this.pdfGrid.innerHTML = `
        <div class="pdf-empty-state">
          <i class="lucide lucide-folder-open"></i>
          <div>No PDFs found in uploaded_pdfs folder</div>
          <div class="pdf-empty-subtitle">PDFs are being processed automatically...</div>
          <button class="btn" onclick="app.processExistingPDFs()" style="margin-top: 16px;">
            <i class="lucide lucide-settings"></i>
            Process Existing PDFs
          </button>
        </div>
      `;
    }

    renderPDFGrid(pdfs) {
      if (!this.pdfGrid) return;
      
      this.pdfGrid.innerHTML = '';
      
      if (pdfs.length === 0) {
        this.pdfGrid.innerHTML = `
          <div class="pdf-empty-state">
            <i class="lucide lucide-folder-open"></i>
            <div>No PDFs found</div>
            <div class="pdf-empty-subtitle">Upload some PDFs to get started</div>
          </div>
        `;
        return;
      }
      
      pdfs.forEach((pdf, index) => {
        const pdfCard = document.createElement('div');
        pdfCard.className = 'pdf-card';
        pdfCard.style.animationDelay = `${index * 0.1}s`;
        pdfCard.onclick = () => app.openPDFInNewTab(pdf.filename);
        pdfCard.innerHTML = `
          <div class="pdf-card-icon">
            <div class="pdf-icon-header"></div>
            <div class="pdf-icon-content">
              <div class="pdf-icon-lines"></div>
              <div class="pdf-icon-lines"></div>
              <div class="pdf-icon-lines"></div>
            </div>
          </div>
          <div class="pdf-card-content">
            <div class="pdf-card-title">${pdf.display_name}</div>
            <div class="pdf-card-meta">
              <span class="pdf-card-size">${pdf.file_size_mb} MB</span>
              <span class="pdf-card-date">${this.formatDate(pdf.modified_time)}</span>
            </div>
          </div>
          <div class="pdf-card-actions">
            <button class="pdf-view-btn" onclick="event.stopPropagation(); app.openPDFInNewTab('${pdf.filename}')">
              <i class="lucide lucide-eye"></i>
              View
            </button>
          </div>
        `;
        this.pdfGrid.appendChild(pdfCard);
      });
      
      // Reinitialize Lucide icons for new elements
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
    }

    async searchPDFs() {
      const query = this.pdfSearchInput.value.trim();
      this.currentSearchQuery = query;
      
      // If search is empty, show all PDFs
      if (query.length === 0) {
        this.renderPDFGrid(this.pdfLibrary);
        this.updatePDFStats(this.pdfLibrary.length);
        this.clearSearchBtn.style.display = 'none';
        return;
      }
      
      this.clearSearchBtn.style.display = 'block';
      
      // Client-side filtering for instant, dynamic search
      const searchLower = query.toLowerCase();
      const filteredPDFs = this.pdfLibrary.filter(pdf => {
        const displayName = pdf.display_name.toLowerCase();
        const filename = pdf.filename.toLowerCase();
        // Search in both display name and filename
        return displayName.includes(searchLower) || filename.includes(searchLower);
      });
      
      this.renderPDFGrid(filteredPDFs);
      this.updatePDFStats(filteredPDFs.length, query);
    }

    clearSearch() {
      this.pdfSearchInput.value = '';
      this.currentSearchQuery = '';
      this.clearSearchBtn.style.display = 'none';
      this.renderPDFGrid(this.pdfLibrary);
      this.updatePDFStats(this.pdfLibrary.length);
    }

    updatePDFStats(count, query = '') {
      if (!this.pdfCount) return;
      
      if (query) {
        this.pdfCount.textContent = `${count} PDFs found for "${query}"`;
      } else {
        this.pdfCount.textContent = `${count} PDFs available`;
      }
      
      this.pdfStats.style.display = 'block';
    }

    openPDFInNewTab(filename) {
      window.open(`/view/${encodeURIComponent(filename)}`, '_blank');
    }

    // Open PDF from citation - opens in viewer
    openPDFFromCitation(filename) {
      // Navigate to the PDF viewer page
      window.location.href = `/view/${encodeURIComponent(filename)}`;
    }

    formatDate(timestamp) {
      const date = new Date(timestamp * 1000);
      return date.toLocaleDateString();
    }

    showPDFError(message) {
      if (!this.pdfGrid) return;
      this.pdfGrid.innerHTML = `
        <div class="pdf-error-state">
          <i class="lucide lucide-alert-triangle"></i>
          <div>${message}</div>
        </div>
      `;
    }

    // PDF Viewer Functions
    openPDFOverlay(filename) {
      this.currentPDF = filename;
      // Encode the filename to handle special characters
      const encodedFilename = encodeURIComponent(filename);
      const pdfUrl = `/uploaded_pdfs/${encodedFilename}`;
      
      console.log('Opening PDF:', filename, 'URL:', pdfUrl);
      
      if (this.pdfViewerOverlay && this.pdfViewerFrame && this.pdfViewerTitle) {
        this.pdfViewerTitle.textContent = filename;
        this.pdfChatTitle.textContent = `Chat with ${filename}`;
        this.pdfViewerOverlay.style.display = 'flex';
        
        // Add error handling for PDF loading
        this.pdfViewerFrame.onload = () => {
          console.log('PDF loaded successfully');
        };
        
        this.pdfViewerFrame.onerror = () => {
          console.error('Failed to load PDF:', pdfUrl);
          // Show error message in the iframe
          this.pdfViewerFrame.srcdoc = `
            <html>
              <body style="display: flex; align-items: center; justify-content: center; height: 100vh; font-family: Arial, sans-serif; background: #f5f5f5;">
                <div style="text-align: center; padding: 20px;">
                  <div style="font-size: 48px; color: #e74c3c; margin-bottom: 20px;">📄❌</div>
                  <h2 style="color: #333; margin-bottom: 10px;">PDF Not Found</h2>
                  <p style="color: #666; margin-bottom: 20px;">The file "${filename}" could not be loaded.</p>
                  <p style="color: #999; font-size: 14px;">URL: ${pdfUrl}</p>
                  <p style="color: #999; font-size: 14px;">Please check if the file exists and try again.</p>
                </div>
              </body>
            </html>
          `;
        };
        
        // Set the PDF source
        this.pdfViewerFrame.src = pdfUrl;
        
        // Update chat context
        this.updateChatContext(filename);
      }
    }

    hidePDFViewer() {
      console.log('hidePDFViewer called');
      if (this.pdfViewerOverlay) {
        this.pdfViewerOverlay.style.display = 'none';
        this.pdfViewerFrame.src = '';
        this.currentPDF = null;
        
        // Clear chat context
        this.updateChatContext(null);
        console.log('PDF viewer hidden successfully');
      } else {
        console.error('PDF viewer overlay not found');
      }
    }

    updateChatContext(filename) {
      const chatMessages = this.chatMessages;
      if (!chatMessages) return;

      if (filename) {
        // Update empty state for document-specific chat
        const emptyState = chatMessages.querySelector('.empty-state');
        if (emptyState) {
          emptyState.innerHTML = `
            <i class="fas fa-file-pdf"></i>
            <div>Ask questions about "${filename}"</div>
            <div class="suggested-questions">
              <h4>Try asking:</h4>
              <div class="suggestion-chip" onclick="app.useSuggestion('What is this document about?')">What is this document about?</div>
              <div class="suggestion-chip" onclick="app.useSuggestion('Summarize the main points')">Summarize the main points</div>
              <div class="suggestion-chip" onclick="app.useSuggestion('What are the key findings?')">What are the key findings?</div>
              <div class="suggestion-chip" onclick="app.useSuggestion('Explain the methodology')">Explain the methodology</div>
            </div>
          `;
        }
      } else {
        // Reset to general empty state
        const emptyState = chatMessages.querySelector('.empty-state');
        if (emptyState) {
          emptyState.innerHTML = `
            <i class="lucide lucide-message-circle-plus"></i>
            <div>Start a conversation by asking a question about your documents</div>
            <div class="suggested-questions">
              <h4>Try asking:</h4>
              <div class="suggestion-chip" onclick="app.useSuggestion('What is the main topic of this document?')">What is the main topic of this document?</div>
              <div class="suggestion-chip" onclick="app.useSuggestion('Summarize the key points')">Summarize the key points</div>
              <div class="suggestion-chip" onclick="app.useSuggestion('What are the important conclusions?')">What are the important conclusions?</div>
              <div class="suggestion-chip" onclick="app.useSuggestion('Explain the main concepts')">Explain the main concepts</div>
            </div>
          `;
        }
      }
    }

    // PDF Chat Functions
    usePDFSuggestion(suggestion) {
      if (this.pdfChatInput) {
        this.pdfChatInput.value = suggestion;
        this.sendPDFMessage();
      }
    }

    async sendPDFMessage() {
      const message = this.pdfChatInput ? this.pdfChatInput.value.trim() : '';
      if (!message) return;
      
      console.log('Sending PDF message:', message, 'for document:', this.currentPDF);
      
      // Add message to the main chat interface
      this.addMessage(message, 'user');
      
      // Clear input
      if (this.pdfChatInput) {
        this.pdfChatInput.value = '';
      }
      
      // Disable send button
      if (this.pdfChatSend) this.pdfChatSend.disabled = true;
      this.addThinkingIndicator();

      try {
        // Send message with PDF context
        const requestBody = { 
          query: message, 
          conversation_id: this.conversationId,
          pdf_context: this.currentPDF  // Pass the current PDF filename
        };
        
        console.log('Sending request with PDF context:', requestBody);
        
        const response = await fetch('/query/', { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify(requestBody) 
        });
        
        const data = await response.json();
        this.removeThinkingIndicator();
        
        if (response.ok) {
          if (data.conversation_id) this.conversationId = data.conversation_id;
          
          // Add AI response
          this.addMessage(data.answer, 'assistant', data.citations || [], data.follow_up_questions || []);
        }
        else {
          this.addMessage(data.error || 'Sorry, I encountered an error.', 'assistant');
        }
      } catch (err) {
        this.removeThinkingIndicator();
        this.addMessage('Sorry, I encountered an error: ' + err.message, 'assistant');
      } finally { 
        if (this.pdfChatSend) this.pdfChatSend.disabled = false; 
      }
    }
  }

  // Initialize once DOM is ready
let app;
  window.addEventListener('DOMContentLoaded', () => {
try {
  app = new DocumentAssistant();
      window.app = app;
      setTimeout(() => { app.updateButtonStates && app.updateButtonStates(); app.checkSendButton && app.checkSendButton(); }, 100);
    } catch (err) { console.error('Failed to initialize app:', err); alert('Failed to initialize the application. Please refresh the page.'); }
  });

  window.addEventListener('error', function(e) { console.error('JavaScript error:', e.error || e.message || e); });
})();
