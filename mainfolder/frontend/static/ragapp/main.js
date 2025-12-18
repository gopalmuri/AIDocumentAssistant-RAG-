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
    this.statusPollInterval = null;
    this.userFavorites = new Set();
    this.isAuthenticated = document.body.dataset.isAuthenticated === 'true' || true; // Fallback or logic to determine auth
    this.initializeElements();
    this.attachEventListeners();
    if (window.pdfContext) this.currentPDF = window.pdfContext; // Capture context
    this.loadPDFLibrary();
    this.startStatusPolling();
    this.restoreActiveSession(); // New persistence logic
  }

  async restoreActiveSession() {
      // Only restore if we are on the Chat Page (have chatMessages container)
      if (!this.chatMessages) return;

      // Check current page context
      let savedId;
      if (window.pdfContext) {
           // PDF viewer has its own scope
           // We might want to persist the chat for this document?
           // For now, let's assume valid session if user just refreshed
           savedId = localStorage.getItem('current_conversation_id'); 
      } else {
           // On Global Chat Page (no PDF)
           // Use the "Global" ID if available to persist the main chat
           savedId = localStorage.getItem('global_conversation_id');
      }
      
      if (savedId) {
          console.log('[PERSIST] Restoring conversation:', savedId);
          this.conversationId = savedId; // Set immediately
          try {
              // Fetch history for this ID
              await this.loadConversationHistory(savedId); 
              // openConversation might trigger UI shifts we don't want, so we use loadConversationHistory directly
          } catch (e) {
              console.warn('[PERSIST] Failed to restore session, starting new:', e);
              localStorage.removeItem(window.pdfContext ? 'current_conversation_id' : 'global_conversation_id');
              // Don't necessarily start new chat immediately if we want to show empty state, 
              // but setting conversationId = null happens automatically if we don't set it.
              this.conversationId = null; 
          }
      }
  }

    initializeElements() {
    // PDF Library elements
    this.pdfGrid = document.getElementById('pdfGrid');
    this.pdfSearchInput = document.getElementById('pdfSearchInput');
    this.clearSearchBtn = document.getElementById('clearSearchBtn');
    this.pdfStats = document.getElementById('pdfStats');
    this.pdfCount = document.getElementById('pdfCount');
    
    this.uploadArea = document.getElementById('uploadArea');
    this.fileInput = document.getElementById('fileInput');
    this.fileList = document.getElementById('fileList');
    this.processBtn = document.getElementById('processBtn');
    this.processingLoading = document.getElementById('processingLoading');
    this.pdfGrid = document.getElementById('pdfGrid');
    
    // Main Chat
    this.chatInput = document.getElementById('chatInput') || document.getElementById('chatPageInput'); // Handle both page types
    this.chatMessages = document.getElementById('chatMessages');
    this.sendBtn = document.getElementById('sendBtn') || document.getElementById('chatPageSend');
    this.micBtn = document.getElementById('micBtn');

    // Overlay Chat
    this.pdfChatInput = document.getElementById('pdfChatInput');
    this.pdfChatMessages = document.getElementById('pdfChatMessages');
    this.pdfSendBtn = document.getElementById('pdfSendBtn');

    // Navbar
    this.navNewChatBtn = document.getElementById('navNewChatBtn');
    this.newChatFullBtn = document.getElementById('newChatFullBtn');
    this.chatUploadProgress = document.getElementById('chatUploadProgress');

    this.themeToggle = document.getElementById('themeToggle');
    this.exportBtn = document.getElementById('exportBtn');
    this.exportOptions = document.getElementById('exportOptions');
    this.clearChatBtn = document.getElementById('clearChatBtn');
    this.clearFilesBtn = document.getElementById('clearFilesBtn');
    this.copySuccess = document.getElementById('copySuccess');

    // History UI
    this.historyBtn = document.getElementById('historyBtn');
    this.newChatBtn = document.getElementById('newChatBtn'); // Sidebar one if exists
    this.newChatFullBtn = document.getElementById('newChatFullBtn'); // Chat Page Above Input
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

    // New UI Elements
    this.cmdPaletteOverlay = document.getElementById('cmdPaletteOverlay');
    this.cmdInput = document.getElementById('cmdInput');
    this.fabMain = document.getElementById('fabMain');
    this.toastContainer = document.getElementById('toastContainer');
  }

  attachEventListeners() {
      const safeAdd = (el, evt, handler, opts) => {
        if (el && el.addEventListener) el.addEventListener(evt, handler, opts || false);
      };

      safeAdd(this.uploadArea, 'click', () => this.fileInput && this.fileInput.click());
      safeAdd(this.uploadArea, 'dragover', this.handleDragOver.bind(this));
      safeAdd(this.uploadArea, 'dragleave', this.handleDragLeave.bind(this));
      safeAdd(this.uploadArea, 'drop', this.handleDrop.bind(this));
      
      safeAdd(this.newChatBtn, 'click', this.startNewConversation.bind(this)); // Coupled logic

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
      safeAdd(this.newChatBtn, 'click', this.startNewConversation.bind(this));
      safeAdd(this.newChatFullBtn, 'click', this.startNewConversation.bind(this));
      safeAdd(this.historySearch, 'input', this.filterHistory.bind(this));

      // Navbar Optimization: Prevent reload ONLY for AI Chat link if already on page
      const navLinks = document.querySelectorAll('.nav-item');
      navLinks.forEach(link => {
          link.addEventListener('click', (e) => {
              // Check if it's the Chat link AND we are already on it (ignore params)
              if (link.href.includes('/chat/') && window.location.pathname.includes('/chat/')) {
                  e.preventDefault();
                  // console.log("Prevented redundant chat reload");
              }
          });
      });

      // PDF Library event listeners with debouncing for smooth search
      let searchTimeout;
      safeAdd(this.pdfSearchInput, 'input', (e) => {
          clearTimeout(searchTimeout);
          searchTimeout = setTimeout(() => this.searchPDFs(), 300);
      });



      safeAdd(this.clearSearchBtn, 'click', this.clearSearch.bind(this));


      // Dashboard Search Redirect
      const heroSearchInput = document.getElementById('heroSearchInput');
      const heroSearchSubmit = document.getElementById('heroSearchSubmit');
      
      const handleDashSearch = () => {
          if (heroSearchInput && heroSearchInput.value.trim()) {
              window.location.href = '/chat/?q=' + encodeURIComponent(heroSearchInput.value.trim());
          }
      };
      
      safeAdd(heroSearchSubmit, 'click', handleDashSearch);
      if (heroSearchInput) {
          heroSearchInput.addEventListener('keypress', (e) => {
              if (e.key === 'Enter') handleDashSearch();
          });
      }
      
      // Chat Page Listeners
      safeAdd(this.chatPageSend, 'click', this.sendChatMessage.bind(this));
      if (this.chatPageInput) {
          this.chatPageInput.addEventListener('keypress', (e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  this.sendChatMessage();
              }
          });
      }
      
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

      // 5. Logout Handler
      const logoutBtn = document.getElementById('logoutBtn');
      if (logoutBtn) {
          logoutBtn.addEventListener('click', (e) => {
              // Clear all persistence
              localStorage.removeItem('current_conversation_id');
              localStorage.removeItem('global_conversation_id');
              
              // Clear document-specific sessions
              Object.keys(localStorage).forEach(key => {
                 if (key.startsWith('chat_session_pdf_') || key.startsWith('chat_session_')) {
                     localStorage.removeItem(key);
                 }
              });
          });
      }

      // 6. Global Click Listener for Dropdowns
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
      
      // Ensure Clean Exit: If no active conversation (New Chat state), wipe storage on unload
      window.addEventListener('beforeunload', () => {
           if (!this.conversationId) {
                // Nuclear Clear to prevent "Old Chat" ghosting
                Object.keys(localStorage).forEach(key => {
                    if (key.startsWith('chat_session_') || key === 'current_conversation_id') {
                        localStorage.removeItem(key);
                    }
                });
           }
      });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + K for Command Palette
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        this.toggleCommandPalette();
      }
      // Esc to close palette/modals
      if (e.key === 'Escape') {
        this.hideCitationOverlay();
        if (this.pdfViewerOverlay && this.pdfViewerOverlay.style.display === 'flex') {
          this.hidePDFViewer();
        }
        if (this.cmdPaletteOverlay && this.cmdPaletteOverlay.style.display === 'flex') {
          this.toggleCommandPalette(false);
        }
      }
    });

    if (this.fabMain) {
      this.fabMain.addEventListener('click', () => this.cmdAction('new_chat')); // Default FAB action
    }

    if (this.cmdInput) {
      this.cmdInput.addEventListener('input', (e) => this.filterCommands(e.target.value));
    }

    if (this.cmdPaletteOverlay) {
      this.cmdPaletteOverlay.addEventListener('click', (e) => {
        if (e.target === this.cmdPaletteOverlay) this.toggleCommandPalette(false);
      });
    }

    this.initializeTheme();
    this.initializeNavbar();
  }
  
  initializeNavbar() {
     // Global delegated listeners for Navigation to avoid binding issues
     document.addEventListener('click', (e) => {
         // Profile Dropdown Trigger
         const trigger = e.target.closest('#accountTrigger');
         if (trigger) {
             e.preventDefault();
             e.stopPropagation();
             const dropdown = document.getElementById('accountDropdown');
             if (dropdown) dropdown.classList.toggle('visible');
         } else {
             // Close if clicking outside
             const dropdown = document.getElementById('accountDropdown');
             if (dropdown && dropdown.classList.contains('visible') && !e.target.closest('#accountDropdown')) {
                 dropdown.classList.remove('visible');
             }
         }
         
         // Logout
         const logoutBtn = e.target.closest('#logoutBtn');
         if (logoutBtn) {
             e.preventDefault();
             this.handleLogout();
         }
     });
  }

  async handleLogout() {
      function getCookie(name) {
          let cookieValue = null;
          if (document.cookie && document.cookie !== '') {
              const cookies = document.cookie.split(';');
              for (let i = 0; i < cookies.length; i++) {
                  const cookie = cookies[i].trim();
                  if (cookie.substring(0, name.length + 1) === (name + '=')) {
                      cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                      break;
                  }
              }
          }
          return cookieValue;
      }
      const csrftoken = getCookie('csrftoken');
      try {
          // Clear session data
          localStorage.removeItem('current_conversation_id');
          localStorage.removeItem('server_instance_id');
          
          await fetch('/api/auth/logout/', { 
              method: 'POST',
              headers: {
                  'X-CSRFToken': csrftoken,
                  'Content-Type': 'application/json'
              }
          });
          // Redirect to Landing Page
          window.location.href = '/';
      } catch (e) { console.error("Logout failed", e); window.location.href = '/'; }
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


  updateButtonStates() {
    const hasFiles = this.selectedFiles.length > 0;
    
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

  async sendMessage(manualMessage = null) {
    const message = manualMessage || (this.chatInput && this.chatInput.value || '').trim();
    if (!message) return;
    this.addChatMessage('user', message);
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
          requestBody.pdf_context = this.currentPDF;
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
          if (data.conversation_id) {
              this.conversationId = data.conversation_id;
              localStorage.setItem('current_conversation_id', this.conversationId);
              // Save Global Chat ID separately only if NOT in PDF context
              if (!this.currentPDF) {
                  localStorage.setItem('global_conversation_id', this.conversationId);
              }
          }
          
          // Handle document-specific responses
          if (this.currentPDF && (!data.answer || data.answer.includes('not found'))) {
            this.addChatMessage('ai', "I could not find an answer to your question in this document. Please try asking about a different aspect of the document or select a different document.");
          } else {
            this.addChatMessage('ai', data.answer, data.citations || [], data.follow_up_questions || []);
          }
        }
        else this.addChatMessage('ai', data.error || 'Sorry, I encountered an error.');
      } catch (err) {
      this.removeThinkingIndicator();
        this.addChatMessage('ai', 'Sorry, I encountered an error: ' + err.message);
      } finally { if (this.sendBtn) this.sendBtn.disabled = false; }
    }

    addMessage(content, sender, citations = [], followUpQuestions = []) {
      // Proxy to new renderer
      const role = sender === 'user' ? 'user' : 'ai';
      this.addChatMessage(role, content, citations, followUpQuestions);
      return;
      /* Legacy Code Disabled to Fix Bug and Unify UI
      if (this.chatMessages) {
        const emptyState = this.chatMessages.querySelector('.empty-state');
        if (emptyState) emptyState.remove();

        const rowDiv = document.createElement('div');
        rowDiv.className = `message-row ${role} message-fade-in`; // Add fade-in animation
        rowDiv.id = `msg-${Date.now()}`; // Unique ID for keying
        
        const bubbleDiv = document.createElement('div');
        bubbleDiv.className = `message-bubble ${sender}`;
        
        const actionsHtml = sender === 'assistant' ? `<div class="message-actions" style="position:absolute;top:5px;right:5px;"><button class="action-btn" onclick="app.copyMessage(this)" title="Copy message"><i class="fas fa-copy"></i></button></div>` : '';
        
        // Convert markdown-style formatting to HTML
        const formattedContent = this.formatStructuredContent(content);
        
        // Time stamp
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        bubbleDiv.innerHTML = `${formattedContent}${actionsHtml}`;
        
        // Append bubble to row
        rowDiv.appendChild(bubbleDiv);
        this.chatMessages.appendChild(rowDiv);
    
        if (sender === 'assistant' && citations && citations.length) {
            const chipsWrap = document.createElement('div');
            chipsWrap.className = 'citations';
            chipsWrap.style.marginTop = '12px'; // Add spacing
            
            const sourcesLabel = document.createElement('div');
            sourcesLabel.className = 'sources-label';
            sourcesLabel.textContent = 'Sources:';
            chipsWrap.appendChild(sourcesLabel);
            
            citations.forEach((citation, idx) => {
                const chip = document.createElement('span');
                chip.className = 'citation-chip'; // Ensure CSS exists or use chip class
                // styling for chip needed if citation-chip not defined in new CSS
                if (!document.querySelector('style').innerHTML.includes('.citation-chip')) {
                    chip.className = 'chip'; // Fallback to chip class
                    chip.style.margin = '4px';
                    chip.style.display = 'inline-block';
                }

                let pageDisplay;
                if (citation.page_display) pageDisplay = citation.page_display;
                else if (citation.page_numbers && citation.page_numbers.length > 0) pageDisplay = citation.page_numbers.join(', ');
                else if (citation.page_no) pageDisplay = citation.page_no;
                else pageDisplay = 'N/A';

                const filename = citation.source_pdf || 'source';
                chip.innerHTML = `<strong>[${idx + 1}]</strong> ${filename} (Pg ${pageDisplay})`;
                chip.title = `Click to open ${filename}`;
                 // Using inline style for citation chips if class missing in main chat css
                chip.style.fontSize = '0.8rem';
                
                chip.addEventListener('click', () => this.openPDFFromCitation(filename));
                chipsWrap.appendChild(chip);
            });
            bubbleDiv.appendChild(chipsWrap);
        }

        // Add follow-up questions for AI responses
        if (sender === 'assistant' && followUpQuestions && followUpQuestions.length > 0) {
          const followUpWrap = document.createElement('div');
          followUpWrap.className = 'suggestions'; 
          followUpWrap.style.justifyContent = 'flex-start'; // Align left inside bubble? Or below?
          followUpWrap.style.marginTop = '12px';
          
          followUpQuestions.forEach((question) => {
            const suggestionChip = document.createElement('div');
            suggestionChip.className = 'chip';
            suggestionChip.style.fontSize = '0.8rem';
            suggestionChip.style.padding = '6px 12px';
            suggestionChip.textContent = question;
            suggestionChip.addEventListener('click', () => this.useChatSuggestion(question));
            followUpWrap.appendChild(suggestionChip);
          });
          
          // Append follow-ups INSIDE bubble for AI
          bubbleDiv.appendChild(followUpWrap);
        }

        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
      }

      this.chatHistory.push({ content, sender, timestamp: new Date().toISOString() });
    */ }

    simpleFormat(content) {
        // Basic markdown formatting for User messages or simple AI replies
        return content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br>');
    }

    formatStructuredContent(content) {
        // Strict Section Parsing
        const allowedHeaders = ["Main Answer", "Key Points", "Details", "Summary"];
        const sections = {};
        let currentHeader = "Main Answer"; 
        sections[currentHeader] = "";
        
        // Split by headers using capture group to safely tokenize
        const parts = content.split(/(\*\*(?:Main Answer|Key Points|Details|Summary):\*\*)/g);
        
        if (parts.length > 1) {
             sections["Main Answer"] = parts[0]; 
             for (let i = 1; i < parts.length; i += 2) {
                 const headerRaw = parts[i];
                 const body = parts[i+1] || "";
                 // Clean header
                 const headerClean = headerRaw.replace(/\*\*/g, '').replace(':', '').trim();
                 
                 if (allowedHeaders.includes(headerClean)) {
                     sections[headerClean] = body;
                 } else {
                     // Append content to previous or Main Answer if unknown header
                     sections["Details"] += "\n" + headerRaw + "\n" + body;
                 }
             }
        } else {
            return this.simpleFormat(content);
        }
        
        let html = '';
        allowedHeaders.forEach(header => {
            if (sections[header] && sections[header].trim()) {
                 let body = sections[header].trim();
                 // Format body
                 body = body
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/•\s*(.*?)(?=\n•|\n\n|$)/g, '<li>$1</li>')
                    .replace(/(<li>.*?<\/li>)/gs, '<ul>$1</ul>')
                    .replace(/<\/ul>\s*<ul>/g, '')
                    .replace(/\n\n/g, '</p><p>')
                    .replace(/\n/g, '<br>');
                    
                 if (!body.startsWith('<p>') && !body.startsWith('<ul>')) body = `<p>${body}</p>`;
                 
                 // Open Main Answer by default
                 const isOpen = header === "Main Answer" ? "open" : "";
                 const className = header === "Main Answer" ? "ai-section main-answer" : "ai-section";
                 
                 html += `
                    <details class="${className}" ${isOpen}>
                        <summary>${header}</summary>
                        <div class="section-content">${body}</div>
                    </details>
                 `;
            }
        });
        
        return html;
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

    addThinkingIndicator() { 
        if (!this.chatMessages) return; 
        
        // Remove existing if any (prevent duplicates)
        this.removeThinkingIndicator();

        const row = document.createElement('div');
        row.className = 'message-row ai';
        row.id = 'thinking-indicator';
        
        row.innerHTML = `
            <div class="message-avatar">
                <div class="ai-avatar-small ai-avatar-pulse">
                    <i class="fas fa-robot"></i>
                </div>
            </div>
            <div class="message-content">
                <div class="message-bubble ai thinking-bubble">
                    <div class="typing-indicator">
                        <span class="typing-dot"></span>
                        <span class="typing-dot"></span>
                        <span class="typing-dot"></span>
                    </div>
                </div>
            </div>
        `;
        
        this.chatMessages.appendChild(row); 
        this.scrollToBottom(); 
    }
    removeThinkingIndicator() { const t = document.getElementById('thinking-indicator'); if (t) t.remove(); }
    handleKeyPress(e) { if (e.key==='Enter' && !e.shiftKey){ e.preventDefault(); this.sendMessage(); } }
    autoResize() { if (!this.chatInput) return; this.chatInput.style.height='auto'; this.chatInput.style.height=Math.min(this.chatInput.scrollHeight,120)+'px'; }
    checkSendButton() { if (!this.sendBtn || !this.chatInput) return; this.sendBtn.disabled = this.chatInput.value.trim().length===0; }

    // Toast Notification System
    showStatus(message, type = 'info') {
      if (!this.toastContainer) return;
      
      const toast = document.createElement('div');
      toast.className = `toast ${type}`;
      
      let icon = 'info-circle';
      if (type === 'success') icon = 'check-circle';
      if (type === 'error') icon = 'exclamation-circle';
      
      toast.innerHTML = `
        <i class="fas fa-${icon}"></i>
        <span>${message}</span>
      `;
      
      this.toastContainer.appendChild(toast);
      
      // Auto remove
      setTimeout(() => {
        toast.style.animation = 'slideInRight 0.3s reverse forwards';
        setTimeout(() => toast.remove(), 300);
      }, 4000);
    }
    


    useSuggestion(s) { if (!this.chatInput) return; this.chatInput.value=s; this.autoResize(); this.chatInput.focus(); }
    copyMessage(btn) { try { const mc=btn.closest('.message-content'); const text=mc.childNodes[0].textContent.trim(); navigator.clipboard.writeText(text).then(()=>this.showCopySuccess()).catch(()=>{ const ta=document.createElement('textarea'); ta.value=text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); this.showCopySuccess(); }); } catch(e){ console.error('Copy failed:',e); alert('Failed to copy message.'); } }
    showCopySuccess() { if (!this.copySuccess) return; this.copySuccess.classList.add('show'); setTimeout(()=>this.copySuccess.classList.remove('show'),2000); }

    toggleTheme() { try { const current=document.documentElement.getAttribute('data-theme'); const next=current==='dark'?'light':'dark'; document.documentElement.setAttribute('data-theme',next); localStorage.setItem('theme',next); const icon=this.themeToggle && this.themeToggle.querySelector('i'); if (icon) icon.className = next==='dark'?'fas fa-sun':'fas fa-moon'; } catch(e){ console.error('Theme toggle failed:',e);} }
    initializeTheme() { const saved=localStorage.getItem('theme')||'light'; document.documentElement.setAttribute('data-theme',saved); const icon=this.themeToggle && this.themeToggle.querySelector('i'); if (icon) icon.className = saved==='dark'?'fas fa-sun':'fas fa-moon'; }

    toggleExportOptions() { if (this.exportOptions) this.exportOptions.classList.toggle('show'); }

    // Command Palette Methods
    toggleCommandPalette(show) {
      if (!this.cmdPaletteOverlay) return;
      const isVisible = this.cmdPaletteOverlay.classList.contains('active');
      const shouldShow = show !== undefined ? show : !isVisible;
      
      if (shouldShow) {
        this.cmdPaletteOverlay.style.display = 'flex';
        // Force reflow
        this.cmdPaletteOverlay.offsetHeight; 
        this.cmdPaletteOverlay.classList.add('active');
        if (this.cmdInput) {
          this.cmdInput.value = '';
          this.cmdInput.focus();
        }
      } else {
        this.cmdPaletteOverlay.classList.remove('active');
        setTimeout(() => {
          this.cmdPaletteOverlay.style.display = 'none';
        }, 200);
      }
    }
    
    cmdAction(action) {
      this.toggleCommandPalette(false);
      switch(action) {
        case 'new_chat': this.startNewChat(); break;
        case 'toggle_theme': this.toggleTheme(); break;
        case 'clear_chat': this.clearChat(); break;
      }
    }
    
    filterCommands(query) {
      if (!this.cmdPaletteOverlay) return;
      const items = this.cmdPaletteOverlay.querySelectorAll('.cmd-item');
      items.forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(query.toLowerCase()) ? 'flex' : 'none';
      });
    }

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
      const resp = await fetch(`/conversations/?t=${new Date().getTime()}`, { method: 'GET' });
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
    // If not on a chat page (e.g. Dashboard), navigate to Chat Page with context
    if (!this.chatMessages) {
        sessionStorage.setItem('restore_chat_id', id);
        window.location.href = '/chat/';
        return;
    }
    try {
      const resp = await fetch(`/conversations/${id}/`, { method: 'GET' });
      if (resp.status === 404) throw new Error('404');
      if (!resp.ok) throw new Error('Failed to load conversation');
      const data = await resp.json();
      this.conversationId = data.id;
      this.restoreMessages(data.messages || []);
      localStorage.setItem('current_conversation_id', this.conversationId); // Persist ID logic

      // Check if favorit and update UI
      if (data.is_favorite !== undefined) {
          this.updateFavoriteChatUI(data.is_favorite);
      } else {
           // Default false or check later? For now assume false or ignore
           this.updateFavoriteChatUI(false);
      }

      // Legacy citation blocks removed (citations are now part of message structure)

      // Show message about restored documents
      if (data.documents && data.documents.length > 0) {
        this.showStatus(`Restored conversation with ${data.documents.length} document(s): ${data.documents.join(', ')}`, 'success');
      }
      
      // Close sidebar after loading
      if (this.historySidebar) this.historySidebar.style.right = '-360px';
    } catch (e) { 
      // Only clear persistence if specifically 404 (Not Found)
      // e.message check is a simple proxy if fetch throws generic error
      if (e.message === '404' && localStorage.getItem('current_conversation_id') === String(id)) {
          console.warn('Conversation not found (404), clearing persistence');
          localStorage.removeItem('current_conversation_id');
          this.startNewChat(true); 
      } else {
          console.error('Failed to open conversation:', e);
          if (e.message !== '404') {
             // Server error or network error - DO NOT CLEAR, potentially actionable
             // alert('Failed to restore conversation. Please check your connection.'); 
          }
      }
    }
  }

  updateFavoriteChatUI(isFavorite) {
      const btn = document.getElementById('favoriteChatBtn');
      if (!btn) return;
      const icon = btn.querySelector('i');
      if (isFavorite) {
          icon.className = 'fas fa-heart';
          icon.style.color = '#ef4444';
          btn.title = 'Remove from Favorites';
      } else {
          icon.className = 'far fa-heart';
          icon.style.color = '';
          btn.title = 'Add to Favorites';
      }
  }

  async toggleChatFavorite() {
      if (!this.conversationId) {
          alert('Start a chat first!');
          return;
      }
      try {
          const resp = await fetch(`/conversations/${this.conversationId}/toggle-favorite/`, {
              method: 'POST',
              headers: {
                  'X-CSRFToken': this.getCsrfToken() || this.getCookie('csrftoken') // Ensure logic exists
              }
          });
          if (resp.ok) {
              const data = await resp.json();
              this.updateFavoriteChatUI(data.is_favorite);
              this.showStatus(data.is_favorite ? 'Added to Favorites' : 'Removed from Favorites', 'success');
          } else {
              throw new Error('Failed');
          }
      } catch (e) {
          console.error(e);
          alert('Failed to update favorite status');
      }
  }

  getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
  }

  restoreMessages(messages) {
    if (this.chatMessages) this.chatMessages.innerHTML = '';
    this.chatHistory = []; // Reset history as addChatMessage might push to it or we rely on backend
    messages.forEach(m => {
        // Map backend 'assistant' to 'ai' if needed, but addChatMessage handles 'ai'/'user' logic
        const role = m.sender === 'user' ? 'user' : 'ai';
        this.addChatMessage(role, m.content, m.citations || [], m.follow_up_questions || []);
    });
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
    
    const getCookie = (name) => {
        let cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                if (cookie.substring(0, name.length + 1) === (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    };

    try {
      const resp = await fetch(`/conversations/${id}/`, { 
          method: 'DELETE',
          headers: {
              'X-CSRFToken': getCookie('csrftoken'),
              'Content-Type': 'application/json'
          } 
      });
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



    clearChat() { 
    if (confirm('Are you sure you want to clear the chat history?')) { 
        if (this.chatMessages){ 
            this.chatMessages.innerHTML = `
            <div class="empty-state">
                <div class="welcome-container">
                    <div class="ai-avatar-large">
                        <i class="fas fa-layer-group"></i>
                    </div>
                    <h1>AI-Powered Knowledge Retrieval Assistant</h1>
                    <p class="subtitle">I can help you analyze documents, extract insights, and answer questions. Upload a PDF to get started.</p>
                </div>

                <div class="suggestions-container">
                    <div class="suggestions-grid">
                        <button class="suggestion-card" onclick="app.useChatSuggestion('Summarize my documents')">
                            <span>Summarize my documents</span>
                        </button>
                        <button class="suggestion-card" onclick="app.useChatSuggestion('What are the key findings?')">
                            <span>What are the key findings?</span>
                        </button>
                        <button class="suggestion-card" onclick="app.useChatSuggestion('Explain the last PDF')">
                            <span>Explain the last PDF</span>
                        </button>
                         <button class="suggestion-card" onclick="app.useChatSuggestion('List action items')">
                            <span>List action items</span>
                        </button>
                    </div>
                </div>
            </div>`; 
        } 
        this.chatHistory=[]; 
    } 
}




    renderEmptyState() {
        if (!this.chatMessages) return;
        
        if (window.pdfContext) {
            // PDF Viewer Specific HTML (Matches pdf_viewer.html CSS)
            this.chatMessages.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon-stack"><i class="fas fa-file-pdf"></i></div>
                    <h3>Chat with ${window.pdfContext}</h3>
                    <p>Answers are generated strictly from the currently opened document.</p>
                    <div class="empty-chips">
                        <button onclick="app.useChatSuggestion('Summarize this document')">Summarize this document</button>
                        <button onclick="app.useChatSuggestion('What are the key findings?')">What are the key findings?</button>
                        <button onclick="app.useChatSuggestion('Explain the last PDF')">Explain this PDF</button>
                    </div>
                    <div class="empty-chips" style="margin-top:8px">
                        <button onclick="app.useChatSuggestion('List action items')">List action items</button>
                    </div>
                </div>`;
        } else {
            // Global Chat HTML
            this.chatMessages.innerHTML = `
                <div class="empty-state">
                    <div class="welcome-container">
                        <div class="ai-avatar-large">
                            <i class="fas fa-layer-group"></i>
                        </div>
                        <h1>AI-Powered Knowledge Retrieval Assistant</h1>
                        <p class="subtitle">I can help you analyze documents, extract insights, and answer questions. Upload a PDF to get started.</p>
                    </div>

                    <div class="suggestions-container">
                        <div class="suggestions-grid">
                            <button class="suggestion-card" onclick="app.useChatSuggestion('Summarize my documents')">
                                <span>Summarize my documents</span>
                            </button>
                            <button class="suggestion-card" onclick="app.useChatSuggestion('What are the key findings?')">
                                <span>What are the key findings?</span>
                            </button>
                            <button class="suggestion-card" onclick="app.useChatSuggestion('Explain the last PDF')">
                                <span>Explain the last PDF</span>
                            </button>
                            <button class="suggestion-card" onclick="app.useChatSuggestion('List action items')">
                                <span>List action items</span>
                            </button>
                        </div>
                    </div>
                </div>`;
        }
    }

    startNewChat(bypassConfirm = false) {
        if (!bypassConfirm && !confirm('Start a new chat session? This will clear the current conversation view.')) return;
        
        console.log("Starting new chat...");
        // 1. Clear State
        localStorage.removeItem('current_conversation_id');
        this.conversationId = null;
        this.chatHistory = [];
        
        // 2. Clear URL
        const url = new URL(window.location);
        url.search = '';
        window.history.pushState({}, '', '/chat/');
        
        // 3. Reset UI
        this.renderEmptyState();
        
        // 4. Focus Input
        if(this.chatPageInput) {
            this.chatPageInput.value = '';
            this.chatPageInput.focus();
        }
    }

    clearFiles() { if (confirm('Are you sure you want to clear all uploaded files?')) { this.selectedFiles=[]; this.renderFileList(); this.updateButtonStates(); if (this.fileInput) this.fileInput.value=''; this.hideStatus(); } }

    resetProcessButton() { if (!this.processBtn) return; this.processBtn.innerHTML='<i class="fas fa-cog"></i> Process Documents'; this.processBtn.disabled=false; this.processBtn.style.background=''; this.processBtn.style.color=''; this.processBtn.style.cursor=''; this.processBtn.style.border=''; this.processBtn.style.boxShadow=''; this.processBtn.style.transform=''; this.processBtn.style.transition=''; this.processBtn.style.fontWeight=''; this.processBtn.style.letterSpacing=''; this.processBtn.style.textShadow=''; this.processBtn.style.borderRadius=''; this.processBtn.style.position=''; this.processBtn.style.overflow=''; }



    // -------- PDF Library Methods --------
    
    // -------- Favorites Methods --------
    async loadUserFavorites() {
        if (!this.isAuthenticated) return;
        try {
            const response = await fetch('/api/favorites/list/');
            if (response.ok) {
                const data = await response.json();
                this.userFavorites.clear();
                if (data.favorites) {
                    data.favorites.forEach(fav => this.userFavorites.add(fav.filename));
                }
            }
        } catch (error) {
            console.error('Failed to load favorites:', error);
        }
    }

    async toggleFavorite(filename, btnElement) {
        if (!this.isAuthenticated) return;
        
        try {
            // Optimistic UI update
            const isFav = this.userFavorites.has(filename);
            
            if (isFav) {
                this.userFavorites.delete(filename);
            } else {
                this.userFavorites.add(filename);
            }
            
            // Update Icon
            if (btnElement) {
                const icon = btnElement.querySelector('i');
                if (icon) {
                    if (this.userFavorites.has(filename)) {
                        icon.className = 'fas fa-heart';
                        icon.style.color = '#ef4444';
                    } else {
                        icon.className = 'far fa-heart';
                        icon.style.color = '';
                    }
                }
            }

            // API Call
            const response = await fetch('/api/favorites/toggle/', {
               method: 'POST',
               headers: {
                   'Content-Type': 'application/json',
                   'X-CSRFToken': this.getCsrfToken()
               },
               body: JSON.stringify({ filename: filename })
            });
            
            if (!response.ok) {
                // Revert
                if (isFav) this.userFavorites.add(filename);
                else this.userFavorites.delete(filename);
                
                if (btnElement) {
                     const icon = btnElement.querySelector('i');
                     if (this.userFavorites.has(filename)) {
                        icon.className = 'fas fa-heart';
                        icon.style.color = '#ef4444';
                     } else {
                        icon.className = 'far fa-heart';
                        icon.style.color = '';
                     }
                }
            }
        } catch (err) {
          console.error("Error toggling favorite:", err);
          // Assuming updateFavoriteChatUI is a method that can revert the UI state
          // This line was in the instruction, but `isFavorite` is not defined.
          // Using `isFav` which is defined in this function.
          // If `updateFavoriteChatUI` is meant to be a generic UI update, it might need `filename` and `!isFav`.
          // For now, I'll comment it out or adapt it if there's a clear method.
          // this.updateFavoriteChatUI(!isFav); // Revert - this method doesn't exist in the provided context
      }
  }
  
  async deleteConversation(id) {
    if (!confirm('Are you sure you want to delete this conversation? This cannot be undone.')) return;
    
    try {
        const resp = await fetch(`/conversations/${id}/delete/`, { // Trying explicit delete endpoint first
            method: 'POST', // Use POST for safety if Django expects it, or DELETE. 
                            // Standard Django generic views often use POST for delete with specific route 
                            // or DELETE on resource. I will try DELETE on resource first.
            headers: { 'X-CSRFToken': this.getCsrfToken() }
        });
        
        // Actually, let's try standard DELETE method on resource
        let success = false;
        if (resp.status === 404 || resp.status === 405) {
             // Fallback or retry? 
             // Let's assume standard ViewSet: DELETE /conversations/{id}/
             const retry = await fetch(`/conversations/${id}/`, {
                 method: 'DELETE',
                 headers: { 'X-CSRFToken': this.getCsrfToken() }
             });
             if (retry.ok) success = true;
        } else if (resp.ok) {
            success = true;
        }

        if (success) {
            // Remove from local list
            this._historyAll = this._historyAll.filter(c => c.id !== id);
            this.filterHistory(); // Re-render
            
            // If current conversation was deleted, clear screen
            if (this.conversationId === id) {
                 this.startNewChat(true); // Changed from startNewConversation to startNewChat for consistency
            }
        } else {
            alert('Failed to delete conversation.');
        }
    } catch (e) {
        console.error("Delete failed", e);
        alert('Error deleting conversation');
    }
  }

    async loadPDFLibrary() {
      try {
        console.log('[DEBUG] Loading PDF library...');
        const response = await fetch('/pdf-library/', {
          credentials: 'same-origin'
        });
        if (!response.ok) throw new Error('Failed to load PDF library');
        const data = await response.json();
        console.log('[DEBUG] PDF library response:', data);
        
        // Load favorites first so icons are correct
        await this.loadUserFavorites();
        
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

    startStatusPolling() {
  // Poll document status every 5 seconds by reloading the library
  if (this.statusPollInterval) {
    clearInterval(this.statusPollInterval);
  }
  
  this.statusPollInterval = setInterval(async () => {
    // Only poll if we have documents that might be processing
    if (this.pdfLibrary && this.pdfLibrary.length > 0) {
      const hasProcessing = this.pdfLibrary.some(pdf => pdf.status === 'processing');
      
      if (hasProcessing) {
        console.log('[STATUS] Documents processing, refreshing library...');
        await this.loadPDFLibrary();
      }
    }
  }, 5000); // Check every 5 seconds
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
      
      console.log('[RENDER] Rendering PDF grid with', pdfs.length, 'documents');
      pdfs.forEach(pdf => {
        console.log('[RENDER] Document:', pdf.filename, 'Status:', pdf.status);
      });
      
      this.pdfGrid.innerHTML = '';
      
      if (pdfs.length === 0) {
        this.pdfGrid.innerHTML = `
          <div class="pdf-empty-state" style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-secondary);">
            <i class="fas fa-folder-open" style="font-size: 48px; margin-bottom: 16px; color: var(--text-muted);"></i>
            <div>No documents found</div>
            <div style="font-size: 0.9em; margin-top: 8px;">Upload a PDF to get started</div>
          </div>
        `;
        return;
      }
      
      pdfs.forEach((pdf, index) => {
        const card = document.createElement('div');
        const status = pdf.status || 'ready';
        const isProcessing = status === 'processing';
        
        card.className = `doc-card ${isProcessing ? 'processing' : ''}`;
        
        // Status badge with icon
        const statusBadgeClass = isProcessing ? 'status-badge status-processing' : 'status-badge status-ready';
        const statusIcon = isProcessing ? '<i class="fas fa-spinner fa-spin"></i>' : '<i class="fas fa-check-circle"></i>';
        const statusText = isProcessing ? 'Processing' : 'Ready';
        
        // Map backend fields to frontend
        const fileSize = pdf.file_size || pdf.size || 0;
        const pageCount = pdf.pages || pdf.page_count || '-';
        const dateVal = pdf.modified_time ? new Date(pdf.modified_time * 1000) : new Date(); 
        
        card.innerHTML = `
            <div class="${statusBadgeClass}">${statusIcon} ${statusText}</div>
            <div class="doc-icon">
                <i class="far fa-file-pdf"></i>
            </div>
            <div class="doc-content" style="flex: 1; display: flex; flex-direction: column; gap: 8px;">
                <h3 class="doc-title">${this.escapeHtml(pdf.filename)}</h3>
                <div class="doc-meta">
                    <span><i class="fas fa-database" style="font-size: 0.75rem;"></i> ${this.formatFileSize(fileSize)}</span>
                    <span>•</span>
                    <span><i class="fas fa-file-alt" style="font-size: 0.75rem;"></i> ${pageCount} Pages</span>
                </div>
                ${isProcessing ? '<div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 4px;">Indexing document for AI retrieval...</div>' : ''}
            </div>
            <div class="doc-actions">
                <button class="action-btn" title="Toggle Favorite" onclick="event.stopPropagation(); app.toggleFavorite('${this.escapeHtml(pdf.filename)}', this)">
                    <i class="${this.userFavorites.has(pdf.filename) ? 'fas' : 'far'} fa-heart" style="${this.userFavorites.has(pdf.filename) ? 'color: #ef4444;' : ''}"></i>
                </button>
                <button class="action-btn" title="Quick View" onclick="event.stopPropagation(); ${isProcessing ? 'return false;' : `app.openPDFOverlay('${this.escapeHtml(pdf.filename)}')`}">
                    <i class="far fa-eye"></i>
                </button>
                <button class="action-btn" title="Chat with AI" onclick="event.stopPropagation(); ${isProcessing ? 'return false;' : `app.openPDFInNewTab('${this.escapeHtml(pdf.filename)}')`}">
                    <i class="fas fa-comments"></i>
                </button>
            </div>
        `;
        
        // Make entire card clickable only if ready
        if (!isProcessing) {
          card.onclick = () => this.openPDFInNewTab(pdf.filename);
        }
        
        this.pdfGrid.appendChild(card);
      });
      
      // Update icons if needed
      if (typeof lucide !== 'undefined') lucide.createIcons();
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

    // Standalone View (Arrow Icon)
    openPDFInNewTab(filename) {
      const encoded = encodeURIComponent(filename);
      // User Request: Arrow Icon opens with split view (PDF + Chat) directly visible
      const url = `/view/${encoded}?chat=true`; 
      window.open(url, '_blank');
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
        
        // Initialize Overlay Chat
        this.resetOverlayChat(filename);
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
            <div class="welcome-container">
                <div class="ai-avatar-large">
                    <i class="fas fa-file-pdf"></i>
                </div>
                <h1>Ask questions about "${filename}"</h1>
                <p class="subtitle">Select a suggestion below to get started.</p>
            </div>

            <div class="suggestions-container">
                <div class="suggestions-grid">
                    <button class="suggestion-card" onclick="app.useChatSuggestion('What is this document about?')">
                        <span>What is this document about?</span>
                    </button>
                    <button class="suggestion-card" onclick="app.useChatSuggestion('Summarize the key points')">
                        <span>Summarize key points</span>
                    </button>
                    <button class="suggestion-card" onclick="app.useChatSuggestion('Important conclusions')">
                        <span>Important conclusions</span>
                    </button>
                </div>
            </div>
          `;
        }
      } else {
        // Reset to general empty state
        const emptyState = chatMessages.querySelector('.empty-state');
        if (emptyState) {
          emptyState.innerHTML = `
            <div class="welcome-container">
                <div class="ai-avatar-large">
                    <i class="fas fa-layer-group"></i>
                </div>
                <h1>AI-Powered Knowledge Retrieval Assistant</h1>
                <p class="subtitle">I can help you analyze documents, extract insights, and answer questions. Upload a PDF to get started.</p>
            </div>

            <div class="suggestions-container">
                <div class="suggestions-grid">
                    <button class="suggestion-card" onclick="app.useChatSuggestion('Summarize my documents')">
                        <span>Summarize my documents</span>
                    </button>
                    <button class="suggestion-card" onclick="app.useChatSuggestion('What are the key findings?')">
                        <span>What are the key findings?</span>
                    </button>
                    <button class="suggestion-card" onclick="app.useChatSuggestion('Explain the last PDF')">
                        <span>Explain the last PDF</span>
                    </button>
                    <button class="suggestion-card" onclick="app.useChatSuggestion('List action items')">
                        <span>List action items</span>
                    </button>
                </div>
            </div>
          `;
        }
      }
    }

    // PDF Chat Functions
    useChatSuggestion(suggestion) {
        console.log("Processing suggestion:", suggestion);
        
        // Always query DOM fresh to ensure we find the element even after re-renders
        const pageInput = document.getElementById('chatPageInput');
        const dashInput = document.getElementById('chatInput');
        
        if (pageInput) {
            console.log("Found chatPageInput", pageInput);
            pageInput.value = suggestion; 
            pageInput.focus();
            // Auto-send disabled by user request.
        } else if (dashInput) {
            console.log("Found chatInput", dashInput);
            dashInput.value = suggestion;
            dashInput.focus();
        } else {
            console.error("No chat input found!");
            alert("Error: Could not find chat input field.");
        }
    }


    resetOverlayChat(filename) {
        if (!this.pdfChatMessages) return;
        this.pdfChatMessages.innerHTML = `
            <div class="empty-state" style="padding: 20px; text-align: center;">
                <div style="width: 50px; height: 50px; background: var(--bg-surface-hover); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px;">
                    <i class="fas fa-file-pdf" style="font-size: 24px; color: var(--accent-primary);"></i>
                </div>
                <h3 style="font-size: 1.1rem; margin-bottom: 8px;">Chatting with ${this.escapeHtml(filename)}</h3>
                <p style="font-size: 0.9rem; color: var(--text-secondary);">Ask any question about this document.</p>
            </div>
        `;
    }

    async sendOverlayMessage() {
        const message = this.pdfChatInput ? this.pdfChatInput.value.trim() : '';
        if (!message) return;

        this.addOverlayMessage(message, 'user');
        if (this.pdfChatInput) this.pdfChatInput.value = '';

        // Thinking State
        const thinkingId = this.addOverlayThinking();

        try {
            const requestBody = { 
                query: message, 
                conversation_id: null, // Stateless or separate ID for overlay? For now stateless/global to avoid mixing with main chat logic
                pdf_context: this.currentPDF // STRICT CONTEXT
            };
            
            const response = await fetch('/query/', { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify(requestBody) 
            });
            const data = await response.json();
            
            this.removeOverlayThinking(thinkingId);

            if (response.ok) {
                 this.addOverlayMessage(data.answer, 'assistant', data.citations);
            } else {
                 this.addOverlayMessage(data.error || 'Error generating response.', 'assistant');
            }
        } catch (err) {
            this.removeOverlayThinking(thinkingId);
            this.addOverlayMessage('Error: ' + err.message, 'assistant');
        }
    }

    addOverlayMessage(content, sender, citations = []) {
        if (!this.pdfChatMessages) return;
        const empty = this.pdfChatMessages.querySelector('.empty-state');
        if (empty) empty.remove();

        const row = document.createElement('div');
        row.className = `message-row ${sender}`;
        
        const bubble = document.createElement('div');
        bubble.className = `message-bubble ${sender}`;
        
        // Reuse formatter
        const formatted = this.formatStructuredContent(content);
        bubble.innerHTML = formatted;

        // Add Citations (reuse logic roughly)
        if (citations && citations.length && sender === 'assistant') {
             const chipWrap = document.createElement('div');
             chipWrap.className = 'citations';
             chipWrap.style.marginTop = '8px';
             citations.forEach((cit, idx) => {
                 const chip = document.createElement('span');
                 chip.className = 'citation-chip';
                 chip.style.fontSize = '0.75rem';
                 chip.style.padding = '2px 8px';
                 chip.innerHTML = `Pg ${cit.page_no || '?'}`;
                 chip.title = `Page ${cit.page_no}`;
                 // Optional: Click to scroll PDF iframe?
                 chipWrap.appendChild(chip);
             });
             bubble.appendChild(chipWrap);
        }

        row.appendChild(bubble);
        this.pdfChatMessages.appendChild(row);
        this.pdfChatMessages.scrollTop = this.pdfChatMessages.scrollHeight;
    }

    addOverlayThinking() {
        if (!this.pdfChatMessages) return;
        const id = 'thinking-' + Date.now();
        const row = document.createElement('div');
        row.id = id;
        row.className = 'message-row ai';
        row.innerHTML = `
            <div class="message-avatar">
                <div class="ai-avatar-small ai-avatar-pulse">
                    <i class="fas fa-robot"></i>
                </div>
            </div>
            <div class="message-content">
                <div class="message-bubble ai thinking-bubble">
                    <div class="typing-indicator">
                        <span class="typing-dot"></span>
                        <span class="typing-dot"></span>
                        <span class="typing-dot"></span>
                    </div>
                </div>
            </div>
        `;
        this.pdfChatMessages.appendChild(row);
        this.pdfChatMessages.scrollTop = this.pdfChatMessages.scrollHeight;
        return id;
    }

    removeOverlayThinking(id) {
        if (!id) return;
        const el = document.getElementById(id);
        if (el) el.remove();
    }

    usePDFSuggestion(suggestion) {
      // Legacy or unused now? kept for compatibility
      if (this.pdfChatInput) {
        this.pdfChatInput.value = suggestion;
        this.sendOverlayMessage();
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
    // --- Search & Upload Integration ---
    initSearchAndUpload() {
      const searchWrapper = document.getElementById('searchWrapper');
      const fileInput = document.getElementById('searchFileInput');
      const attachBtn = document.getElementById('attachBtn');
      const heroSearchInput = document.getElementById('heroSearchInput');
      const uploadProgress = document.getElementById('uploadProgress');
      const uploadStatusText = document.getElementById('uploadStatusText');

      // Early return if dashboard elements don't exist (not on dashboard page)
      if (!searchWrapper || !fileInput || !attachBtn || !heroSearchInput) {
        console.log('[DEBUG] Dashboard elements not found, skipping initSearchAndUpload');
        return;
      }

      // Dashboard file upload - SIMPLIFIED AND WORKING
      const searchFileInput = fileInput; // Reuse the already declared fileInput
      
      if (attachBtn && searchFileInput) {
        // Click attach button to open file dialog
        attachBtn.addEventListener('click', (e) => {
          e.preventDefault();
          console.log('[UPLOAD] Attach button clicked');
          searchFileInput.click();
        });
        
        // Handle file selection
        searchFileInput.addEventListener('change', async (e) => {
          const files = e.target.files;
          if (!files || files.length === 0) return;
          
          console.log('[UPLOAD] Files selected:', files.length);
          
          // Show upload progress
          const uploadProgress = document.getElementById('uploadProgress');
          const uploadStatusText = document.getElementById('uploadStatusText');
          if (uploadProgress) uploadProgress.style.display = 'flex';
          if (uploadStatusText) uploadStatusText.textContent = `Uploading ${files.length} document(s)...`;
          
          // Create form data
          const formData = new FormData();
          for (let file of files) {
            formData.append('files', file);
            console.log('[UPLOAD] Adding file:', file.name);
          }
          
          try {
            // Upload files
            const response = await fetch('/upload/', {
              method: 'POST',
              body: formData,
              headers: {
                'X-CSRFToken': this.getCsrfToken()
              }
            });
            
            const data = await response.json();
            console.log('[UPLOAD] Response:', data);
            
            if (response.ok) {
              // Clear file input
              e.target.value = '';
              
              // Hide upload progress
              if (uploadProgress) uploadProgress.style.display = 'none';
              
              // IMMEDIATELY refresh library to show new documents
              console.log('[UPLOAD] Refreshing library NOW...');
              await this.loadPDFLibrary();
              
              // Show processing message
              if (this.pdfCount && data.processed_files) {
                const count = data.processed_files.length;
                this.pdfCount.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Processing ${count} document${count > 1 ? 's' : ''}...`;
                
                setTimeout(() => {
                  if (this.pdfLibrary) {
                    this.updatePDFStats(this.pdfLibrary.length);
                  }
                }, 5000);
              }
              
              console.log('[UPLOAD] Upload complete!');
            } else {
              if (uploadProgress) uploadProgress.style.display = 'none';
              alert('Upload failed: ' + (data.error || 'Unknown error'));
            }
          } catch (error) {
            console.error('[UPLOAD] Error:', error);
            if (uploadProgress) uploadProgress.style.display = 'none';
            alert('Upload failed: ' + error.message);
          }
        });
      }

      // 3. Drag & Drop Handlers - Only if searchWrapper exists
      if (searchWrapper) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
          searchWrapper.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
          });
        });

        ['dragenter', 'dragover'].forEach(eventName => {
          searchWrapper.addEventListener(eventName, () => {
            searchWrapper.classList.add('drag-active');
          });
        });

        ['dragleave', 'drop'].forEach(eventName => {
          searchWrapper.addEventListener(eventName, () => {
            searchWrapper.classList.remove('drag-active');
          });
        });

        searchWrapper.addEventListener('drop', (e) => {
          const dt = e.dataTransfer;
          const files = dt.files;
          if (files.length > 0) {
            this.handleFileUpload(files);
          }
        });
      }

      // 4. Combined Input Handler (Text vs File) - Only if heroSearchInput exists
      if (heroSearchInput) {
        heroSearchInput.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') {
              const query = heroSearchInput.value.trim();
              if (query) {
                  console.log("Search query:", query);
                  if (this.pdfSearchInput) {
                    this.pdfSearchInput.value = query;
                    this.searchPDFs();
                  }
              }
          }
        });
      }
      
      this.initDashboardVoiceInput();
      this.initVoiceInput();
    }

    initDashboardVoiceInput() {
        const input = document.getElementById('heroSearchInput');
        const sendBtn = document.getElementById('heroSearchSubmit');
        const micBtn = document.getElementById('heroMicBtn');

        if (!input || !sendBtn || !micBtn) return;

        // Toggle Mic/Send based on input
        const toggleButtons = () => {
            if (input.value.trim().length > 0) {
                micBtn.style.display = 'none';
                sendBtn.style.display = 'flex';
            } else {
                micBtn.style.display = 'flex';
                sendBtn.style.display = 'none';
            }
        };

        input.addEventListener('input', toggleButtons);
        toggleButtons(); // Init state

        // Voice Logic
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            const recognition = new SpeechRecognition();
            recognition.continuous = false;
            recognition.interimResults = true;
            recognition.lang = 'en-US';

            let isRecording = false;

            micBtn.addEventListener('click', () => {
                if (isRecording) {
                    recognition.stop();
                } else {
                    recognition.start();
                }
            });

            recognition.onstart = () => {
                isRecording = true;
                micBtn.classList.add('mic-active');
                input.placeholder = "Listening...";
            };

            recognition.onend = () => {
                isRecording = false;
                micBtn.classList.remove('mic-active');
                input.placeholder = "Ask a question or drag & drop files...";
                toggleButtons();
                input.focus();
            };

            recognition.onresult = (event) => {
                let finalTranscript = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript;
                    }
                }
                if (finalTranscript) {
                    const currentVal = input.value;
                    const separator = currentVal && !currentVal.endsWith(' ') ? ' ' : '';
                    input.value = currentVal + separator + finalTranscript;
                    const ev = new Event('input', { bubbles: true });
                    input.dispatchEvent(ev);
                    
                     // Optional: Auto-submit if needed? User usually wants to verify.
                }
            };
            
            recognition.onerror = (event) => {
                console.error("Speech error", event.error);
                isRecording = false;
                micBtn.classList.remove('mic-active');
            };
        } else {
            micBtn.style.display = 'none'; // Hide if not supported
        }
    }

    initVoiceInput() {
        const input = document.getElementById('chatPageInput');
        const sendBtn = document.getElementById('chatPageSend');
        const micBtn = document.getElementById('micBtn');

        if (!input || !sendBtn || !micBtn) return;

        // Toggle Mic/Send based on input
        const toggleButtons = () => {
            if (input.value.trim().length > 0) {
                micBtn.style.display = 'none';
                sendBtn.style.display = 'flex';
            } else {
                micBtn.style.display = 'flex';
                sendBtn.style.display = 'none';
            }
        };

        input.addEventListener('input', toggleButtons);
        toggleButtons(); // Init state

        // Voice Logic
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            const recognition = new SpeechRecognition();
            recognition.continuous = false;
            recognition.interimResults = true;
            recognition.lang = 'en-US';

            let isRecording = false;

            micBtn.addEventListener('click', () => {
                if (isRecording) {
                    recognition.stop();
                } else {
                    recognition.start();
                }
            });

            recognition.onstart = () => {
                isRecording = true;
                micBtn.classList.add('mic-active');
                input.placeholder = "Listening...";
            };

            recognition.onend = () => {
                isRecording = false;
                micBtn.classList.remove('mic-active');
                input.placeholder = "Ask a question or drag & drop files...";
                toggleButtons();
                input.focus();
            };

            recognition.onresult = (event) => {
                let interimTranscript = '';
                let finalTranscript = '';

                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript;
                    } else {
                        interimTranscript += event.results[i][0].transcript;
                    }
                }

                if (finalTranscript) {
                    const currentVal = input.value;
                    const separator = currentVal && !currentVal.endsWith(' ') ? ' ' : '';
                    input.value = currentVal + separator + finalTranscript;
                    // Trigger input event to update buttons
                    const ev = new Event('input', { bubbles: true });
                    input.dispatchEvent(ev);
                }
            };
            
            recognition.onerror = (event) => {
                console.error("Speech recognition error", event.error);
                isRecording = false;
                micBtn.classList.remove('mic-active');
                input.placeholder = "Error. Try typing.";
            };
        } else {
            console.log("Web Speech API not supported.");
            micBtn.title = "Voice input not supported in this browser";
            micBtn.style.opacity = "0.5";
            micBtn.style.cursor = "not-allowed";
        }
    }

    async handleDashboardUpload(event) {
        event.preventDefault();
        const files = event.target.files;
        
        if (!files || files.length === 0) {
            alert('Please select at least one file');
            return;
        }
        
        const formData = new FormData();
        for (let file of files) {
            formData.append('files', file);
        }
        
        // Show uploading message
        const uploadStatus = document.getElementById('uploadStatusText');
        const uploadProgress = document.getElementById('uploadProgress');
        if (uploadProgress) {
            uploadProgress.style.display = 'flex';
        }
        if (uploadStatus) {
            uploadStatus.textContent = `Uploading ${files.length} document(s)...`;
        }
        
        try {
            const response = await fetch('/upload/', {
                method: 'POST',
                body: formData,
                headers: {
                    'X-CSRFToken': this.getCsrfToken()
                }
            });
            
            const data = await response.json();
            
            if (response.ok) {
                // Clear file input
                event.target.value = '';
                
                // Hide upload progress
                if (uploadProgress) {
                    uploadProgress.style.display = 'none';
                }
                
                // Immediately refresh the PDF library to show new documents
                console.log('[DASHBOARD] Upload successful, refreshing library...');
                console.log('[DASHBOARD] Processed files:', data.processed_files);
                console.log('[DASHBOARD] Processing status:', data.processing_status);
                
                await this.loadPDFLibrary();
                
                console.log('[DASHBOARD] Library refreshed, current count:', this.pdfLibrary.length);
                
                // Show processing message in stats area
                if (this.pdfCount && data.processed_files) {
                    const processingCount = data.processed_files.length;
                    if (processingCount > 0) {
                        this.pdfCount.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Processing ${processingCount} document${processingCount > 1 ? 's' : ''}...`;
                        
                        // Clear the message after 5 seconds
                        setTimeout(() => {
                            if (this.pdfLibrary) {
                                this.updatePDFStats(this.pdfLibrary.length);
                            }
                        }, 5000);
                    }
                }
            } else {
                if (uploadProgress) uploadProgress.style.display = 'none';
                alert('Upload failed: ' + (data.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Upload error:', error);
            if (uploadProgress) uploadProgress.style.display = 'none';
            alert('Upload failed: ' + error.message);
        }
    }
    async handleFileUpload(files) {
      if (!files || files.length === 0) return;

      const uploadProgress = document.getElementById('uploadProgress');
      const uploadStatusText = document.getElementById('uploadStatusText');
      
      // Show Progress
      if (uploadProgress) {
        uploadProgress.style.display = 'flex';
        uploadStatusText.textContent = `Uploading ${files.length} document(s)...`;
      }

      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
      }
      
      // Get CSRF Token
      const csrftoken = this.getCookie('csrftoken');

      try {
        const response = await fetch('/upload/', {
          method: 'POST',
          headers: {
            'X-CSRFToken': csrftoken
          },
          body: formData
        });

        const result = await response.json();

        if (response.ok) {
           if (uploadStatusText) uploadStatusText.textContent = 'Processing complete! Refreshing...';
           
           // Clear input
           document.getElementById('searchFileInput').value = '';
           document.getElementById('heroSearchInput').value = '';
           document.getElementById('heroSearchInput').placeholder = "Ask a question about your new documents...";

           // Refresh Library
           await this.loadPDFLibrary();
           
           // Hide progress after small delay
           setTimeout(() => {
             if (uploadProgress) uploadProgress.style.display = 'none';
           }, 2000);

        } else {
           throw new Error(result.error || 'Upload failed');
        }

      } catch (error) {
        console.error('Upload error:', error);
        if (uploadStatusText) {
            uploadStatusText.textContent = 'Upload failed: ' + error.message;
            uploadStatusText.style.color = '#EF4444';
        }
      }
    }

    getCookie(name) {
        let cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                if (cookie.substring(0, name.length + 1) === (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }


    // -------- Favorites Logic --------
    
    async loadFavorites() {
      try {
        const response = await fetch('/api/favorites/list/');
        if (response.ok) {
          const data = await response.json();
          this.favorites = new Set(data.favorites || []);
          console.log('[DEBUG] Loaded favorites:', this.favorites.size);
          // Re-render grid if library is already loaded
          if (this.pdfLibrary && this.pdfLibrary.length > 0) {
            this.renderPDFGrid(this.pdfLibrary);
          }
        }
      } catch (e) {
        console.error('Failed to load favorites:', e);
      }
    }

    async toggleFavorite(filename, btnElement) {
      if (!filename) return;
      
      try {
        const csrftoken = this.getCookie('csrftoken');
        const response = await fetch('/api/favorites/toggle/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': csrftoken
          },
          body: JSON.stringify({ filename: filename })
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.is_favorite) {
            this.favorites.add(filename);
            if (btnElement) {
                btnElement.innerHTML = '<i class="fas fa-heart"></i>';
                btnElement.classList.add('active');
            }
          } else {
            this.favorites.delete(filename);
             if (btnElement) {
                btnElement.innerHTML = '<i class="far fa-heart"></i>';
                btnElement.classList.remove('active');
            }
          }
        }
      } catch (e) {
        console.error('Failed to toggle favorite:', e);
      }
    }


    // -------- Chat Page Logic --------

    handleChatPageSearch(query) {
        if (!this.chatPageInput) return;
        this.chatPageInput.value = query;
        this.sendChatMessage();
    }
    
    useChatSuggestion(text) {
        if (this.chatPageInput) {
            this.chatPageInput.value = text;
            this.sendChatMessage();
        }
    }
    
    addChatMessage(role, text, citations = [], followUpQuestions = []) {
        if (!this.chatMessages) this.chatMessages = document.getElementById('chatMessages');
        if (!this.chatMessages) return;
        
        // STRICT SORTING: Sort citations by relevance score descending
        if (citations && citations.length > 0) {
            citations.sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0));
        }
        
        // 1. Fail-safe: Add class to parent to force-hide empty state via CSS
        this.chatMessages.classList.add('has-messages');

        // 2. Remove Empty State if it exists (Aggressive Check)
        const emptyStates = this.chatMessages.querySelectorAll('.empty-state');
        emptyStates.forEach(el => el.remove());

        // 3. Create Row Wrapper for Alignment
        const rowDiv = document.createElement('div');
        rowDiv.className = `message-row ${role}`;
        
        const msgDiv = document.createElement('div');
        
        // AI: Structured Card Layout
        if (role === 'ai') {
            msgDiv.className = `ai-card`; // New container class
            
            // 1. Header
            const header = document.createElement('div');
            header.className = 'ai-card-header';
            header.innerHTML = `
                <div class="ai-title"><i class="fas fa-sparkles"></i> AI Response</div>
                <button class="ai-collapse-btn" onclick="this.closest('.ai-card').classList.toggle('collapsed')" title="Toggle Content"><i class="fas fa-chevron-down"></i></button>
            `;
            msgDiv.appendChild(header);

            // 2. Content Wrapper (for collapsing)
            const contentWrapper = document.createElement('div');
            contentWrapper.className = 'ai-card-body';

            // Format Content - with safety check
            if (!text || typeof text !== 'string') {
                text = 'No response received from the server.';
            }
            let formattedContent = text.includes('**Main Answer:**') ? this.formatStructuredContent(text) : this.simpleFormat(text);
            contentWrapper.innerHTML = `<div class="message-content">${formattedContent}</div>`;

            // Sources (Inside body)
            if (citations && citations.length) {
                try {
                    const sourcesDiv = document.createElement('div');
                    sourcesDiv.className = 'sources-section';
                    
                    // New Source Grid Layout
                    const grid = document.createElement('div');
                    grid.className = 'source-grid';
                    
                    // Helper to render source card
                    citations.forEach((citation, idx) => {
                        const card = document.createElement('div');
                        card.className = 'source-card';
                        
                        const filename = citation.source_pdf || 'source';
                        let pageDisplay = (citation.page_numbers && citation.page_numbers.length) 
                            ? citation.page_numbers.join(', ') 
                            : (citation.page_no || 'N/A');
                        
                        // Scores (Defaults if missing)
                        const score = citation.relevance_score ? (citation.relevance_score * 100).toFixed(1) : '0.0';
                        const sim = citation.similarity_score ? (citation.similarity_score * 100).toFixed(1) : '0.0';
                        const tfidf = citation.tfidf_score ? (citation.tfidf_score * 100).toFixed(1) : '0.0';
                        const keywordCount = citation.keyword_count || 0;
                        
                        card.innerHTML = `
                            <div class="source-header" onclick="app.openPDFFromCitation('${filename}')">
                                <div class="source-icon"><i class="far fa-file-pdf"></i></div>
                                <div class="source-info">
                                    <div class="source-name" title="${filename}">${filename}</div>
                                    <div class="source-meta">Pages: ${pageDisplay}</div>
                                </div>
                                <div class="source-arrow"><i class="fas fa-external-link-alt"></i></div>
                            </div>
                            
                            <details class="retrieval-insights">
                                <summary>Retrieval Insights</summary>
                                <div class="insights-content">
                                    <div class="insight-row major">
                                        <span class="label">Total Score</span>
                                        <span class="value badge-score">${score}%</span>
                                    </div>
                                    <div class="insight-separator"></div>
                                    <div class="insight-row minor">
                                        <span class="label">Vector Similarity</span>
                                        <span class="value">${sim}%</span>
                                    </div>
                                    <div class="insight-row minor">
                                        <span class="label">Keyword Match (TF-IDF)</span>
                                        <span class="value">${tfidf}%</span>
                                    </div>
                                    <div class="insight-row">
                                        <span class="label">Keywords Found</span>
                                        <span class="value">${keywordCount}</span>
                                    </div>
                                    ${citation.matched_keywords && citation.matched_keywords.length ? `
                                    <div class="keywords-list">
                                        ${citation.matched_keywords.map(k => `<span class="keyword-pill">${k}</span>`).join('')}
                                    </div>
                                    ` : ''}
                                </div>
                            </details>
                        `;
                        grid.appendChild(card);
                    });
                    
                    sourcesDiv.innerHTML = `<div class="sources-header">📚 Referenced Documents</div>`;
                    sourcesDiv.appendChild(grid);
                    contentWrapper.appendChild(sourcesDiv);
                } catch (err) {
                    console.error("Error rendering citations:", err);
                }
            }
            msgDiv.appendChild(contentWrapper);

            // 3. Persistent Action Bar (Always Visible)
            const actionsBar = document.createElement('div');
            actionsBar.className = 'ai-card-actions';
            
            const safeText = text.replace(/'/g, "&apos;").replace(/"/g, "&quot;"); 
            const safeQuery = text.substring(0, 30).replace(/'/g, "&apos;").replace(/"/g, "&quot;");

            actionsBar.innerHTML = `
                <div class="action-group left">
                    <button class="ai-action-btn" onclick="app.copyToClipboard(this)" title="Copy"><i class="fas fa-copy"></i></button>
                    <!-- Resources Icon Removed as requested -->
                    <button class="ai-action-btn" data-text="${safeText}" onclick="app.toggleMessageFavorite(this, this.dataset.text)" title="Save"><i class="far fa-heart"></i></button>
                    <button class="ai-action-btn" onclick="app.rateResponse(this, 'up')" title="Good Response"><i class="far fa-thumbs-up"></i></button>
                    <button class="ai-action-btn" onclick="app.rateResponse(this, 'down')" title="Bad Response"><i class="far fa-thumbs-down"></i></button>
                </div>
                <div class="action-group right">
                    <button class="ai-action-btn" data-query="${safeQuery}" onclick="app.handleChatPageSearch(this.dataset.query)" title="Regenerate"><i class="fas fa-sync-alt"></i></button>
                    
                    <div class="ai-download-wrapper" style="position:relative; display:inline-block;">
                        <button class="ai-action-btn dropdown-trigger" onclick="app.toggleDownloadMenu(this)" title="Download"><i class="fas fa-download"></i></button>
                        <div class="ai-download-menu" style="display:none;">
                            <div class="dl-option" onclick="app.downloadMessage('pdf', this)"><i class="fas fa-file-pdf"></i> PDF</div>
                            <div class="dl-option" onclick="app.downloadMessage('docx', this)"><i class="fas fa-file-word"></i> DOCX</div>
                            <div class="dl-option" onclick="app.downloadMessage('txt', this)"><i class="fas fa-file-alt"></i> TXT</div>
                            <div class="dl-option" onclick="app.downloadMessage('md', this)"><i class="fab fa-markdown"></i> MD</div>
                        </div>
                    </div>
                </div>
            `;
            msgDiv.appendChild(actionsBar);

        } else {
            // User Message (Standard Bubble)
            msgDiv.className = `message-bubble ${role}`;
            msgDiv.innerHTML = `<div class="message-content">${this.simpleFormat(text)}</div>`;
        }
        
        rowDiv.appendChild(msgDiv);
        this.chatMessages.appendChild(rowDiv);

        // 4. Follow-up Questions (Separate Container below card)
        if (role === 'ai' && followUpQuestions && followUpQuestions.length > 0) {
            try {
                const followUpContainer = document.createElement('div');
                followUpContainer.className = 'ai-followups-container';
                
                const label = document.createElement('div');
                label.className = 'followup-label';
                label.innerHTML = `<i class="fas fa-level-up-alt fa-rotate-90"></i> Suggested Follow-ups`;
                followUpContainer.appendChild(label);

                const pills = document.createElement('div');
                pills.className = 'followup-pills';
                
                followUpQuestions.forEach((question) => {
                    const chip = document.createElement('button');
                    chip.className = 'followup-pill';
                    chip.textContent = question;
                    chip.dataset.question = question; // Store data for global handler
                    pills.appendChild(chip);
                });
                followUpContainer.appendChild(pills);
                this.chatMessages.appendChild(followUpContainer);
            } catch (err) {
                 console.error("Error rendering followups:", err);
            }
        }

        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    // --- AI Interaction Helpers ---

    toggleSources(btn) {
        // Works for both .ai-card and legacy bubbles
        const container = btn.closest('.ai-card') || btn.closest('.message-bubble');
        if (!container) return;
        const section = container.querySelector('.sources-section');
        if (section) {
            const isHidden = section.style.display === 'none';
            section.style.display = isHidden ? 'block' : 'none';
            btn.classList.toggle('active', isHidden);
        }
    }



    // Helper for favorite toggle in chat page
    toggleMessageFavorite(btn, text) {
        // Visual toggle
        const icon = btn.querySelector('i');
        if (icon.classList.contains('far')) {
            icon.classList.replace('far', 'fas');
            icon.style.color = 'var(--accent-primary)';
            this.showStatus('Saved to Favorites', 'success');
        } else {
            icon.classList.replace('fas', 'far');
            icon.style.color = '';
        }
        // TODO: Call backend here if needed using the async logic
    }

    rateResponse(btn, type) {
        const icon = btn.querySelector('i');
        const parent = btn.parentElement; 
        
        // Mutually Exclusive Logic
        // Find sibling buttons in same group
        const siblings = parent.querySelectorAll('.ai-action-btn');
        siblings.forEach(sibling => {
            if (sibling === btn) return;
            // Check if sibling is a rating button (check icons or title)
            // Or simpler: just reset anyone with thumbs-up/down that isn't me
            const sibIcon = sibling.querySelector('i');
            if (sibIcon && (sibIcon.classList.contains('fa-thumbs-up') || sibIcon.classList.contains('fa-thumbs-down'))) {
                sibIcon.classList.replace('fas', 'far');
                sibIcon.style.color = '';
            }
        });
        
        if (icon.classList.contains('far')) {
            icon.classList.replace('far', 'fas');
            icon.style.color = type === 'up' ? '#10B981' : '#EF4444'; // Green or Red
            this.showStatus(type === 'up' ? 'Response Marked Good' : 'Response Marked Bad', 'success');
        } else {
            icon.classList.replace('fas', 'far');
            icon.style.color = '';
        }
    }

    async sendChatMessage(manualQuery = null) {
        const input = this.chatPageInput || this.chatInput;
        const query = manualQuery || (input ? input.value.trim() : '');
        if (!query) return;

        // Visuals
        this.addChatMessage('user', query);
        input.value = '';
        
        // Unified Thinking Indicator
        this.addThinkingIndicator();

        try {
            const response = await fetch('/query/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: query, conversation_id: this.conversationId })
            });
            
            this.removeThinkingIndicator(); // Remove before parsing/showing answer

            if (response.ok) {
                const data = await response.json();
                if (data.conversation_id) {
                    this.conversationId = data.conversation_id;
                    // Persist session consistent with checkSession logic
                    const key = (this.currentPDF) ? `chat_session_pdf_${this.currentPDF}` : 'chat_session_global';
                    localStorage.setItem(key, this.conversationId);
                    localStorage.setItem('current_conversation_id', this.conversationId); // Keep generic fallback
                    
                    // Clear URL params to prevent refresh loops
                    const url = new URL(window.location);
                    if (url.searchParams.has('q')) {
                        url.searchParams.delete('q');
                        window.history.replaceState({}, '', url);
                    }
                }
                this.addChatMessage('ai', data.answer, data.citations || [], data.follow_up_questions || []);
            } else {
                this.addChatMessage('ai', "Sorry, I encountered an error receiving the response.");
            }
        } catch (e) {
            loadingRow.remove();
            this.addChatMessage('ai', "Error: " + e.message);
        }
    }


  
    async syncUserAvatar() {
        try {
            // Cache-busting to ensure fresh avatar
            const res = await fetch(`/api/user/me/?t=${new Date().getTime()}`);
            if(res.ok) {
                const data = await res.json();
                const initialsEl = document.getElementById('navAvatarInitials');
                const imgEl = document.getElementById('navAvatarImg');
                const dropdownEmail = document.querySelector('#accountDropdown p');
                
                if (dropdownEmail && data.email) dropdownEmail.textContent = data.email;

                if (data.avatar_url && imgEl) {
                    imgEl.src = data.avatar_url;
                    imgEl.style.display = 'block';
                    if(initialsEl) initialsEl.style.display = 'none';
                } else {
                    if(imgEl) {
                        imgEl.style.display = 'none';
                        imgEl.src = '';
                    }
                    if(initialsEl) {
                        initialsEl.style.display = 'flex';
                        const i = (data.first_name ? data.first_name[0] : (data.username[0] || 'U')).toUpperCase();
                        initialsEl.innerText = i;
                    }
                }
            }
        } catch(e) { console.error("Avatar sync failed", e); }
    }

    handleChatPageSearch(query) {
        // Function to handle automatic question submission from dashboard search
        console.log('[CHAT] Handling dashboard search query:', query);
        
        // Hide empty state if it exists
        const emptyState = document.querySelector('.empty-state');
        if (emptyState) {
            emptyState.style.display = 'none';
        }
        
        // Add user message to chat
        this.addChatMessage('user', query);
        
        // Show typing indicator
        const typingDiv = document.createElement('div');
        typingDiv.className = 'message ai typing-indicator';
        typingDiv.innerHTML = `
            <div class="message-avatar">
                <i class="fas fa-robot"></i>
            </div>
            <div class="message-content">
                <div class="typing-dots">
                    <span></span><span></span><span></span>
                </div>
            </div>
        `;
        if (this.chatMessages) {
            this.chatMessages.appendChild(typingDiv);
            this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
        }
        
        // Send query to backend
        fetch('/query/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': this.getCsrfToken()
            },
            body: JSON.stringify({
                query: query,
                conversation_id: this.conversationId
            })
        })
        .then(res => res.json())
        .then(data => {
            // Remove typing indicator
            if (typingDiv && typingDiv.parentNode) {
                typingDiv.remove();
            }
            
            this.showStatus(data.message, 'success');
            this.selectedFiles = [];
            this.renderFileList();
            this.updateButtonStates();
            
            // Immediately refresh the PDF library to show new documents
            console.log('[UPLOAD] Refreshing library to show new documents...');
            if (this.loadPDFLibrary) {
                // This method is async, so we need to await it.
                // However, handleChatPageSearch is not async, so we'll call it without await
                // or make handleChatPageSearch async if it's truly an upload handler.
                // Given the context, this block seems misplaced in handleChatPageSearch.
                // Assuming this is a placeholder for an actual upload success handler.
                // For now, calling without await to avoid syntax error in non-async function.
                this.loadPDFLibrary(); 
                
                // Show processing message in stats area
                if (this.pdfCount && data.processed_files) {
                    const processingCount = data.processed_files.length;
                    if (processingCount > 0) {
                        this.pdfCount.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Processing ${processingCount} document${processingCount > 1 ? 's' : ''}...`;
                        
                        // Clear the message after 5 seconds
                        setTimeout(() => {
                            if (this.pdfLibrary) {
                                this.updatePDFStats(this.pdfLibrary.length);
                            }
                        }, 5000);
                    }
                }
            }
            
            // Check for API error
            if (data.error) {
                this.addChatMessage('ai', "Sorry, I encountered an error: " + data.error);
                return;
            }

            // Redirect to chat if conversation was created
            const storageKey = (window.pdfContext) 
                ? `chat_session_pdf_${window.pdfContext}` 
                : 'chat_session_global';

            if (data.conversation_id && data.created_new_conversation) {
                this.conversationId = data.conversation_id;
                localStorage.setItem(storageKey, data.conversation_id);
            }
            
            // Add AI response
            this.addChatMessage('ai', data.answer, data.citations, data.follow_up_questions);
            
            // Update conversation ID if provided
            if (data.conversation_id) {
                this.conversationId = data.conversation_id;
                localStorage.setItem(storageKey, data.conversation_id);
            }
        })
        .catch(error => {
            console.error('[CHAT] Error sending query:', error);
            if (typingDiv && typingDiv.parentNode) {
                typingDiv.remove();
            }
            this.addChatMessage('ai', 'Sorry, I encountered an error processing your request. Please try again.');
        });
    }

    useChatSuggestion(text) {
        console.log("Using chat suggestion:", text);
        // Robustly populate input for both Global and PDF pages
        if (this.chatInput) {
            this.chatInput.value = text;
            this.chatInput.focus();
        } else if (this.pdfChatInput) {
             // Fallback for overlay
             this.pdfChatInput.value = text;
             this.pdfChatInput.focus();
        } else {
             // Hard fallback for PDF Viewer if all else fails
             const fallback = document.getElementById('chatInput');
             if (fallback) {
                 fallback.value = text;
                 fallback.focus();
             }
        }
    }

    getCsrfToken() {
        const name = 'csrftoken';
        let cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                if (cookie.substring(0, name.length + 1) === (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }

    // --- Action Methods (Refined) ---
    
    // Helper to get full text even from collapsed details
    getAllContentText(contentDiv) {
        if (!contentDiv) return '';
        // Clone to avoid modifying UI
        const clone = contentDiv.cloneNode(true);
        // Force open all details
        clone.querySelectorAll('details').forEach(el => el.open = true);
        // Extract text
        let text = clone.innerText;
        // Cleanup headers/newlines
        text = text.replace(/^(Main Answer|Key Points|Details|Summary)\s*$/gm, '');
        return text.replace(/\n\s*\n/g, '\n\n').trim();
    }

    copyToClipboard(btn) {
        const msgDiv = btn.closest('.message-bubble') || btn.closest('.ai-card');
        const contentDiv = msgDiv.querySelector('.message-content');
        if (contentDiv) {
            const text = this.getAllContentText(contentDiv);
            navigator.clipboard.writeText(text).then(() => {
                const original = btn.innerHTML;
                btn.innerHTML = '<i class="fas fa-check"></i>';
                setTimeout(() => btn.innerHTML = original, 2000);
            });
        }
    }

    showDownloadMenu(wrapper) {
        const menu = wrapper.querySelector('.ai-download-menu');
        if (menu) menu.style.display = 'block';
    }

    hideDownloadMenu(wrapper) {
        const menu = wrapper.querySelector('.ai-download-menu');
        if (menu) menu.style.display = 'none';
    }
    
    toggleDownloadMenu(btn) {
        const wrapper = btn.closest('.ai-download-wrapper');
        const menu = wrapper.querySelector('.ai-download-menu');
        if (menu) {
            menu.style.display = (menu.style.display === 'none' || !menu.style.display) ? 'block' : 'none';
        }
    }

    downloadMessage(format, btn) {
        const msgDiv = btn.closest('.message-bubble') || btn.closest('.ai-card');
        const contentDiv = msgDiv.querySelector('.message-content');
        if (!contentDiv) return;
        
        // Clean text for text formats
        let text = this.getAllContentText(contentDiv);

        let blob;
        const timestamp = new Date().toISOString().slice(0,10);
        let filename = `response-${timestamp}.${format}`;
        
        if (format === 'pdf') {
             // For PDF, we use Print approach to preserve formatting
             // We clone and expand all details (assuming new structure uses details)
             // If AI card uses details, we need to handle that.
             // But contentDiv contains the HTML.
             // We can print the contentDiv HTML.
             
             // Expand all details details in contentDiv?
             // Since we are not modifying live DOM, we print contentDiv innerHTML.
             // But if details are collapsed, print might show collapsed?
             // Details state is in DOM.
             
             const printWin = window.open('', '_blank');
             // Add style to expand details for print
             printWin.document.write(`
                <html>
                <head><title>DocQuery Answer</title>
                <style>
                    body { font-family: sans-serif; padding: 40px; line-height: 1.6; color: #111; }
                    details { display: block; margin-bottom: 20px; }
                    summary { font-weight: bold; margin-bottom: 10px; font-size: 1.2em; list-style: none; }
                    summary::-webkit-details-marker { display: none; }
                </style>
                </head>
                <body>
                    ${contentDiv.innerHTML}
                    <script>
                        // Force expand all details
                        document.querySelectorAll('details').forEach(d => d.open = true);
                    </script>
                </body>
                </html>
             `);
             printWin.document.close();
             setTimeout(() => printWin.print(), 500);
             return;
        } else if (format === 'txt' || format === 'md') {
            blob = new Blob([text], { type: 'text/plain' });
        } else if (format === 'docx') {
             alert("DOCX download not supported. Downloading text.");
             filename = `response-${timestamp}.txt`;
             blob = new Blob([text], { type: 'text/plain' });
        }

        if (blob) {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = filename;
            a.click();
            URL.revokeObjectURL(a.href);
        }
        
        const wrapper = btn.closest('.ai-download-wrapper');
        this.hideDownloadMenu(wrapper);
    }

    async startNewConversation(skipConfirm = false) {
        if (!skipConfirm && !confirm('Start a new conversation? This will clear current chat history.')) return;
        
        console.log("Starting new conversation...");
        
        // Clear State
        this.conversationId = null;
        
        // Clear Storage (Nuclear Option to ensure fresh start)
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('chat_session_') || key === 'current_conversation_id') {
                localStorage.removeItem(key);
            }
        });
        sessionStorage.removeItem('restore_chat_id');
        sessionStorage.removeItem('reset_chat_on_load');
        
        // Clear URL parameters (cid, q, etc) without refresh
        const url = new URL(window.location);
        url.search = ''; 
        window.history.replaceState({}, document.title, url.toString());

        
        // UI Reset
        if (this.chatMessages) {
             this.renderEmptyState();
             this.chatMessages.closest('.chat-container')?.classList.remove('has-messages');
        }

        
        
    }

    openPDFFromCitation(filename) {
        console.log("Opening source PDF:", filename);
        // Requirement: Reset chat when opening source
        
        const currentPdf = window.pdfContext;
        if (currentPdf === filename) {
             // Already on page, just reset chat
             this.startNewConversation(true);
        } else {
             // Navigate and flag for reset via URL which is more robust across tabs
             window.location.href = `/view/${encodeURIComponent(filename)}?reset=true`;
        }
    }

    async restoreSession(id) {
        try {
            console.log("Restoring session:", id);
            const res = await fetch(`/conversations/${id}/`);
            if (!res.ok) {
                if(res.status === 404) {
                    console.warn("Conversation not found, clearing session.");
                    localStorage.removeItem('current_conversation_id');
                }
                return;
            }
            
            const data = await res.json();
            this.conversationId = parseInt(id);
            
            // Clear current chat
            if(this.chatMessages) {
                this.chatMessages.innerHTML = '';
            }
            
            // Hide empty state if present
            const emptyState = document.querySelector('.empty-state');
            if (emptyState) emptyState.remove(); // Direct remove
            if (this.chatMessages) this.chatMessages.closest('.chat-container')?.classList.add('has-messages');

            // Render Messages
            if (data.messages && data.messages.length > 0) {
                data.messages.forEach(msg => {
                    this.addChatMessage(
                        msg.sender === 'user' ? 'user' : 'ai', 
                        msg.content, 
                        msg.citations || [], 
                        msg.follow_up_questions || []
                    );
                });
            }
            
            // Scroll to bottom
            this.scrollToBottom();
            
        } catch (e) {
            console.error("Failed to restore session:", e);
        }
    }

    scrollToBottom() {
        if (this.chatMessages) {
            this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
        }
    }
  
  }

  // Initialize once DOM is ready
let app;
  window.addEventListener('DOMContentLoaded', () => {
    try {
      // 0. RESET CHECK (Must happen first)
      const urlParamsInit = new URLSearchParams(window.location.search);
      if (urlParamsInit.get('reset') === 'true' && window.pdfContext) {
           console.log("[INIT] Explicit reset requested via URL");
           const key = `chat_session_pdf_${window.pdfContext}`;
           localStorage.removeItem(key);
           localStorage.removeItem('current_conversation_id');
           // Clean URL immediately
           const cleanUrl = window.location.pathname;
           window.history.replaceState({}, '', cleanUrl); 
      }

      const appInst = new DocumentAssistant();
      window.app = appInst; // Expose globally for inline/dynamic handlers
      app = appInst; // Keep local ref just in case
      window.app = app;
      
      
      app.initSearchAndUpload();
      app.loadFavorites();
      app.syncUserAvatar();

      // Check for reset flag from source click (Source Click Behavior)
      try {
          const resetTarget = sessionStorage.getItem('reset_chat_on_load');
          if (resetTarget && window.pdfContext) {
               // If we are on the page matching the target (or just blindly trust if we want strict reset)
               // Simple check: unquote filename and compare
               if (decodeURIComponent(resetTarget) === window.pdfContext || resetTarget === window.pdfContext) {
                   const key = `chat_session_pdf_${window.pdfContext}`;
                   localStorage.removeItem(key);
                   localStorage.removeItem('current_conversation_id');
                   console.log("Chat reset triggered by source open.");
               }
               sessionStorage.removeItem('reset_chat_on_load');
          }
      } catch(e) { console.error("Error checking reset flag", e); }

      // Global Helpers
      window.setInput = (text) => app.useChatSuggestion(text);
      
      // Logout Handler
      document.querySelectorAll('a[href*="logout"]').forEach(btn => {
          btn.addEventListener('click', () => {
                // Clear all chat sessions
                Object.keys(localStorage).forEach(key => {
                    if (key.startsWith('chat_session_')) localStorage.removeItem(key);
                });
          });
      });
      
        // Check for active session AND server restart
        const storageKey = (window.pdfContext) 
            ? `chat_session_pdf_${window.pdfContext}` 
            : 'chat_session_global';

        const checkSession = async () => {
            try {
                const statusRes = await fetch(`/system-status/?t=${new Date().getTime()}`);
                if (statusRes.ok) {
                    const statusData = await statusRes.json();
                    const currentServerId = statusData.server_instance_id;
                    const savedServerId = localStorage.getItem('server_instance_id');

                    console.log(`[Session Check] Server: ${currentServerId}, Saved: ${savedServerId}`);

                    if (currentServerId && savedServerId && currentServerId !== savedServerId) {
                        console.warn("Server restarted. Not clearing previous session to improve persistence.");
                        // localStorage.removeItem(storageKey); 
                        localStorage.setItem('server_instance_id', currentServerId);
                    } else if (!savedServerId && currentServerId) {
                         localStorage.setItem('server_instance_id', currentServerId);
                    }
                }
            } catch (e) { console.error("Failed to check server status:", e); }

            // Check for intentional restore request (from History/Dashboard)
            const restoreId = sessionStorage.getItem('restore_chat_id');
            if (restoreId) {
                console.log("Restoring requested session:", restoreId);
                sessionStorage.removeItem('restore_chat_id'); // Consume flag so refresh is fresh
                await app.restoreSession(restoreId);
            }
            
            // User requested NO auto-restore on refresh. Start fresh.
            // User requested persistence behavior
            const savedId = localStorage.getItem(storageKey);
            if (savedId) {
                console.log("Restoring persisted session:", savedId);
                app.conversationId = savedId;
                app.restoreSession(savedId);
            }
        };
      
          checkSession();
          
          // Check for URL Query Param (Search Redirect)
          const urlParams = new URLSearchParams(window.location.search);
          const query = urlParams.get('q');
          if (query && app.chatPageInput) {
              console.log("[INIT] Found query param:", query);
              app.chatPageInput.value = query;
              
              // Remove param cleanly so refresh triggers restore, not new search
              const newUrl = window.location.pathname;
              window.history.replaceState({}, '', newUrl);
              
              // Trigger search (Async, will save session when done)
              // Use a slight delay to ensure UI is ready
              setTimeout(() => app.sendChatMessage(), 500);
          } else {
             // If no query, try to restore session
             app.restoreActiveSession();
          }
      
      setTimeout(() => { app.updateButtonStates && app.updateButtonStates(); app.checkSendButton && app.checkSendButton(); }, 100);
    } catch (err) { console.error('Failed to initialize app:', err); alert('Failed to initialize the application. Please refresh the page.'); }
  });

  window.addEventListener('error', function(e) { console.error('JavaScript error:', e.error || e.message || e); });

  // --- GLOBAL EVENT DELEGATION FOR DYNAMIC ELEMENTS ---
  // --- GLOBAL EVENT DELEGATION FOR DYNAMIC ELEMENTS ---
  document.addEventListener('click', function(e) {
      if (!e.target) return;
      // Safety: Handle text nodes and missing closest()
      const el = e.target.nodeType === 3 ? e.target.parentNode : e.target;
      const target = (el && el.closest) ? (el.closest('.followup-pill') || el.closest('.suggestion-card')) : null;
      if (target) {
          e.preventDefault();
          // Extract text: data-question preferred, OR check span (for suggestion-card), OR fallback to textContent
          let question = target.dataset.question;
          if (!question) {
              const span = target.querySelector('span');
              question = span ? span.textContent.trim() : target.textContent.trim();
          }
          console.log("Global delegate clicked:", question);
          
          // Use global app instance
          if (window.app) {
               // Direct DOM Manipulation (Bypass potential method failure)
               const chatPageInput = document.getElementById('chatPageInput');
               if (chatPageInput) {
                   console.log("Direct paste to chatPageInput");
                   chatPageInput.value = question;
                   chatPageInput.focus();
                   // Auto-send disabled by user request
               } else if (window.app.chatInput) {
                   console.log("Direct paste to chatInput");
                   window.app.chatInput.value = question;
                   window.app.chatInput.focus();
               } else {
                   // Fallback
                   window.app.useChatSuggestion(question);
               }
          } else {
              console.error("FATAL: window.app not found during click delegation");
              alert("Error: Chat application not fully loaded. Please refresh.");
          }
      }
  });

})();
