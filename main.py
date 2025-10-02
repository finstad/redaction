import os
import sys
import asyncio
import fitz
from azure.ai.textanalytics.aio import TextAnalyticsClient
from azure.ai.textanalytics import RecognizePiiEntitiesResult

from azure.core.credentials import AzureKeyCredential
from dotenv import load_dotenv

load_dotenv()

# This example requires environment variables named "LANGUAGE_KEY" and "LANGUAGE_ENDPOINT"
language_key = os.getenv('LANGUAGE_KEY')
language_endpoint = os.getenv('LANGUAGE_ENDPOINT')

print(language_key)
print(language_endpoint)
# Authenticate the client using your key and endpoint 
def authenticate_client():
    ta_credential = AzureKeyCredential(language_key)
    text_analytics_client = TextAnalyticsClient(
            endpoint=language_endpoint, 
            credential=ta_credential)
    return text_analytics_client


def extract_text_from_pdf(pdf_path):
    """Extract text from PDF file using PyMuPDF."""
    try:
        # Open the PDF file
        doc = fitz.open(pdf_path)
        text_content = []
        
        # Extract text from each page
        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            text = page.get_text()
            if text.strip():  # Only add non-empty text
                text_content.append(text)
        
        doc.close()
        
        # Join all pages with a separator
        full_text = "\n\n--- Page Break ---\n\n".join(text_content)
        return full_text
    
    except Exception as e:
        print(f"Error extracting text from PDF: {e}")
        return None


# Method for detecting sensitive information (PII) from text 
async def pii_recognition_example(client, text_content=None):
    """
    Detect PII in provided text content or use default examples.
    
    Args:
        client: Azure Text Analytics client
        text_content: String containing text to analyze for PII
    """
    if text_content:
        # Split large text into chunks (Azure has limits on document size)
        max_chunk_size = 5000  # Conservative limit
        chunks = []
        
        if len(text_content) <= max_chunk_size:
            chunks = [text_content]
        else:
            # Split into smaller chunks
            words = text_content.split()
            current_chunk = []
            current_length = 0
            
            for word in words:
                word_length = len(word) + 1  # +1 for space
                if current_length + word_length > max_chunk_size and current_chunk:
                    chunks.append(" ".join(current_chunk))
                    current_chunk = [word]
                    current_length = word_length
                else:
                    current_chunk.append(word)
                    current_length += word_length
            
            if current_chunk:
                chunks.append(" ".join(current_chunk))
        
        documents = chunks
    else:
        # Default example documents
        documents = [
            "Theemployee's SSN is 859-98-0987.",
            "The employee's phone number is 555-555-5555."
        ]
    
    print(f"Analyzing {len(documents)} document chunk(s) for PII...")
    
    response = await client.recognize_pii_entities(documents, language="en", show_stats=True)
    result = [doc for doc in response if not doc.is_error]

    print(f"Response {response}")

    x: RecognizePiiEntitiesResult = response[0]
    
    print(f"x: {x.__dict__}")
    total_entities_found = 0
    for i, doc in enumerate(result):
        if len(documents) > 1:
            print(f"\n--- Chunk {i+1} Results ---")
        # print("Redacted Text: {}".format(doc.redacted_text))
        
        if doc.entities:
            total_entities_found += len(doc.entities)
            for entity in doc.entities:
                print(entity)
        else:
            print("No PII entities found in this chunk.")
    
    print(f"\nTotal PII entities found: {total_entities_found}")


async def main():
    """Main function to run the PII recognition example."""
    client = authenticate_client()
    
    try:
        # Check if PDF file path is provided as command line argument
        if len(sys.argv) > 1:
            pdf_path = sys.argv[1]
            print(f"Processing PDF file: {pdf_path}")
            
            # Check if file exists
            if not os.path.exists(pdf_path):
                print(f"Error: PDF file '{pdf_path}' not found.")
                return
            
            # Extract text from PDF
            print("Extracting text from PDF...")
            pdf_text = extract_text_from_pdf(pdf_path)
            
            if pdf_text:
                print(f"Successfully extracted {len(pdf_text)} characters from PDF.")
                print("Running PII detection on extracted text...\n")
                await pii_recognition_example(client, pdf_text)
            else:
                print("Failed to extract text from PDF.")
        else:
            print("No PDF file provided. Running with example text...")
            await pii_recognition_example(client)
            print("\nUsage: python main.py <path_to_pdf_file>")
    
    finally:
        await client.close()


if __name__ == "__main__":
    asyncio.run(main()) 

