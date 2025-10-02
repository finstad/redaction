from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import asyncio
import fitz
import tempfile
import os
from azure.ai.textanalytics.aio import TextAnalyticsClient
from azure.core.credentials import AzureKeyCredential
from dotenv import load_dotenv
from typing import List, Dict
from pydantic import BaseModel

load_dotenv()

app = FastAPI(title="Document Redaction API")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200"],  # Angular dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Azure credentials
language_key = os.getenv('LANGUAGE_KEY')
language_endpoint = os.getenv('LANGUAGE_ENDPOINT')

class TextAnalysisRequest(BaseModel):
    text: str

class PIIEntity(BaseModel):
    text: str
    category: str
    subcategory: str
    confidence_score: float
    offset: int
    length: int

class PIIAnalysisResponse(BaseModel):
    entities: List[PIIEntity]
    redacted_text: str
    total_entities: int
    processing_time: float
    confidence_summary: Dict[str, int]

class RedactionJobResponse(BaseModel):
    job_id: str
    status: str
    document_name: str
    total_pages: int
    entities: List[PIIEntity]
    redacted_text: str
    total_entities: int
    processing_time: float
    confidence_summary: Dict[str, int]

def authenticate_client():
    ta_credential = AzureKeyCredential(language_key)
    text_analytics_client = TextAnalyticsClient(
        endpoint=language_endpoint, 
        credential=ta_credential
    )
    return text_analytics_client

async def analyze_pii_in_text(client, text_content: str) -> PIIAnalysisResponse:
    """Analyze text for PII entities using Azure Text Analytics."""
    import time
    start_time = time.time()
    
    try:
        # Split large text into chunks if necessary
        max_chunk_size = 5000
        chunks = []
        
        if len(text_content) <= max_chunk_size:
            chunks = [text_content]
        else:
            # Split into smaller chunks
            words = text_content.split()
            current_chunk = []
            current_length = 0
            
            for word in words:
                word_length = len(word) + 1
                if current_length + word_length > max_chunk_size and current_chunk:
                    chunks.append(" ".join(current_chunk))
                    current_chunk = [word]
                    current_length = word_length
                else:
                    current_chunk.append(word)
                    current_length += word_length
            
            if current_chunk:
                chunks.append(" ".join(current_chunk))
        
        all_entities = []
        redacted_text = text_content
        confidence_summary = {}
        
        for chunk in chunks:
            response = await client.recognize_pii_entities([chunk], language="en")
            
            for doc in response:
                if not doc.is_error:
                    redacted_text = doc.redacted_text
                    for entity in doc.entities:
                        # Count confidence levels
                        confidence_level = "high" if entity.confidence_score >= 0.8 else "medium" if entity.confidence_score >= 0.6 else "low"
                        confidence_summary[confidence_level] = confidence_summary.get(confidence_level, 0) + 1
                        
                        all_entities.append(PIIEntity(
                            text=entity.text,
                            category=entity.category,
                            subcategory=entity.subcategory or "",
                            confidence_score=entity.confidence_score,
                            offset=entity.offset,
                            length=entity.length
                        ))
        
        processing_time = time.time() - start_time
        
        return PIIAnalysisResponse(
            entities=all_entities,
            redacted_text=redacted_text,
            total_entities=len(all_entities),
            processing_time=round(processing_time, 2),
            confidence_summary=confidence_summary
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error analyzing text: {str(e)}")

@app.get("/")
async def root():
    return {"message": "Document Redaction API"}

@app.post("/analyze-text", response_model=PIIAnalysisResponse)
async def analyze_text(request: TextAnalysisRequest):
    """Analyze text content for PII entities."""
    client = authenticate_client()
    try:
        result = await analyze_pii_in_text(client, request.text)
        return result
    finally:
        await client.close()

@app.post("/analyze-pdf", response_model=RedactionJobResponse)
async def analyze_pdf(file: UploadFile = File(...)):
    """Upload and analyze a PDF file for PII entities - returns a redaction job."""
    import uuid
    import time
    
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")
    
    job_id = str(uuid.uuid4())
    start_time = time.time()
    
    # Save uploaded file temporarily
    with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as tmp_file:
        content = await file.read()
        tmp_file.write(content)
        tmp_path = tmp_file.name
    
    try:
        # Extract text from PDF and get page count
        doc = fitz.open(tmp_path)
        text_content = []
        total_pages = len(doc)
        
        for page_num in range(total_pages):
            page = doc.load_page(page_num)
            text = page.get_text()
            if text.strip():
                text_content.append(text)
        
        doc.close()
        full_text = "\n\n--- Page Break ---\n\n".join(text_content)
        
        if not full_text.strip():
            raise HTTPException(status_code=400, detail="No text content found in PDF")
        
        # Analyze extracted text
        client = authenticate_client()
        try:
            analysis_result = await analyze_pii_in_text(client, full_text)
            
            return RedactionJobResponse(
                job_id=job_id,
                status="completed",
                document_name=file.filename,
                total_pages=total_pages,
                entities=analysis_result.entities,
                redacted_text=analysis_result.redacted_text,
                total_entities=analysis_result.total_entities,
                processing_time=analysis_result.processing_time,
                confidence_summary=analysis_result.confidence_summary
            )
        finally:
            await client.close()
    
    finally:
        # Clean up temporary file
        os.unlink(tmp_path)

@app.get("/redaction-job/{job_id}")
async def get_redaction_job(job_id: str):
    """Get redaction job status (placeholder for future job tracking)."""
    # This could be enhanced to track actual job status in a database
    return {"job_id": job_id, "status": "completed", "message": "Job tracking not implemented yet"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)