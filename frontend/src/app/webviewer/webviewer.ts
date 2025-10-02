import { Component, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import WebViewer from '@pdftron/webviewer';
import { RedactionService, PIIEntity, RedactionJobResponse } from '../services/redaction.service';

// Enhanced PIIEntity for UI state management
interface ExtendedPIIEntity extends PIIEntity {
  id: string;
  selected: boolean;
  highlighted: boolean;
  hasRedaction: boolean;
  pageNumber?: number;
}

interface EntityCategory {
  name: string;
  displayName: string;
  count: number;
  allSelected: boolean;
  partialSelected: boolean;
}

@Component({
  selector: 'webviewer',
  templateUrl: './webviewer.html',
  styleUrls: ['./webviewer.css'],
  standalone: true,
  imports: [CommonModule, HttpClientModule],
  providers: [RedactionService]
})
export class WebViewerComponent implements AfterViewInit {
  @ViewChild('viewer') viewer!: ElementRef;
  
  private instance: any;
  private documentViewer: any;
  private annotationManager: any;
  private Annotations: any;
  private Tools: any;
  
  // File upload properties
  selectedFile: File | null = null;
  isProcessing: boolean = false;
  detectedEntities: ExtendedPIIEntity[] = [];
  currentJob: RedactionJobResponse | null = null;
  
  // UI state
  showEntityPanel: boolean = false;
  highlightedAnnotations: any[] = [];
  redactionAnnotations: Map<string, any> = new Map();
  temporaryHighlights: any[] = []; // For temporary entity highlighting
  searchQueue: Promise<any> = Promise.resolve(); // Search operation queue

  constructor(private redactionService: RedactionService) { 
    console.log('WebViewerComponent constructor - RedactionService injected:', !!this.redactionService);
  }

  // Debug method to test button clicks
  testButtonClick(): void {
    console.log('Test button clicked!');
    alert('Test button clicked! Component is working.');
  }

  ngAfterViewInit(): void {
    WebViewer({
      path: '../../lib/webviewer',
      licenseKey: 'YOUR_LICENSE_KEY',
      initialDoc: 'https://apryse.s3.amazonaws.com/public/files/samples/WebviewerDemoDoc.pdf',
      fullAPI: true,
      enableRedaction: true
    }, this.viewer.nativeElement).then(instance => {
      this.instance = instance;
      const { documentViewer, annotationManager, Annotations, Tools } = instance.Core;
      
      this.documentViewer = documentViewer;
      this.annotationManager = annotationManager;
      this.Annotations = Annotations;
      this.Tools = Tools;

      // Set up the UI
      this.setupUI(instance);
      
      // Set default tool to redaction
      instance.UI.setToolMode(Tools.ToolNames.REDACTION);
    });
  }

  private setupUI(instance: any): void {
    const { UI } = instance;

    // Add custom buttons to the header
    UI.setHeaderItems((header: any[]) => {
      header.push({
        type: 'actionButton',
        img: 'icon-header-search',
        title: 'Interactive PII Detection',
        onClick: () => this.searchAndRedactPII()
      });

      header.push({
        type: 'actionButton',
        img: 'icon-header-panel',
        title: 'Toggle Entity Panel',
        onClick: () => this.toggleEntityPanel()
      });

      header.push({
        type: 'actionButton',
        img: 'icon-header-download',
        title: 'Apply All Redactions',
        onClick: () => this.applyRedactions()
      });

      header.push({
        type: 'actionButton',
        img: 'icon-header-refresh',
        title: 'Clear All Redactions',
        onClick: () => this.clearAllRedactionsConfirm()
      });
    });

    // Enable search overlay
    UI.enableFeatures([UI.Feature.TextSelection]);
  }

  // File upload handlers
  onFileSelected(event: any): void {
    console.log('onFileSelected called');
    const file = event.target.files[0];
    if (file && file.type === 'application/pdf') {
      this.selectedFile = file;
      console.log('File selected:', file.name);
    } else {
      alert('Please select a valid PDF file');
      this.selectedFile = null;
    }
  }

  async processUploadedFile(): Promise<void> {
    console.log('=== processUploadedFile method called ===');
    
    if (!this.selectedFile) {
      alert('Please select a file first');
      return;
    }

    console.log('processUploadedFile called with file:', this.selectedFile.name);
    this.isProcessing = true;
    
    // Clear any existing highlights and states
    this.clearTemporaryHighlights();
    this.detectedEntities.forEach(e => e.highlighted = false);
    
    try {
      // Step 1: Send file to backend for PII analysis
      console.log('Sending file to backend for analysis...');
      console.log('RedactionService available:', !!this.redactionService);
      console.log('About to call analyzePdf...');
      
      const analyzeObservable = this.redactionService.analyzePdf(this.selectedFile);
      console.log('Observable created:', !!analyzeObservable);
      
      analyzeObservable.subscribe({
        next: async (response: RedactionJobResponse) => {
          console.log('Analysis response received:', response);
          this.currentJob = response;
          this.detectedEntities = this.convertToExtendedEntities(response.entities);
          
          // Show job summary
          this.showJobSummary(response);
          
          // Step 2: Load the file into WebViewer
          await this.loadFileIntoViewer(this.selectedFile!);
          
          // Step 3: Show entity panel for interactive selection
          setTimeout(() => {
            this.showEntityPanel = true;
            this.createHighlightsForEntities();
            this.isProcessing = false;
          }, 1000); // Give time for document to load
        },
        error: (error) => {
          console.error('Error analyzing file:', error);
          console.error('Error details:', {
            message: error.message,
            status: error.status,
            statusText: error.statusText,
            url: error.url
          });
          alert('Error analyzing file for PII. Please try again. Check console for details.');
          this.isProcessing = false;
        },
        complete: () => {
          console.log('Analysis request completed');
        }
      });

    } catch (error) {
      console.error('Error processing file:', error);
      alert('Error processing file');
      this.isProcessing = false;
    }
  }

  private async loadFileIntoViewer(file: File): Promise<void> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          const arrayBuffer = e.target?.result as ArrayBuffer;
          const uint8Array = new Uint8Array(arrayBuffer);
          
          // Load the document into WebViewer
          await this.instance.UI.loadDocument(uint8Array, { filename: file.name });
          console.log('Document loaded into WebViewer');
          resolve();
        } catch (error) {
          console.error('Error loading document:', error);
          reject(error);
        }
      };
      
      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };
      
      reader.readAsArrayBuffer(file);
    });
  }

  private applyDetectedRedactions(): void {
    // This method is now deprecated in favor of interactive selection
    // Automatically show the entity panel instead
    if (this.detectedEntities && this.detectedEntities.length > 0) {
      this.showEntityPanel = true;
      this.createHighlightsForEntities();
      alert(`Found ${this.detectedEntities.length} PII entities. Use the panel to select which ones to redact.`);
    } else {
      alert('No PII entities detected in the document');
    }
  }

  reprocessCurrentFile(): void {
    if (this.selectedFile) {
      this.processUploadedFile();
    } else {
      alert('No file selected. Please upload a PDF file first.');
    }
  }

  private showJobSummary(job: RedactionJobResponse): void {
    const confidenceSummary = Object.entries(job.confidence_summary)
      .map(([level, count]) => `${level}: ${count}`)
      .join(', ');

    const summary = `
Redaction Job Summary:
• Document: ${job.document_name}
• Pages: ${job.total_pages}
• PII Entities Found: ${job.total_entities}
• Processing Time: ${job.processing_time}s
• Confidence Levels: ${confidenceSummary}
• Job ID: ${job.job_id}

Redactions will be applied automatically.
    `.trim();

    alert(summary);
  }

  private getEntitySummary(): string {
    if (this.detectedEntities.length === 0) {
      return 'No PII entities detected';
    }

    const categories = this.detectedEntities.reduce((acc, entity) => {
      acc[entity.category] = (acc[entity.category] || 0) + 1;
      return acc;
    }, {} as { [key: string]: number });

    return Object.entries(categories)
      .map(([category, count]) => `${category}: ${count}`)
      .join('\n');
  }

  showJobDetails(): void {
    if (!this.currentJob) {
      alert('No job information available');
      return;
    }

    const entityCategories = this.detectedEntities.reduce((acc, entity) => {
      acc[entity.category] = (acc[entity.category] || 0) + 1;
      return acc;
    }, {} as { [key: string]: number });

    const categoryDetails = Object.entries(entityCategories)
      .map(([category, count]) => `• ${category}: ${count}`)
      .join('\n');

    const confidenceDetails = Object.entries(this.currentJob.confidence_summary)
      .map(([level, count]) => `• ${level} confidence: ${count}`)
      .join('\n');

    const details = `
Detailed Redaction Analysis:

Document Information:
• Name: ${this.currentJob.document_name}
• Pages: ${this.currentJob.total_pages}
• Job ID: ${this.currentJob.job_id}
• Processing Time: ${this.currentJob.processing_time} seconds

PII Categories Found:
${categoryDetails}

Confidence Distribution:
${confidenceDetails}

Total Entities: ${this.currentJob.total_entities}
Status: ${this.currentJob.status}
    `.trim();

    alert(details);
  }

  // Entity management methods
  private convertToExtendedEntities(entities: PIIEntity[]): ExtendedPIIEntity[] {
    return entities.map((entity, index) => ({
      ...entity,
      id: `entity-${index}-${Date.now()}`,
      selected: false,
      highlighted: false,
      hasRedaction: false,
      pageNumber: undefined // Will be determined when highlighting
    }));
  }

  private createHighlightsForEntities(): void {
    // Clear existing highlights
    this.clearAllHighlights();
    
    // Create non-redaction highlights for all entities
    this.detectedEntities.forEach((entity) => {
      this.createHighlightForEntity(entity);
    });
  }

  private createHighlightForEntity(entity: ExtendedPIIEntity): void {
    const searchMode = this.instance.Core.Search.Mode.PAGE_STOP | this.instance.Core.Search.Mode.HIGHLIGHT;
    const searchOptions = {
      caseSensitive: false,
      wholeWord: true,
      wildcard: false,
      regex: false
    };

    // Search for the entity text
    this.instance.Core.Search.textSearchInit(entity.text, searchMode, searchOptions);

    const searchListener = (searchText: string, options: any, results: any) => {
      results.forEach((result: any) => {
        const { resultCode, pageNum, quads } = result;
        
        if (resultCode === this.instance.Core.Search.ResultCode.FOUND) {
          // Create highlight annotation (not redaction)
          quads.forEach((quad: any) => {
            const highlightAnnotation = new this.Annotations.TextHighlightAnnotation({
              PageNumber: pageNum,
              Quads: [quad],
              StrokeColor: new this.Annotations.Color(255, 255, 0), // Yellow highlight
              Author: 'PII Detection',
              Subject: entity.category,
              Contents: `PII: ${entity.category} (${(entity.confidence_score * 100).toFixed(0)}% confidence)`
            });

            // Store reference for this entity
            highlightAnnotation.entityId = entity.id;
            entity.pageNumber = pageNum;
            
            this.annotationManager.addAnnotation(highlightAnnotation);
            this.highlightedAnnotations.push(highlightAnnotation);
          });
        }
      });

      this.annotationManager.redrawAnnotations();
    };

    this.instance.Core.Search.addSearchListener(searchListener);
  }

  private clearAllHighlights(): void {
    // Remove all highlight annotations
    this.highlightedAnnotations.forEach(annotation => {
      this.annotationManager.deleteAnnotation(annotation);
    });
    this.highlightedAnnotations = [];
  }

  // UI interaction methods
  toggleEntityPanel(): void {
    // Clear temporary highlights when closing panel
    if (this.showEntityPanel) {
      this.clearTemporaryHighlights();
      this.detectedEntities.forEach(e => e.highlighted = false);
    }
    
    this.showEntityPanel = !this.showEntityPanel;
  }

  getEntityCategories(): EntityCategory[] {
    const categoryMap = new Map<string, EntityCategory>();
    
    this.detectedEntities.forEach(entity => {
      const categoryName = entity.category;
      if (!categoryMap.has(categoryName)) {
        categoryMap.set(categoryName, {
          name: categoryName,
          displayName: this.formatCategoryName(categoryName),
          count: 0,
          allSelected: false,
          partialSelected: false
        });
      }
      
      const category = categoryMap.get(categoryName)!;
      category.count++;
    });

    // Update selection states
    categoryMap.forEach(category => {
      const categoryEntities = this.getEntitiesByCategory(category.name);
      const selectedCount = categoryEntities.filter(e => e.selected).length;
      
      category.allSelected = selectedCount === categoryEntities.length && selectedCount > 0;
      category.partialSelected = selectedCount > 0 && selectedCount < categoryEntities.length;
    });

    return Array.from(categoryMap.values());
  }

  getEntitiesByCategory(categoryName: string): ExtendedPIIEntity[] {
    return this.detectedEntities.filter(entity => entity.category === categoryName);
  }

  private formatCategoryName(category: string): string {
    // Convert PascalCase or camelCase to readable format
    return category.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
  }

  trackByEntity(index: number, entity: ExtendedPIIEntity): string {
    return entity.id;
  }

  toggleEntity(entity: ExtendedPIIEntity, event: any): void {
    entity.selected = event.target.checked;
    
    if (entity.selected && !entity.hasRedaction) {
      this.createRedactionForEntity(entity);
    } else if (!entity.selected && entity.hasRedaction) {
      this.removeRedactionForEntity(entity);
    }
  }

  toggleCategory(categoryName: string, event: any): void {
    const shouldSelect = event.target.checked;
    const categoryEntities = this.getEntitiesByCategory(categoryName);
    
    categoryEntities.forEach(entity => {
      entity.selected = shouldSelect;
      
      if (shouldSelect && !entity.hasRedaction) {
        this.createRedactionForEntity(entity);
      } else if (!shouldSelect && entity.hasRedaction) {
        this.removeRedactionForEntity(entity);
      }
    });
  }

  selectAllEntities(): void {
    this.detectedEntities.forEach(entity => {
      entity.selected = true;
      if (!entity.hasRedaction) {
        this.createRedactionForEntity(entity);
      }
    });
  }

  deselectAllEntities(): void {
    this.detectedEntities.forEach(entity => {
      entity.selected = false;
      if (entity.hasRedaction) {
        this.removeRedactionForEntity(entity);
      }
    });
  }

  highlightEntityInDocument(entity: ExtendedPIIEntity): void {
    // Clear previous temporary highlights
    this.clearTemporaryHighlights();
    
    // Clear previous highlight states
    this.detectedEntities.forEach(e => e.highlighted = false);
    
    // Set the entity as highlighted in the model
    entity.highlighted = true;
    
    // Create visual highlight in the WebViewer
    this.createTemporaryHighlight(entity).then(() => {
      // Navigate to the page if we know which page the entity is on
      if (entity.pageNumber) {
        this.documentViewer.setCurrentPage(entity.pageNumber);
        
        // Wait for page to load, then zoom and center
        setTimeout(() => {
          // Fit to page first for consistent starting point
          this.documentViewer.fitToPage();
          
          // Then zoom in slightly for better readability
          setTimeout(() => {
            const currentZoom = this.documentViewer.getZoom();
            this.documentViewer.zoomTo(currentZoom * 1.3);
          }, 200);
        }, 300);
      }
      
      // Remove the highlight after a delay
      setTimeout(() => {
        entity.highlighted = false;
        this.clearTemporaryHighlights();
      }, 3000);
    });
  }

  private createTemporaryHighlight(entity: ExtendedPIIEntity): Promise<void> {
    return new Promise((resolve) => {
      const searchMode = this.instance.Core.Search.Mode.PAGE_STOP;
      const searchOptions = {
        caseSensitive: false,
        wholeWord: false, // Use false for better matching
        wildcard: false,
        regex: false
      };

      // Create a unique search listener for this operation
      const searchListener = (searchText: string, options: any, results: any) => {
        let highlightCreated = false;
        
        results.forEach((result: any) => {
          const { resultCode, pageNum, quads } = result;
          
          if (resultCode === this.instance.Core.Search.ResultCode.FOUND && !highlightCreated) {
            // Create a bright, temporary highlight
            quads.forEach((quad: any) => {
              const tempHighlight = new this.Annotations.TextHighlightAnnotation({
                PageNumber: pageNum,
                Quads: [quad],
                StrokeColor: new this.Annotations.Color(255, 165, 0), // Orange stroke
                FillColor: new this.Annotations.Color(255, 165, 0, 0.5), // Semi-transparent orange fill
                Author: 'Temporary Highlight',
                Subject: 'Selected Entity',
                Contents: `Selected: ${entity.category} - ${entity.text}`
              });

              // Mark this as a temporary highlight
              tempHighlight.isTemporary = true;
              tempHighlight.entityId = entity.id;
              
              this.annotationManager.addAnnotation(tempHighlight);
              this.temporaryHighlights.push(tempHighlight);
              
              // Update entity page number if not set
              if (!entity.pageNumber) {
                entity.pageNumber = pageNum;
              }
              
              highlightCreated = true;
            });
          }
        });

        this.annotationManager.redrawAnnotations();
        
        // Remove this specific search listener
        this.instance.Core.Search.removeSearchListener(searchListener);
        resolve();
      };

      // Add the search listener and start search
      this.instance.Core.Search.addSearchListener(searchListener);
      this.instance.Core.Search.textSearchInit(entity.text, searchMode, searchOptions);
    });
  }

  private clearTemporaryHighlights(): void {
    try {
      // Remove all temporary highlight annotations
      if (this.annotationManager && this.temporaryHighlights) {
        this.temporaryHighlights.forEach(annotation => {
          this.annotationManager.deleteAnnotation(annotation);
        });
        this.temporaryHighlights = [];
        this.annotationManager.redrawAnnotations();
      }
    } catch (error) {
      console.error('Error clearing temporary highlights:', error);
    }
  }

  // Enhanced method to highlight all instances of a specific entity text
  highlightAllInstancesOfEntity(entity: ExtendedPIIEntity): void {
    this.clearTemporaryHighlights();
    
    // Set highlighted state
    this.detectedEntities.forEach(e => e.highlighted = false);
    entity.highlighted = true;
    
    this.createAllInstancesHighlight(entity).then((foundInstances) => {
      if (foundInstances > 0) {
        // Navigate to the first instance
        if (entity.pageNumber) {
          this.documentViewer.setCurrentPage(entity.pageNumber);
          
          // Fit page and center on content
          setTimeout(() => {
            this.documentViewer.fitToPage();
          }, 300);
        }
        
        alert(`Highlighted ${foundInstances} instance(s) of "${entity.text}" in the document.`);
      } else {
        alert(`Could not find "${entity.text}" in the document.`);
      }
      
      // Clear highlights after delay
      setTimeout(() => {
        entity.highlighted = false;
        this.clearTemporaryHighlights();
      }, 5000);
    });
  }

  private createAllInstancesHighlight(entity: ExtendedPIIEntity): Promise<number> {
    return new Promise((resolve) => {
      const searchMode = this.instance.Core.Search.Mode.PAGE_STOP;
      const searchOptions = {
        caseSensitive: false,
        wholeWord: false,
        wildcard: false,
        regex: false
      };

      let foundInstances = 0;
      let firstPageFound: number | null = null;

      const searchListener = (searchText: string, options: any, results: any) => {
        results.forEach((result: any) => {
          const { resultCode, pageNum, quads } = result;
          
          if (resultCode === this.instance.Core.Search.ResultCode.FOUND) {
            foundInstances++;
            
            // Remember the first page where we found the entity
            if (firstPageFound === null) {
              firstPageFound = pageNum;
              entity.pageNumber = pageNum;
            }
            
            // Create highlight for each instance
            quads.forEach((quad: any, index: number) => {
              const tempHighlight = new this.Annotations.TextHighlightAnnotation({
                PageNumber: pageNum,
                Quads: [quad],
                StrokeColor: new this.Annotations.Color(255, 20, 147), // Deep pink stroke
                FillColor: new this.Annotations.Color(255, 20, 147, 0.3), // Semi-transparent pink fill
                Author: 'Entity Highlight',
                Subject: entity.category,
                Contents: `${entity.category}: ${entity.text} (Instance ${foundInstances})`
              });

              tempHighlight.isTemporary = true;
              tempHighlight.entityId = entity.id;
              
              this.annotationManager.addAnnotation(tempHighlight);
              this.temporaryHighlights.push(tempHighlight);
            });
          }
        });

        this.annotationManager.redrawAnnotations();
        
        // Remove this specific search listener
        this.instance.Core.Search.removeSearchListener(searchListener);
        resolve(foundInstances);
      };

      // Add the search listener and start search
      this.instance.Core.Search.addSearchListener(searchListener);
      this.instance.Core.Search.textSearchInit(entity.text, searchMode, searchOptions);
    });
  }

  toggleEntityRedaction(entity: ExtendedPIIEntity): void {
    entity.selected = !entity.selected;
    
    if (entity.selected && !entity.hasRedaction) {
      this.createRedactionForEntity(entity);
    } else if (!entity.selected && entity.hasRedaction) {
      this.removeRedactionForEntity(entity);
    }
  }

  private createRedactionForEntity(entity: ExtendedPIIEntity): void {
    const searchMode = this.instance.Core.Search.Mode.PAGE_STOP;
    const searchOptions = {
      caseSensitive: false,
      wholeWord: true,
      wildcard: false,
      regex: false
    };

    this.instance.Core.Search.textSearchInit(entity.text, searchMode, searchOptions);

    const searchListener = (searchText: string, options: any, results: any) => {
      results.forEach((result: any) => {
        const { resultCode, pageNum, quads } = result;
        
        if (resultCode === this.instance.Core.Search.ResultCode.FOUND) {
          quads.forEach((quad: any) => {
            const redactionAnnotation = new this.Annotations.RedactionAnnotation({
              PageNumber: pageNum,
              Quads: [quad],
              StrokeColor: new this.Annotations.Color(255, 0, 0),
              FillColor: new this.Annotations.Color(0, 0, 0),
              TextColor: new this.Annotations.Color(255, 255, 255),
              OverlayText: `[${this.formatCategoryName(entity.category)}]`,
              FontSize: '12pt'
            });

            redactionAnnotation.entityId = entity.id;
            this.annotationManager.addAnnotation(redactionAnnotation);
            this.redactionAnnotations.set(entity.id, redactionAnnotation);
            entity.hasRedaction = true;
          });
        }
      });

      this.annotationManager.redrawAnnotations();
    };

    this.instance.Core.Search.addSearchListener(searchListener);
  }

  private removeRedactionForEntity(entity: ExtendedPIIEntity): void {
    const redactionAnnotation = this.redactionAnnotations.get(entity.id);
    if (redactionAnnotation) {
      this.annotationManager.deleteAnnotation(redactionAnnotation);
      this.redactionAnnotations.delete(entity.id);
      entity.hasRedaction = false;
      this.annotationManager.redrawAnnotations();
    }
  }

  getSelectedEntityCount(): number {
    return this.detectedEntities.filter(entity => entity.selected).length;
  }

  applySelectedRedactions(): void {
    const selectedEntities = this.detectedEntities.filter(entity => entity.selected);
    
    if (selectedEntities.length === 0) {
      alert('No entities selected for redaction');
      return;
    }

    // Ensure all selected entities have redaction annotations
    selectedEntities.forEach(entity => {
      if (!entity.hasRedaction) {
        this.createRedactionForEntity(entity);
      }
    });

    setTimeout(() => {
      alert(`Applied redactions for ${selectedEntities.length} selected PII entities. Use "Apply All Redactions" in the toolbar to finalize the document.`);
    }, 500);
  }

  clearAllRedactionsConfirm(): void {
    if (confirm('Are you sure you want to clear all redactions? This action cannot be undone.')) {
      this.clearAllRedactions();
    }
  }

  private clearAllRedactions(): void {
    // Clear all redaction annotations
    const allRedactions = this.annotationManager.getAnnotationsList()
      .filter((annot: any) => annot instanceof this.Annotations.RedactionAnnotation);
    
    this.annotationManager.deleteAnnotations(allRedactions);
    
    // Reset entity states
    this.detectedEntities.forEach(entity => {
      entity.selected = false;
      entity.hasRedaction = false;
    });
    
    // Clear redaction tracking
    this.redactionAnnotations.clear();
    
    this.annotationManager.redrawAnnotations();
    alert('All redactions cleared');
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  private async searchAndRedactPII(): Promise<void> {
    if (!this.documentViewer.getDocument()) {
      alert('Please load a document first');
      return;
    }

    try {
      // Extract text from the current document
      const text = await this.extractDocumentText();
      
      if (!text) {
        alert('No text found in document');
        return;
      }

      // Send text to backend for PII analysis
      this.redactionService.analyzeText(text).subscribe({
        next: (response) => {
          this.detectedEntities = this.convertToExtendedEntities(response.entities);
          this.showEntityPanel = true;
          this.createHighlightsForEntities();
          
          alert(`Found ${response.total_entities} PII entities. Use the panel to select which ones to redact.`);
        },
        error: (error) => {
          console.error('Error analyzing text:', error);
          alert('Error analyzing document for PII. Please try again.');
        }
      });

    } catch (error) {
      console.error('Error extracting text:', error);
      alert('Error extracting text from document');
    }
  }

  private async extractDocumentText(): Promise<string> {
    const doc = this.documentViewer.getDocument();
    const pageCount = doc.getPageCount();
    let fullText = '';

    for (let i = 1; i <= pageCount; i++) {
      const pageText = await doc.getPageText(i);
      fullText += pageText + '\n';
    }

    return fullText;
  }

  private async applyRedactions(): Promise<void> {
    try {
      // Get all redaction annotations
      const redactionAnnotations = this.annotationManager.getAnnotationsList()
        .filter((annot: any) => annot instanceof this.Annotations.RedactionAnnotation);

      if (redactionAnnotations.length === 0) {
        alert('No redactions found. Please search for PII first.');
        return;
      }

      // Apply redactions to the document
      const doc = this.documentViewer.getDocument();
      const data = await doc.getFileData({
        // This will burn in the redactions
        xfdfString: await this.annotationManager.exportAnnotations(),
        flatten: true
      });

      // Create download link for the redacted document
      const blob = new Blob([data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'redacted_document.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      alert('Redactions applied and document downloaded!');

    } catch (error) {
      console.error('Error applying redactions:', error);
      alert('Error applying redactions. Please try again.');
    }
  }
}