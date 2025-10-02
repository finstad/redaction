import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface PIIEntity {
  text: string;
  category: string;
  subcategory: string;
  confidence_score: number;
  offset: number;
  length: number;
}

export interface PIIAnalysisResponse {
  entities: PIIEntity[];
  redacted_text: string;
  total_entities: number;
  processing_time: number;
  confidence_summary: { [key: string]: number };
}

export interface RedactionJobResponse {
  job_id: string;
  status: string;
  document_name: string;
  total_pages: number;
  entities: PIIEntity[];
  redacted_text: string;
  total_entities: number;
  processing_time: number;
  confidence_summary: { [key: string]: number };
}

export interface TextAnalysisRequest {
  text: string;
}

@Injectable({
  providedIn: 'root'
})
export class RedactionService {
  private apiUrl = 'http://localhost:8000';

  constructor(private http: HttpClient) { }

  analyzeText(text: string): Observable<PIIAnalysisResponse> {
    const request: TextAnalysisRequest = { text };
    return this.http.post<PIIAnalysisResponse>(`${this.apiUrl}/analyze-text`, request);
  }

  analyzePdf(file: File): Observable<RedactionJobResponse> {
    console.log('RedactionService.analyzePdf called with file:', file.name);
    console.log('File details:', { name: file.name, size: file.size, type: file.type });
    console.log('API URL:', this.apiUrl);
    
    const formData = new FormData();
    formData.append('file', file);
    
    // Debug FormData content
    console.log('FormData created');
    for (let pair of formData.entries()) {
      console.log('FormData entry:', pair[0], pair[1]);
    }
    
    const url = `${this.apiUrl}/analyze-pdf`;
    console.log('Making HTTP request to:', url);
    
    return this.http.post<RedactionJobResponse>(url, formData);
  }

  getRedactionJob(jobId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/redaction-job/${jobId}`);
  }
}